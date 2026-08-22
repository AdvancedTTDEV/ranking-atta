import prisma from '@/lib/prisma'
import { guardarJugadoresDetalle } from '@/lib/torneo/partidos'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

/**
 * PUT /api/torneos/[id]/partidos/[partidoId]/alineacion
 *
 * Guarda la alineación de los sub-partidos que componen un encuentro por
 * equipos o dobles, sin tocar los sets ni el estado de cada sub-partido.
 * Es decir: solo persiste **quién juega cada posición** (A/B vs X/Y para
 * DOBLES, A/B/C/D/E vs X/Y/Z/W/V para EQUIPOS), NO los resultados.
 *
 * Pensado para el wizard ABC/XYZ: el operador puede ir y volver entre
 * pasos, registrar la alineación incompleta, reimprimir la hoja, etc.,
 * y este endpoint es 100% idempotente (borra y vuelve a insertar).
 *
 * Body esperado:
 * {
 *   detalles: [
 *     { detalle_id: 123, jugadores_local_ids: [145, 146], jugadores_visitante_ids: [200, 201] },
 *     { detalle_id: 124, jugadores_local_ids: [147],     jugadores_visitante_ids: [202] },
 *     ...
 *   ]
 * }
 *
 * Las reglas de validación son las mismas que en
 * `detalles/[detalleId]/route.ts`:
 *   - El partido pertenece al torneo.
 *   - Modalidad ∈ {DOBLES, EQUIPOS} (no INDIVIDUAL).
 *   - Cada detalle es DOBLES (2 por lado) o INDIVIDUAL (1 por lado).
 *   - Los jugadores asignados son miembros del equipo correspondiente.
 *   - Si el partido o algún detalle ya está finalizado, devuelve 409
 *     (los resultados no se pueden reescribir).
 */
export async function PUT(request: Request, { params }: RouteParams) {
    const unauthorized = await requireAuth()
    if (unauthorized) return unauthorized

    try {
        const { id, partidoId } = await params
        const torneoId = Number(id)
        const programadoId = Number(partidoId)
        const body = await request.json() as {
            detalles?: Array<{
                detalle_id: number
                jugadores_local_ids: Array<number | string>
                jugadores_visitante_ids: Array<number | string>
            }>
        }
        const detalles = Array.isArray(body.detalles) ? body.detalles : []
        if (detalles.length === 0) {
            return NextResponse.json({ error: 'No hay alineaciones para guardar' }, { status: 400 })
        }

        // Cargamos el partido con sus participantes y los detalles que
        // vamos a tocar. Si alguno no existe o no es del partido,
        // fallamos rápido sin tocar la BD.
        const partido = await prisma.torneo_partidos_programados.findFirst({
            where: { id: programadoId, torneo_id: torneoId },
            include: {
                torneos: { select: { modalidad: true } },
                participante_local: { include: { miembros: true } },
                participante_visitante: { include: { miembros: true } },
                detalles: { select: { id: true, tipo: true, estado: true } }
            }
        })
        if (!partido) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 })
        if (partido.torneos.modalidad !== 'EQUIPOS' && partido.torneos.modalidad !== 'DOBLES' && partido.torneos.modalidad !== 'ATTA_TEAMS') {
            return NextResponse.json({ error: 'La alineación solo aplica a torneos por equipos o dobles' }, { status: 400 })
        }
        if (!partido.participante_local || !partido.participante_visitante) {
            return NextResponse.json({ error: 'El partido aún no tiene ambos equipos asignados' }, { status: 400 })
        }
        if (partido.estado === 'FINALIZADO') {
            return NextResponse.json({ error: 'Este partido ya está finalizado' }, { status: 409 })
        }

        const detallesPorId = new Map(partido.detalles.map(d => [d.id, d]))
        const localesValidos = new Set(partido.participante_local.miembros.map(m => m.jugador_id))
        const visitantesValidos = new Set(partido.participante_visitante.miembros.map(m => m.jugador_id))

        for (const item of detalles) {
            const detalle = detallesPorId.get(item.detalle_id)
            if (!detalle) {
                return NextResponse.json({ error: `Detalle ${item.detalle_id} no pertenece al partido` }, { status: 400 })
            }
            if (detalle.estado === 'FINALIZADO') {
                return NextResponse.json({ error: `El sub-partido ${item.detalle_id} ya fue finalizado` }, { status: 409 })
            }
            const cantidadEsperada = detalle.tipo === 'DOBLES' ? 2 : 1
            const locales = (item.jugadores_local_ids ?? []).map(Number)
            const visitantes = (item.jugadores_visitante_ids ?? []).map(Number)
            if (locales.length !== cantidadEsperada || visitantes.length !== cantidadEsperada) {
                return NextResponse.json({
                    error: `Detalle ${item.detalle_id}: selecciona ${cantidadEsperada} jugador${cantidadEsperada > 1 ? 'es' : ''} por lado`,
                }, { status: 400 })
            }
            if (locales.some(id => !localesValidos.has(id))) {
                // DEBUG temporal: rastrear qué payload dispara el rechazo.
                console.error('[alineacion] RECHAZO LOCAL', JSON.stringify({
                    torneo: torneoId,
                    partido: programadoId,
                    detalle: item.detalle_id,
                    locales,
                    visitantes,
                    localesValidos: [...localesValidos],
                    visitantesValidos: [...visitantesValidos],
                }))
                return NextResponse.json({ error: `Detalle ${item.detalle_id}: los jugadores locales deben pertenecer al equipo local` }, { status: 400 })
            }
            if (visitantes.some(id => !visitantesValidos.has(id))) {
                // DEBUG temporal: rastrear qué payload dispara el rechazo.
                console.error('[alineacion] RECHAZO VISITA', JSON.stringify({
                    torneo: torneoId,
                    partido: programadoId,
                    detalle: item.detalle_id,
                    locales,
                    visitantes,
                    localesValidos: [...localesValidos],
                    visitantesValidos: [...visitantesValidos],
                }))
                return NextResponse.json({ error: `Detalle ${item.detalle_id}: los jugadores visitantes deben pertenecer al equipo visitante` }, { status: 400 })
            }
        }

        await prisma.$transaction(async tx => {
            for (const item of detalles) {
                await guardarJugadoresDetalle(
                    tx,
                    Number(item.detalle_id),
                    item.jugadores_local_ids.map(Number),
                    item.jugadores_visitante_ids.map(Number),
                )
            }
        })

        return NextResponse.json({
            success: true,
            detalles_actualizados: detalles.length,
        })
    } catch (error: any) {
        console.error('Error al guardar alineación:', error)
        return NextResponse.json({ error: 'Error al guardar la alineación', detalles: error.message }, { status: 500 })
    }
}

interface RouteParams { params: Promise<{ id: string; partidoId: string }> }