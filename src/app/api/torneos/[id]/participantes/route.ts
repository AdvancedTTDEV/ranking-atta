import prisma from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

interface RouteParams {
    params: Promise<{ id: string }>
}

export async function GET(request: Request, { params }: RouteParams) {
    const unauthorized = await requireAuth()
    if (unauthorized) return unauthorized

    try {
        const { id } = await params
        const torneoId = Number(id)
        const { searchParams } = new URL(request.url)
        const categoriaId = searchParams.get('categoriaId')

        // Si no llega categoriaId (caso típico de torneos abiertos donde un
        // mismo jugador puede estar en varias categorías), devolvemos todos
        // los participantes del torneo.
        const where: any = { torneo_id: torneoId }
        if (categoriaId) where.categoria_id = Number(categoriaId)

        const participantes = await prisma.torneo_participantes.findMany({
            where,
            include: {
                jugadores: {
                    include: {
                        clubes: true
                    }
                },
                miembros: {
                    orderBy: { orden: 'asc' },
                    include: { jugadores: { include: { clubes: true } } }
                },
            }
        })

        return NextResponse.json({ participantes })
    } catch (error: any) {
        console.error("Error al obtener participantes:", error)
        return NextResponse.json(
            { error: "Error al obtener participantes", detalles: error.message },
            { status: 500 }
        )
    }
}

export async function POST(request: Request, { params }: RouteParams) {
    const unauthorized = await requireAuth()
    if (unauthorized) return unauthorized

    try {
        const { id } = await params
        const torneoId = Number(id)
        const { categoriaId, jugadoresIds, participantes: participantesRecibidos } = await request.json()

        if (!categoriaId || (!Array.isArray(jugadoresIds) && !Array.isArray(participantesRecibidos))) {
            return NextResponse.json(
                { error: "Datos de inscripción inválidos o incompletos" },
                { status: 400 }
            )
        }

        const torneo = await prisma.torneos.findUnique({
            where: { id: torneoId },
            select: { modalidad: true }
        })

        if (!torneo) return NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 })

        // Compatibilidad con el formulario anterior de individuales.
        const inscripciones = Array.isArray(participantesRecibidos)
            ? participantesRecibidos
            : jugadoresIds.map((jugadorId: number) => ({ jugadoresIds: [jugadorId] }))

        // ATTA Teams: todos los equipos viven bajo UNA sola categoría
        // ("ancla" = primera), sin importar la categoría real de sus
        // miembros. Así los grupos mezclan clubes y las tres llaves
        // (Primera/Segunda/Tercera categoría) salen del mismo pool.
        let categoriaIdFinal = Number(categoriaId)
        if (torneo.modalidad === 'ATTA_TEAMS') {
            const ancla = await prisma.categorias.findFirst({ where: { nombre: 'primera' } })
            if (!ancla) {
                return NextResponse.json({ error: 'No existe la categoría "primera" para anclar el torneo ATTA Teams' }, { status: 400 })
            }
            categoriaIdFinal = ancla.id

            // Validación de composición: cada equipo puede tener
            //   A) máx. 2 de primera + máx. 1 de segunda (resto 3ra/4ta), o
            //   B) sin primera + máx. 2 de segunda (resto 3ra/4ta).
            const todosIds = [...new Set<number>(
                inscripciones.flatMap((i: { jugadoresIds?: (number | string)[] }) => (i.jugadoresIds ?? []).map(Number))
            )]
            const jugadoresConCategoria = await prisma.jugadores.findMany({
                where: { id: { in: todosIds } },
                select: { id: true, categorias: { select: { nombre: true } } }
            })
            const serieDe = new Map(jugadoresConCategoria.map(j => [j.id, j.categorias?.nombre ?? null]))
            const seriesValidas = new Set(['primera', 'segunda', 'tercera', 'cuarta'])

            for (const inscripcion of inscripciones) {
                const ids = Array.isArray(inscripcion.jugadoresIds) ? inscripcion.jugadoresIds.map(Number) : []
                const nombreEquipo = inscripcion.nombrePersonalizado?.trim() || `Equipo con jugadores ${ids.join(', ')}`
                const series: string[] = ids.map((idJugador: number) => serieDe.get(idJugador) ?? '')
                if (series.some(s => !s || !seriesValidas.has(s))) {
                    return NextResponse.json({ error: `${nombreEquipo}: hay jugadores sin categoría válida` }, { status: 400 })
                }
                const nPrimera = series.filter(s => s === 'primera').length
                const nSegunda = series.filter(s => s === 'segunda').length
                const composicionValida = (nPrimera <= 2 && nSegunda <= 1) || (nPrimera === 0 && nSegunda <= 2)
                if (!composicionValida) {
                    return NextResponse.json({
                        error: `${nombreEquipo}: composición inválida. Permitido: máx. 2 de primera y máx. 1 de segunda, o sin primera y máx. 2 de segunda (el resto debe ser de tercera o cuarta).`
                    }, { status: 400 })
                }
            }
        }

        const cantidadEsperada = torneo.modalidad === 'INDIVIDUAL' ? 1 : torneo.modalidad === 'DOBLES' ? 2 : null
        const jugadoresUsados = new Set<number>()

        for (const inscripcion of inscripciones) {
            const ids = Array.isArray(inscripcion.jugadoresIds) ? inscripcion.jugadoresIds.map(Number) : []
            if (ids.length === 0 || (cantidadEsperada !== null && ids.length !== cantidadEsperada)) {
                return NextResponse.json({ error: 'La cantidad de jugadores no corresponde a la modalidad del torneo' }, { status: 400 })
            }
            if ((torneo.modalidad === 'EQUIPOS' || torneo.modalidad === 'ATTA_TEAMS') && ids.length < 3) {
                return NextResponse.json({ error: 'Cada equipo debe tener al menos 3 jugadores' }, { status: 400 })
            }
            for (const jugadorId of ids) {
                if (!Number.isInteger(jugadorId) || jugadoresUsados.has(jugadorId)) {
                    return NextResponse.json({ error: 'Un jugador solo puede pertenecer a una inscripción por categoría' }, { status: 400 })
                }
                jugadoresUsados.add(jugadorId)
            }
        }

        // Limpieza previa: borrar participantes (los miembros se eliminan en
        // cascada) en una sola operación.
        await prisma.torneo_participantes.deleteMany({
            where: { torneo_id: torneoId, categoria_id: categoriaIdFinal }
        })

        // Si no hay inscripciones nuevas, no abrimos transacción.
        if (inscripciones.length === 0) {
            return NextResponse.json({ success: true, message: "Inscripciones actualizadas correctamente" })
        }

        // Timeout ampliado: la transacción por defecto de Prisma es 5s, que
        // se queda corto al insertar decenas de inscripciones con sus
        // miembros. Subimos a 30s para cubrir cómodamente inscripciones
        // grandes (INDIVIDUAL con muchos jugadores, o EQUIPOS con 5+).
        await prisma.$transaction(async (tx) => {
            // 1) Insertar todos los participantes en un solo batch.
            const participantesCreados = await tx.torneo_participantes.createMany({
                data: inscripciones.map((inscripcion: { jugadoresIds: (string | number)[]; nombrePersonalizado?: string }) => {
                    const jugadorIds = inscripcion.jugadoresIds.map(Number)
                    return {
                        torneo_id: torneoId,
                        categoria_id: categoriaIdFinal,
                        // Primer integrante como representante para conservar
                        // compatibilidad con el esquema anterior.
                        jugador_id: jugadorIds[0],
                        nombre_personalizado: typeof inscripcion.nombrePersonalizado === 'string'
                            ? inscripcion.nombrePersonalizado.trim() || null
                            : null,
                        seed: 0
                    }
                })
            })

            // 2) Recuperar los participantes recién creados (en el orden en
            // que se insertaron) para conocer los IDs y asociar los miembros.
            const ids = await tx.torneo_participantes.findMany({
                where: { torneo_id: torneoId, categoria_id: categoriaIdFinal },
                select: { id: true },
                orderBy: { id: 'asc' }
            })

            // 3) Construir el array plano de miembros con el ID del
            // participante correcto.
            const miembrosData: { torneo_participante_id: number; jugador_id: number; orden: number }[] = []
            ids.forEach((participante, index) => {
                const jugadorIds = inscripciones[index].jugadoresIds.map(Number)
                jugadorIds.forEach((jugadorId: number, orden: number) => {
                    miembrosData.push({
                        torneo_participante_id: participante.id,
                        jugador_id: jugadorId,
                        orden: orden + 1
                    })
                })
            })

            // 4) Insertar todos los miembros en un solo batch.
            if (miembrosData.length > 0) {
                await tx.torneo_participante_miembros.createMany({
                    data: miembrosData
                })
            }

            return participantesCreados
        }, { timeout: 30000 })

        return NextResponse.json({ success: true, message: "Inscripciones actualizadas correctamente" })
    } catch (error: any) {
        console.error("Error al procesar inscripciones:", error)
        console.error("Detalle meta:", JSON.stringify(error.meta, null, 2))   // <-- add this line
        return NextResponse.json(
            { error: "Error al guardar inscripciones", detalles: error.message },
            { status: 500 }
        )
    }
}
