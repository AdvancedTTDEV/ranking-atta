import prisma from '@/lib/prisma'
import { guardarJugadoresDetalle } from '@/lib/torneo/partidos'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string; partidoId: string; detalleId: string }> }
type SetResultado = { local: number; visitante: number }

const esSetValido = ({ local, visitante }: SetResultado) =>
    Number.isInteger(local) && Number.isInteger(visitante) && local >= 0 && visitante >= 0
    && Math.max(local, visitante) >= 11 && Math.abs(local - visitante) >= 2

export async function PUT(request: Request, { params }: RouteParams) {
    const unauthorized = await requireAuth()
    if (unauthorized) return unauthorized

    try {
        const { id, partidoId, detalleId } = await params
        const torneoId = Number(id)
        const programadoId = Number(partidoId)
        const detalleIdNumero = Number(detalleId)
        const { jugadoresLocalIds, jugadoresVisitanteIds, sets } = await request.json() as {
            jugadoresLocalIds: number[]; jugadoresVisitanteIds: number[]; sets: SetResultado[]
        }
        if (!Array.isArray(sets) || sets.length < 3 || sets.length > 5 || !sets.every(esSetValido)) {
            return NextResponse.json({ error: 'Ingresa entre 3 y 5 sets válidos' }, { status: 400 })
        }

        const detalle = await prisma.torneo_partido_detalles.findFirst({
            where: { id: detalleIdNumero, partido_programado_id: programadoId, partido_programado: { torneo_id: torneoId } },
            include: {
                partido_programado: {
                    include: {
                        torneos: { select: { modalidad: true, sub21: true } },
                        participante_local: { include: { miembros: true } },
                        participante_visitante: { include: { miembros: true } }
                    }
                }
            }
        })
        if (!detalle) return NextResponse.json({ error: 'Partido de equipo no encontrado' }, { status: 404 })
        if (!detalle.partido_programado.participante_local || !detalle.partido_programado.participante_visitante) return NextResponse.json({ error: 'La llave aún no tiene ambos equipos' }, { status: 400 })
        if (detalle.partido_programado.torneos.modalidad !== 'EQUIPOS' && detalle.partido_programado.torneos.modalidad !== 'ATTA_TEAMS') {
            return NextResponse.json({ error: 'Este detalle solo existe para torneos por equipos' }, { status: 400 })
        }
        if (detalle.estado === 'FINALIZADO') return NextResponse.json({ error: 'Este partido ya fue guardado' }, { status: 409 })

        const cantidadEsperada = detalle.tipo === 'DOBLES' ? 2 : 1
        if (!Array.isArray(jugadoresLocalIds) || !Array.isArray(jugadoresVisitanteIds)
            || jugadoresLocalIds.length !== cantidadEsperada || jugadoresVisitanteIds.length !== cantidadEsperada) {
            return NextResponse.json({ error: `Selecciona ${cantidadEsperada} jugador${cantidadEsperada > 1 ? 'es' : ''} por lado` }, { status: 400 })
        }
        const localesValidos = new Set(detalle.partido_programado.participante_local.miembros.map(miembro => miembro.jugador_id))
        const visitantesValidos = new Set(detalle.partido_programado.participante_visitante.miembros.map(miembro => miembro.jugador_id))
        if (jugadoresLocalIds.some(jugadorId => !localesValidos.has(Number(jugadorId))) || jugadoresVisitanteIds.some(jugadorId => !visitantesValidos.has(Number(jugadorId)))) {
            return NextResponse.json({ error: 'La alineación debe pertenecer a su equipo' }, { status: 400 })
        }

        const setsLocal = sets.filter(set => set.local > set.visitante).length
        const setsVisitante = sets.filter(set => set.visitante > set.local).length
        if (setsLocal !== 3 && setsVisitante !== 3) return NextResponse.json({ error: 'El ganador debe obtener 3 sets' }, { status: 400 })
        const ganadorLado = setsLocal === 3 ? 'LOCAL' : 'VISITANTE'

        await prisma.$transaction(async tx => {
            await guardarJugadoresDetalle(tx, detalle.id, jugadoresLocalIds, jugadoresVisitanteIds)
            await tx.torneo_partido_detalle_sets.createMany({
                data: sets.map((set, index) => ({ detalle_id: detalle.id, numero: index + 1, puntos_local: set.local, puntos_visitante: set.visitante }))
            })
            await tx.torneo_partido_detalles.update({
                where: { id: detalle.id },
                data: { sets_local: setsLocal, sets_visitante: setsVisitante, ganador_lado: ganadorLado, estado: 'FINALIZADO' }
            })
        })

        // El dobles cuenta en la serie, pero no afecta el ranking. Cada
        // individual sí conserva el SP existente de puntos/ELO (salvo
        // torneos Sub 21, que no valen para ELO).
        const esSub21 = detalle.partido_programado.torneos.sub21
        if (detalle.tipo === 'INDIVIDUAL' && !esSub21) {
            const local = Number(jugadoresLocalIds[0])
            const visitante = Number(jugadoresVisitanteIds[0])
            const ganador = ganadorLado === 'LOCAL' ? local : visitante
            await prisma.$executeRaw`CALL procesar_partido(${local}, ${visitante}, ${ganador}, ${torneoId}, 'Grupos', NULL)`
        }

        const detallesFinalizados = await prisma.torneo_partido_detalles.findMany({
            where: { partido_programado_id: programadoId, estado: 'FINALIZADO' }, select: { ganador_lado: true }
        })
        const victoriasLocal = detallesFinalizados.filter(item => item.ganador_lado === 'LOCAL').length
        const victoriasVisitante = detallesFinalizados.filter(item => item.ganador_lado === 'VISITANTE').length
        await prisma.torneo_partidos_programados.update({
            where: { id: programadoId },
            data: {
                sets_local: victoriasLocal,
                sets_visitante: victoriasVisitante,
                ...(victoriasLocal === 3 || victoriasVisitante === 3 ? {
                    ganador_participante_id: victoriasLocal === 3 ? detalle.partido_programado.participante_local_id : detalle.partido_programado.participante_visitante_id,
                    estado: 'FINALIZADO'
                } : {})
            }
        })

        return NextResponse.json({ success: true, victoriasLocal, victoriasVisitante })
    } catch (error: any) {
        console.error('Error al guardar partido de equipo:', error)
        return NextResponse.json({ error: 'Error al guardar el partido de equipo', detalles: error.message }, { status: 500 })
    }
}
