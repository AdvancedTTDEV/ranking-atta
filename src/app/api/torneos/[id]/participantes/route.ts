import prisma from '@/lib/prisma'
import { NextResponse } from 'next/server'

interface RouteParams {
    params: Promise<{ id: string }>
}

export async function GET(request: Request, { params }: RouteParams) {
    try {
        const { id } = await params
        const torneoId = Number(id)
        const { searchParams } = new URL(request.url)
        const categoriaId = Number(searchParams.get('categoriaId'))

        if (!categoriaId) {
            return NextResponse.json(
                { error: "Falta el parámetro categoriaId" },
                { status: 400 }
            )
        }

        const participantes = await prisma.torneo_participantes.findMany({
            where: {
                torneo_id: torneoId,
                categoria_id: categoriaId
            },
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

        const cantidadEsperada = torneo.modalidad === 'INDIVIDUAL' ? 1 : torneo.modalidad === 'DOBLES' ? 2 : null
        const jugadoresUsados = new Set<number>()

        for (const inscripcion of inscripciones) {
            const ids = Array.isArray(inscripcion.jugadoresIds) ? inscripcion.jugadoresIds.map(Number) : []
            if (ids.length === 0 || (cantidadEsperada !== null && ids.length !== cantidadEsperada)) {
                return NextResponse.json({ error: 'La cantidad de jugadores no corresponde a la modalidad del torneo' }, { status: 400 })
            }
            if (torneo.modalidad === 'EQUIPOS' && ids.length < 3) {
                return NextResponse.json({ error: 'Cada equipo debe tener al menos 3 jugadores' }, { status: 400 })
            }
            for (const jugadorId of ids) {
                if (!Number.isInteger(jugadorId) || jugadoresUsados.has(jugadorId)) {
                    return NextResponse.json({ error: 'Un jugador solo puede pertenecer a una inscripción por categoría' }, { status: 400 })
                }
                jugadoresUsados.add(jugadorId)
            }
        }

        await prisma.$transaction(async (tx) => {
            await tx.torneo_participantes.deleteMany({
                where: { torneo_id: torneoId, categoria_id: categoriaId }
            })

            for (const inscripcion of inscripciones) {
                const jugadorIds = inscripcion.jugadoresIds.map(Number)
                await tx.torneo_participantes.create({
                    data: {
                        torneo_id: torneoId,
                        categoria_id: categoriaId,
                        // Se mantiene el primer integrante como representante
                        // para conservar compatibilidad con el esquema anterior.
                        jugador_id: jugadorIds[0],
                        nombre_personalizado: typeof inscripcion.nombrePersonalizado === 'string'
                            ? inscripcion.nombrePersonalizado.trim() || null
                            : null,
                        seed: 0,
                        miembros: {
                            create: jugadorIds.map((jugadorId: number, index: number) => ({
                                jugador_id: jugadorId,
                                orden: index + 1
                            }))
                        }
                    }
                })
            }
        })

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
