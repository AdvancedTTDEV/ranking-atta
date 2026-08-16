import prisma from '@/lib/prisma'
import { NextResponse } from 'next/server'

interface RouteParams { params: Promise<{ id: string; partidoId: string }> }

type SetResultado = { local: number; visitante: number }

const esSetValido = ({ local, visitante }: SetResultado) => {
    if (!Number.isInteger(local) || !Number.isInteger(visitante) || local < 0 || visitante < 0) return false
    const mayor = Math.max(local, visitante)
    const menor = Math.min(local, visitante)
    return mayor >= 11 && mayor - menor >= 2
}

const participantesInclude = {
    miembros: { orderBy: { orden: 'asc' as const }, include: { jugadores: true } },
    jugadores: true,
}

export async function GET(_request: Request, { params }: RouteParams) {
    try {
        const { id, partidoId } = await params
        const torneoId = Number(id)
        const idPartido = Number(partidoId)
        const partido = await prisma.torneo_partidos_programados.findFirst({
            where: { id: idPartido, torneo_id: torneoId },
            include: {
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
        if (!partido) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 })
        return NextResponse.json({ partido })
    } catch (error: any) {
        console.error('Error al obtener partido:', error)
        return NextResponse.json({ error: 'Error al obtener el partido', detalles: error.message }, { status: 500 })
    }
}

export async function PUT(request: Request, { params }: RouteParams) {
    try {
        const { id, partidoId } = await params
        const torneoId = Number(id)
        const idPartido = Number(partidoId)
        const { sets } = await request.json() as { sets: SetResultado[] }

        if (!Array.isArray(sets) || sets.length < 3 || sets.length > 5 || !sets.every(esSetValido)) {
            return NextResponse.json({ error: 'Ingresa entre 3 y 5 sets válidos (a 11 puntos, con diferencia de 2)' }, { status: 400 })
        }

        const partido = await prisma.torneo_partidos_programados.findFirst({
            where: { id: idPartido, torneo_id: torneoId },
            include: {
                torneos: { select: { modalidad: true } },
                participante_local: { include: { miembros: { orderBy: { orden: 'asc' } } } },
                participante_visitante: { include: { miembros: { orderBy: { orden: 'asc' } } } }
            }
        })
        if (!partido) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 })
        if (!partido.participante_local || !partido.participante_visitante) return NextResponse.json({ error: 'La llave aún no tiene ambos participantes' }, { status: 400 })
        if (partido.estado === 'FINALIZADO') return NextResponse.json({ error: 'Este resultado ya fue guardado. Revertirlo será parte del siguiente paso.' }, { status: 409 })
        if (partido.torneos.modalidad === 'EQUIPOS') {
            return NextResponse.json({ error: 'Los encuentros por equipos requieren registrar sus 5 partidos internos; se habilitarán con el módulo de equipos.' }, { status: 400 })
        }

        const setsLocal = sets.filter(set => set.local > set.visitante).length
        const setsVisitante = sets.filter(set => set.visitante > set.local).length
        if (setsLocal !== 3 && setsVisitante !== 3) {
            return NextResponse.json({ error: 'El ganador debe obtener exactamente 3 sets' }, { status: 400 })
        }
        const ganadorId = setsLocal === 3 ? partido.participante_local_id : partido.participante_visitante_id

        await prisma.$transaction(async tx => {
            await tx.torneo_partido_sets.createMany({
                data: sets.map((set, index) => ({
                    partido_programado_id: partido.id,
                    numero: index + 1,
                    puntos_local: set.local,
                    puntos_visitante: set.visitante
                }))
            })
            await tx.torneo_partidos_programados.update({
                where: { id: partido.id },
                data: {
                    sets_local: setsLocal,
                    sets_visitante: setsVisitante,
                    ganador_participante_id: ganadorId,
                    estado: 'FINALIZADO'
                }
            })
        }, { maxWait: 10_000, timeout: 30_000 })

        if (partido.fase === 'ELIMINACION' && partido.siguiente_partido_id && partido.siguiente_lado) {
            await prisma.torneo_partidos_programados.update({
                where: { id: partido.siguiente_partido_id },
                data: partido.siguiente_lado === 'LOCAL'
                    ? { participante_local_id: ganadorId }
                    : { participante_visitante_id: ganadorId }
            })
        }

        // En individuales se conserva la fuente de verdad de ranking: el SP actual.
        if (partido.torneos.modalidad === 'INDIVIDUAL') {
            const jugadorLocal = partido.participante_local.miembros[0]?.jugador_id
            const jugadorVisitante = partido.participante_visitante.miembros[0]?.jugador_id
            if (!jugadorLocal || !jugadorVisitante) throw new Error('Faltan integrantes del partido individual')
            const ganadorJugador = ganadorId === partido.participante_local_id ? jugadorLocal : jugadorVisitante
            await prisma.$executeRawUnsafe(`CALL procesar_partido(${jugadorLocal}, ${jugadorVisitante}, ${ganadorJugador}, ${torneoId}, 'Grupos', NULL)`)
        }

        return NextResponse.json({ success: true, setsLocal, setsVisitante })
    } catch (error: any) {
        console.error('Error al guardar resultado:', error)
        return NextResponse.json({ error: 'Error al guardar el resultado', detalles: error.message }, { status: 500 })
    }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
    try {
        const { id, partidoId } = await params
        const torneoId = Number(id)
        const idPartido = Number(partidoId)
        const partido = await prisma.torneo_partidos_programados.findFirst({
            where: { id: idPartido, torneo_id: torneoId },
            include: {
                torneos: { select: { modalidad: true } },
                participante_local: { include: { miembros: { orderBy: { orden: 'asc' } } } },
                participante_visitante: { include: { miembros: { orderBy: { orden: 'asc' } } } }
            }
        })
        if (!partido) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 })
        if (!partido.participante_local || !partido.participante_visitante) return NextResponse.json({ error: 'El partido no tiene ambos participantes' }, { status: 400 })
        if (partido.estado !== 'FINALIZADO') return NextResponse.json({ error: 'El partido no tiene resultado para deshacer' }, { status: 400 })
        if (partido.torneos.modalidad === 'EQUIPOS') return NextResponse.json({ error: 'La reversión de series por equipos se habilitará junto con sus llaves' }, { status: 400 })

        if (partido.torneos.modalidad === 'INDIVIDUAL') {
            const local = partido.participante_local.miembros[0]?.jugador_id
            const visitante = partido.participante_visitante.miembros[0]?.jugador_id
            if (!local || !visitante) return NextResponse.json({ error: 'No se pudo identificar a los jugadores' }, { status: 400 })
            // Solo se revierte el último partido individual entre ambos dentro
            // del torneo; es el mismo criterio que usa el historial actual.
            const partidoRanking = await prisma.partidos.findFirst({
                where: {
                    torneo_id: torneoId,
                    OR: [
                        { jugador1_id: local, jugador2_id: visitante },
                        { jugador1_id: visitante, jugador2_id: local }
                    ]
                },
                orderBy: { id: 'desc' },
                select: { id: true }
            })
            if (!partidoRanking) return NextResponse.json({ error: 'No se encontró el movimiento de ranking asociado' }, { status: 409 })
            // Forzamos la collation de la sesión a la del ENUM de la tabla
            // para que las comparaciones internas del SP no mezclen colaciones.
            await prisma.$executeRawUnsafe(`SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;`)
            await prisma.$executeRawUnsafe(`CALL revertir_partido(${partidoRanking.id})`)
        }

        await prisma.$transaction([
            prisma.torneo_partido_sets.deleteMany({ where: { partido_programado_id: partido.id } }),
            prisma.torneo_partidos_programados.update({
                where: { id: partido.id },
                data: { sets_local: 0, sets_visitante: 0, ganador_participante_id: null, estado: 'PENDIENTE' }
            })
        ])
        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Error al deshacer resultado:', error)
        return NextResponse.json({ error: 'Error al deshacer el resultado', detalles: error.message }, { status: 500 })
    }
}
