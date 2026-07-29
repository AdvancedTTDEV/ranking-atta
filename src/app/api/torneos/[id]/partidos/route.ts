import prisma from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { crucesRoundRobin } from '@/lib/seed'
import { OFFSET_MANUAL, calcularEstadisticas, compararRatio, calcularClasificacionGrupo, PosicionManual, PartidoParaTabla } from '@/lib/empates'

interface RouteParams { params: Promise<{ id: string }> }

const participantesInclude = {
    miembros: {
        orderBy: { orden: 'asc' as const },
        include: { jugadores: { include: { clubes: true } } }
    },
    jugadores: { include: { clubes: true } }
}

const participantesIncludeLite = {
    miembros: {
        orderBy: { orden: 'asc' as const },
        include: { jugadores: { select: { id: true, nombre: true } } }
    },
    jugadores: { select: { id: true, nombre: true } }
}

export async function GET(request: Request, { params }: RouteParams) {
    try {
        const { id } = await params
        const torneoId = Number(id)
        const url = new URL(request.url)
        const categoriaParam = url.searchParams.get('categoriaId')
        // `lite=true` salta los `detalles` y los `sets` anidados. Lo consume
        // PartidosSection, que solo lista los partidos y abre un modal con
        // el detalle cargado bajo demanda. Sin esto, la vista global de un
        // torneo con muchos grupos puede superar el timeout serverless de
        // Vercel (10s) y devolver HTML de error en vez de JSON.
        const lite = url.searchParams.get('lite') === 'true'
        if (!torneoId) return NextResponse.json({ error: 'Falta torneo' }, { status: 400 })
        // categoriaId ahora es opcional. Si no viene, devolvemos los partidos de
        // todas las categorías del torneo (modo "recopilatorio" / vista global).
        const categoriaIdFiltro = categoriaParam ? Number(categoriaParam) : null

        const whereCategoria = categoriaIdFiltro
            ? { torneo_id: torneoId, categoria_id: categoriaIdFiltro }
            : { torneo_id: torneoId, grupo_id: { not: null } }

        const partidos = await prisma.torneo_partidos_programados.findMany({
            where: whereCategoria,
            orderBy: [{ categoria_id: 'asc' }, { grupo_id: 'asc' }, { orden: 'asc' }],
            include: lite
                ? {
                    torneo_grupos: true,
                    participante_local: { include: participantesIncludeLite },
                    participante_visitante: { include: participantesIncludeLite },
                    arbitro: true,
                }
                : {
                    torneo_grupos: true,
                    participante_local: { include: participantesInclude },
                    participante_visitante: { include: participantesInclude },
                    arbitro: true,
                    sets: { orderBy: { numero: 'asc' } },
                    detalles: {
                        orderBy: { orden: 'asc' },
                        include: {
                            jugadores: { orderBy: { orden: 'asc' }, include: { jugadores: true } },
                            sets: { orderBy: { numero: 'asc' } }
                        }
                    }
                }
        })
        const grupos = new Map<number, { numero: number; ids: Set<number>; nombres: Map<number, string>; partidos: typeof partidos; categoria_id: number; posicionesManual: Map<number, number> }>()
        // Leemos las posiciones manuales que el operador haya asignado
        // previamente (PUT /torneos/[id]/grupos/[grupoId]/posiciones).
        // Se consultan todas en una sola query para no hacer N+1.
        const grupoIds = [...new Set(
            partidos.map(p => p.torneo_grupos?.id).filter((id): id is number => typeof id === 'number')
        )]
        const grupoParticipantes = grupoIds.length > 0
            ? await prisma.torneo_grupo_participantes.findMany({
                where: { grupo_id: { in: grupoIds } },
                select: { grupo_id: true, torneo_participante_id: true, posicion: true }
            })
            : []
        const manualPorGrupo = new Map<number, Map<number, number>>()
        for (const item of grupoParticipantes) {
            if (item.posicion == null) continue
            const map = manualPorGrupo.get(item.grupo_id) || new Map<number, number>()
            map.set(item.torneo_participante_id, item.posicion)
            manualPorGrupo.set(item.grupo_id, map)
        }
        for (const partido of partidos) {
            if (!partido.torneo_grupos) continue
            const grupo = grupos.get(partido.torneo_grupos.id) || {
                numero: partido.torneo_grupos.numero_grupo,
                ids: new Set<number>(), nombres: new Map<number, string>(), partidos: [] as typeof partidos,
                categoria_id: partido.categoria_id,
                posicionesManual: manualPorGrupo.get(partido.torneo_grupos.id) || new Map<number, number>()
            }
            if (!partido.participante_local || !partido.participante_visitante || !partido.participante_local_id || !partido.participante_visitante_id) continue
            const nombre = (participante: NonNullable<typeof partido.participante_local>) => participante.nombre_personalizado
                || participante.miembros.map(miembro => miembro.jugadores.nombre).join(' / ')
                || participante.jugadores?.nombre
                || 'Participante'
            grupo.ids.add(partido.participante_local_id)
            grupo.ids.add(partido.participante_visitante_id)
            grupo.nombres.set(partido.participante_local_id, nombre(partido.participante_local))
            grupo.nombres.set(partido.participante_visitante_id, nombre(partido.participante_visitante))
            grupo.partidos.push(partido)
            grupos.set(partido.torneo_grupos.id, grupo)
        }

        const clasificaciones = [...grupos.entries()].map(([grupoId, grupo]) => {
            const ids = [...grupo.ids]
            // El helper `calcularEstadisticas` está tipado para `PartidoParaTabla`
            // (que incluye sets), pero en modo lite no los traemos. El cálculo
            // funciona igual con un array vacío de sets, así que casteamos.
            const partidosParaCalculo = lite
                ? grupo.partidos.map(partido => ({ ...partido, sets: [] as { puntos_local: number; puntos_visitante: number }[] }))
                : grupo.partidos as unknown as never[]
            const globales = calcularEstadisticas(ids, partidosParaCalculo as never)
            const { orden, pendientes: pendientesIds } = calcularClasificacionGrupo(
                ids, partidosParaCalculo as never, grupo.posicionesManual
            )
            const pendientes = new Set<number>(pendientesIds)

            // Calculamos la "posición real" del ranking. Para los participantes
            // que el sistema no puede desempatar, todos comparten la posición
            // del primero del bloque (en vez de inventar 2°, 3°, 4°). El
            // siguiente no-empatado salta al puesto siguiente al bloque.
            // Mantenemos `posicion: index + 1` como ordinal estable para
            // consumidores que iteran la lista, y exponemos `posicion_empatada`
            // como la "posición real" (que puede repetirse en empates).
            //
            // Para los pendientes, la posición compartida es la del primero
            // del bloque. Como `orden` ya está ordenado por estadísticas
            // (V → ratio de sets → ratio de puntos), un bloque de empate es
            // una secuencia contigua de IDs con las mismas stats. Retrocedo
            // mientras el anterior tenga las mismas stats Y sea pendiente.
            const posiciones = orden.map((participanteId, index) => {
                const esPendiente = pendientes.has(participanteId)
                let posicionEmpatada: number
                if (!esPendiente) {
                    posicionEmpatada = index + 1
                } else {
                    const statsActuales = globales.get(participanteId)!
                    let i = index
                    while (i > 0 && pendientes.has(orden[i - 1])) {
                        const statsAnterior = globales.get(orden[i - 1])!
                        // Mismo bloque solo si tienen idénticas stats
                        const mismoRatioSets = compararRatio(statsActuales.setsFavor, statsActuales.setsContra, statsAnterior.setsFavor, statsAnterior.setsContra) === 0
                        const mismoRatioPuntos = compararRatio(statsActuales.puntosFavor, statsActuales.puntosContra, statsAnterior.puntosFavor, statsAnterior.puntosContra) === 0
                        if (!mismoRatioSets || !mismoRatioPuntos) break
                        i--
                    }
                    posicionEmpatada = i + 1
                }
                return {
                    posicion: index + 1,
                    posicion_empatada: posicionEmpatada,
                    participante_id: participanteId,
                    nombre: grupo.nombres.get(participanteId),
                    ...globales.get(participanteId),
                    requiere_decision_manual: esPendiente
                }
            })
            return {
                grupoId,
                categoria_id: grupo.categoria_id,
                numero_grupo: grupo.numero,
                pendientes_manual: [...pendientes],
                posiciones
            }
        })
        return NextResponse.json({ partidos, clasificaciones })
    } catch (error: any) {
        return NextResponse.json({ error: 'Error al obtener partidos', detalles: error.message }, { status: 500 })
    }
}

export async function POST(request: Request, { params }: RouteParams) {
    try {
        const { id } = await params
        const torneoId = Number(id)
        const body = await request.json() as {
            categoriaId: number
            partidos?: { grupo_id: number; participante_local_id: number; participante_visitante_id: number; arbitro_jugador_id: number | null; orden: number }[]
        }
        const { categoriaId, partidos: partidosSeleccionados } = body
        if (!torneoId || !categoriaId) return NextResponse.json({ error: 'Falta torneo o categoría' }, { status: 400 })

        const torneo = await prisma.torneos.findUnique({ where: { id: torneoId }, select: { modalidad: true } })
        if (!torneo) return NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 })

        const grupos = await prisma.torneo_grupos.findMany({
            where: { torneo_id: torneoId, categoria_id: Number(categoriaId) },
            orderBy: { numero_grupo: 'asc' },
            include: {
                participantes: {
                    orderBy: { posicion: 'asc' },
                    include: { torneo_participantes: { include: participantesInclude } }
                }
            }
        })

        if (grupos.length === 0) return NextResponse.json({ error: 'Primero genera los grupos de esta categoría' }, { status: 400 })
        if (grupos.some(grupo => grupo.participantes.length < 2)) {
            return NextResponse.json({ error: 'Cada grupo necesita al menos dos participantes' }, { status: 400 })
        }

        // Calculamos el universo completo de cruces en servidor con
        // round-robin para que la siembra no repita jugadores en cruces
        // consecutivos. La modal de previsualización muestra los checkboxes
        // en este mismo orden, y el POST recibe un subconjunto para crear
        // solamente los seleccionados.
        const todosLosPartidos: {
            grupo_id: number; participante_local_id: number; participante_visitante_id: number; arbitro_jugador_id: number | null
        }[] = []
        for (const grupo of grupos) {
            const ids = grupo.participantes.map(p => p.torneo_participantes.id)
            const ordenCruces = crucesRoundRobin(ids)
            for (const [localId, visitanteId] of ordenCruces) {
                const local = grupo.participantes.find(p => p.torneo_participantes.id === localId)!.torneo_participantes
                const visitante = grupo.participantes.find(p => p.torneo_participantes.id === visitanteId)!.torneo_participantes
                const idsEnJuego = new Set([
                    ...local.miembros.map(miembro => miembro.jugador_id),
                    ...visitante.miembros.map(miembro => miembro.jugador_id)
                ])
                const arbitrosDisponibles = grupo.participantes
                    .flatMap(item => item.torneo_participantes.miembros.map(miembro => miembro.jugadores))
                    .filter(jugador => !idsEnJuego.has(jugador.id))
                todosLosPartidos.push({
                    grupo_id: grupo.id,
                    participante_local_id: local.id,
                    participante_visitante_id: visitante.id,
                    arbitro_jugador_id: arbitrosDisponibles[0]?.id ?? null
                })
            }
        }

        // Si el cliente no envía selección, mantenemos el comportamiento
        // histórico: generar todos los cruces, asignando árbitros por
        // rotación (orden por aparición).
        type NuevoPartido = {
            grupo_id: number
            participante_local_id: number
            participante_visitante_id: number
            arbitro_jugador_id: number | null
            orden: number
        }
        const nuevosPartidos: NuevoPartido[] = []
        if (partidosSeleccionados && Array.isArray(partidosSeleccionados)) {
            // Asignamos un `orden` estable por grupo: ordenamos por grupo y por
            // orden del cliente si lo trae, si no por el orden de aparición.
            const porGrupo = new Map<number, typeof partidosSeleccionados>()
            partidosSeleccionados.forEach(item => {
                const arr = porGrupo.get(item.grupo_id) || []
                arr.push(item)
                porGrupo.set(item.grupo_id, arr)
            })
            porGrupo.forEach((items, grupoId) => {
                const validos = items.filter(item =>
                    grupoTieneParticipante(grupos, grupoId, item.participante_local_id) &&
                    grupoTieneParticipante(grupos, grupoId, item.participante_visitante_id)
                )
                validos.forEach((item, index) => {
                    nuevosPartidos.push({
                        grupo_id: item.grupo_id,
                        participante_local_id: item.participante_local_id,
                        participante_visitante_id: item.participante_visitante_id,
                        arbitro_jugador_id: item.arbitro_jugador_id ?? null,
                        orden: index + 1
                    })
                })
            })
        } else {
            // Back-compat: generar todos con rotación de árbitros
            const contadores = new Map<number, number>()
            for (const item of todosLosPartidos) {
                const idx = contadores.get(item.grupo_id) || 0
                contadores.set(item.grupo_id, idx + 1)
                // Buscar arbitros disponibles del grupo en cada vuelta
                const grupo = grupos.find(g => g.id === item.grupo_id)
                if (!grupo) continue
                const local = grupo.participantes.find(p => p.torneo_participantes.id === item.participante_local_id)?.torneo_participantes
                const visitante = grupo.participantes.find(p => p.torneo_participantes.id === item.participante_visitante_id)?.torneo_participantes
                if (!local || !visitante) continue
                const idsEnJuego = new Set([
                    ...local.miembros.map(m => m.jugador_id),
                    ...visitante.miembros.map(m => m.jugador_id)
                ])
                const arbitrosDisponibles = grupo.participantes
                    .flatMap(p => p.torneo_participantes.miembros.map(m => m.jugadores))
                    .filter(j => !idsEnJuego.has(j.id))
                nuevosPartidos.push({
                    grupo_id: item.grupo_id,
                    participante_local_id: item.participante_local_id,
                    participante_visitante_id: item.participante_visitante_id,
                    arbitro_jugador_id: arbitrosDisponibles[idx % Math.max(arbitrosDisponibles.length, 1)]?.id ?? null,
                    orden: idx + 1
                })
            }
        }

        await prisma.$transaction(async tx => {
            const finalizados = await tx.torneo_partidos_programados.count({
                where: { torneo_id: torneoId, categoria_id: Number(categoriaId), grupo_id: { not: null }, estado: 'FINALIZADO' }
            })
            if (finalizados > 0) throw new Error('No se pueden regenerar partidos que ya tienen resultados')
            // Limpiamos la `posicion` de los participantes del grupo. La
            // siembra inicial ya cumplió su rol al armar los grupos; al
            // iniciar los partidos ese orden debe dejar de contar como
            // "manual" para no contaminar el cálculo de desempate. Si
            // el operador ya había resuelto un empate, se borra
            // (consistente con que también se borran los partidos).
            await tx.torneo_grupo_participantes.updateMany({
                where: { grupo_id: { in: grupos.map(grupo => grupo.id) } },
                data: { posicion: null }
            })
            await tx.torneo_partidos_programados.deleteMany({
                where: { torneo_id: torneoId, categoria_id: Number(categoriaId), grupo_id: { not: null } }
            })
            if (nuevosPartidos.length === 0) return
            await tx.torneo_partidos_programados.createMany({
                data: nuevosPartidos.map(item => ({
                    torneo_id: torneoId,
                    categoria_id: Number(categoriaId),
                    grupo_id: item.grupo_id,
                    participante_local_id: item.participante_local_id,
                    participante_visitante_id: item.participante_visitante_id,
                    arbitro_jugador_id: item.arbitro_jugador_id,
                    orden: item.orden
                }))
            })

            if (torneo.modalidad === 'EQUIPOS') {
                const creados = await tx.torneo_partidos_programados.findMany({
                    where: { torneo_id: torneoId, categoria_id: Number(categoriaId), grupo_id: { in: grupos.map(grupo => grupo.id) } },
                    select: { id: true }
                })
                await tx.torneo_partido_detalles.createMany({
                    data: creados.flatMap(partido => [
                        { partido_programado_id: partido.id, orden: 1, tipo: 'DOBLES' as const },
                        { partido_programado_id: partido.id, orden: 2, tipo: 'INDIVIDUAL' as const },
                        { partido_programado_id: partido.id, orden: 3, tipo: 'INDIVIDUAL' as const },
                        { partido_programado_id: partido.id, orden: 4, tipo: 'INDIVIDUAL' as const },
                        { partido_programado_id: partido.id, orden: 5, tipo: 'INDIVIDUAL' as const }
                    ])
                })
            } else if (torneo.modalidad === 'DOBLES') {
                // Para DOBLES creamos un único detalle tipo DOBLES por partido.
                // Esto permite que el wizard asigne los 2 jugadores (A, B vs X, Y)
                // exactamente como en equipos. El endpoint PUT /alineacion ya
                // acepta tanto DOBLES como EQUIPOS.
                const creados = await tx.torneo_partidos_programados.findMany({
                    where: { torneo_id: torneoId, categoria_id: Number(categoriaId), grupo_id: { in: grupos.map(grupo => grupo.id) } },
                    select: { id: true }
                })
                await tx.torneo_partido_detalles.createMany({
                    data: creados.map(partido => ({
                        partido_programado_id: partido.id,
                        orden: 1,
                        tipo: 'DOBLES' as const,
                    })),
                })
            }
        }, { maxWait: 10_000, timeout: 30_000 })

        return NextResponse.json({
            success: true,
            message: partidosSeleccionados ? `Partidos generados (${nuevosPartidos.length})` : 'Partidos de grupos generados',
            partidos: todosLosPartidos
        }, { status: 201 })
    } catch (error: any) {
        console.error('Error al generar partidos de grupo:', error)
        return NextResponse.json({ error: 'Error al generar partidos', detalles: error.message }, { status: 500 })
    }
}

const grupoTieneParticipante = (
    grupos: { id: number; participantes: { torneo_participantes: { id: number } }[] }[],
    grupoId: number,
    participanteId: number
) => {
    const grupo = grupos.find(item => item.id === grupoId)
    if (!grupo) return false
    return grupo.participantes.some(item => item.torneo_participantes.id === participanteId)
}
