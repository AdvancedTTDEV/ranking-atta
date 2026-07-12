import prisma from '@/lib/prisma'
import { NextResponse } from 'next/server'

interface RouteParams { params: Promise<{ id: string }> }

type ResultadoGrupo = {
    participanteId: number
    victorias: number
    derrotas: number
    setsFavor: number
    setsContra: number
    puntosFavor: number
    puntosContra: number
}

type PartidoParaTabla = {
    participante_local_id: number | null
    participante_visitante_id: number | null
    ganador_participante_id: number | null
    sets_local: number
    sets_visitante: number
    estado: string
    sets: { puntos_local: number; puntos_visitante: number }[]
}

const crearEstadisticas = (ids: number[]): Map<number, ResultadoGrupo> => new Map(ids.map(participanteId => [participanteId, {
    participanteId, victorias: 0, derrotas: 0, setsFavor: 0, setsContra: 0, puntosFavor: 0, puntosContra: 0
}]))

const calcularEstadisticas = (ids: number[], partidos: PartidoParaTabla[]) => {
    const resultado = crearEstadisticas(ids)
    for (const partido of partidos) {
        if (partido.estado !== 'FINALIZADO' || !partido.ganador_participante_id) continue
        if (!partido.participante_local_id || !partido.participante_visitante_id) continue
        const local = resultado.get(partido.participante_local_id)
        const visitante = resultado.get(partido.participante_visitante_id)
        if (!local || !visitante) continue
        const ganaLocal = partido.ganador_participante_id === partido.participante_local_id
        local.victorias += ganaLocal ? 1 : 0
        local.derrotas += ganaLocal ? 0 : 1
        visitante.victorias += ganaLocal ? 0 : 1
        visitante.derrotas += ganaLocal ? 1 : 0
        local.setsFavor += partido.sets_local
        local.setsContra += partido.sets_visitante
        visitante.setsFavor += partido.sets_visitante
        visitante.setsContra += partido.sets_local
        for (const set of partido.sets) {
            local.puntosFavor += set.puntos_local
            local.puntosContra += set.puntos_visitante
            visitante.puntosFavor += set.puntos_visitante
            visitante.puntosContra += set.puntos_local
        }
    }
    return resultado
}

const compararRatio = (favorA: number, contraA: number, favorB: number, contraB: number) => {
    // Sin derrotas el ratio se considera superior; la multiplicación evita
    // errores de precisión de divisiones decimales.
    if (contraA === 0 && contraB !== 0) return -1
    if (contraB === 0 && contraA !== 0) return 1
    if (contraA === 0 && contraB === 0) return 0
    return (favorB * contraA) - (favorA * contraB)
}

const ordenarEmpate = (ids: number[], partidos: PartidoParaTabla[]): { ids: number[]; pendiente: number[] } => {
    if (ids.length < 2) return { ids, pendiente: [] }
    const estadisticas = calcularEstadisticas(ids, partidos.filter(partido => partido.participante_local_id !== null && partido.participante_visitante_id !== null && ids.includes(partido.participante_local_id) && ids.includes(partido.participante_visitante_id)))
    const ordenados = [...ids].sort((a, b) => {
        const primero = estadisticas.get(a)!
        const segundo = estadisticas.get(b)!
        const porSets = compararRatio(primero.setsFavor, primero.setsContra, segundo.setsFavor, segundo.setsContra)
        return porSets || compararRatio(primero.puntosFavor, primero.puntosContra, segundo.puntosFavor, segundo.puntosContra)
    })
    const bloques: number[][] = []
    for (const id of ordenados) {
        const actual = estadisticas.get(id)!
        const ultimo = bloques[bloques.length - 1]
        if (!ultimo) { bloques.push([id]); continue }
        const previo = estadisticas.get(ultimo[0])!
        const iguales = compararRatio(actual.setsFavor, actual.setsContra, previo.setsFavor, previo.setsContra) === 0
            && compararRatio(actual.puntosFavor, actual.puntosContra, previo.puntosFavor, previo.puntosContra) === 0
        if (iguales) ultimo.push(id)
        else bloques.push([id])
    }
    const resueltos: number[] = []
    const pendiente: number[] = []
    for (const bloque of bloques) {
        if (bloque.length === 1) resueltos.push(...bloque)
        else if (bloques.length > 1) {
            // Al definirse una posición se excluye de la igualdad restante y
            // se vuelve a calcular solo con los involucrados, tal como exige
            // el desempate de triple empate.
            const siguiente = ordenarEmpate(bloque, partidos)
            resueltos.push(...siguiente.ids)
            pendiente.push(...siguiente.pendiente)
        }
        else {
            // Si sigue igual después de usar únicamente el mini-grupo, requiere
            // una decisión explícita del responsable; no se ordena al azar.
            resueltos.push(...bloque)
            pendiente.push(...bloque)
        }
    }
    return { ids: resueltos, pendiente }
}

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
        const grupos = new Map<number, { numero: number; ids: Set<number>; nombres: Map<number, string>; partidos: typeof partidos; categoria_id: number }>()
        for (const partido of partidos) {
            if (!partido.torneo_grupos) continue
            const grupo = grupos.get(partido.torneo_grupos.id) || {
                numero: partido.torneo_grupos.numero_grupo,
                ids: new Set<number>(), nombres: new Map<number, string>(), partidos: [] as typeof partidos,
                categoria_id: partido.categoria_id
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
            const bloquesVictorias = new Map<number, number[]>()
            ids.forEach(participanteId => {
                const victorias = globales.get(participanteId)!.victorias
                bloquesVictorias.set(victorias, [...(bloquesVictorias.get(victorias) || []), participanteId])
            })
            const orden: number[] = []
            const pendientes = new Set<number>()
            ;[...bloquesVictorias.keys()].sort((a, b) => b - a).forEach(victorias => {
                const desempate = ordenarEmpate(bloquesVictorias.get(victorias)!, partidosParaCalculo as never)
                orden.push(...desempate.ids)
                desempate.pendiente.forEach(id => pendientes.add(id))
            })
            return {
                grupoId,
                categoria_id: grupo.categoria_id,
                numero_grupo: grupo.numero,
                pendientes_manual: [...pendientes],
                posiciones: orden.map((participanteId, index) => ({
                    posicion: index + 1,
                    participante_id: participanteId,
                    nombre: grupo.nombres.get(participanteId),
                    ...globales.get(participanteId),
                    requiere_decision_manual: pendientes.has(participanteId)
                }))
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

        // Calculamos el universo completo de cruces (todos vs todos) en cliente
        // y en servidor, de manera que la modal de previsualización pueda
        // mostrar todos los checkboxes sin re-pedir al servidor, y que el POST
        // reciba un subconjunto para crear solamente los seleccionados.
        const todosLosPartidos: {
            grupo_id: number; participante_local_id: number; participante_visitante_id: number; arbitro_jugador_id: number | null
        }[] = []
        for (const grupo of grupos) {
            for (let localIndex = 0; localIndex < grupo.participantes.length - 1; localIndex++) {
                for (let visitanteIndex = localIndex + 1; visitanteIndex < grupo.participantes.length; visitanteIndex++) {
                    const local = grupo.participantes[localIndex].torneo_participantes
                    const visitante = grupo.participantes[visitanteIndex].torneo_participantes
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
