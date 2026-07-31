import type { Prisma } from '@prisma/client'

type DetalleJugadoresCreateInput = Prisma.torneo_partido_detalle_jugadoresCreateManyInput

/**
 * Helper que actualiza la alineación (los jugadores asignados) de UN
 * sub-detalle de un partido por equipos, sin tocar los sets ni el
 * estado. Se usa desde:
 *
 *   1. El route `detalles/[detalleId]/route.ts` (cuando se finaliza un
 *      sub-partido y se quieren guardar los jugadores que jugaron).
 *   2. El nuevo route `alineacion/route.ts` (cuando el operador aún no
 *      tiene los resultados finales y solo quiere registrar quién va a
 *      jugar cada posición).
 *
 * El comportamiento es **idempotente**: si el detalle ya tiene
 * jugadores asignados (de un guardado previo o del wizard), los BORRA
 * y los reemplaza por los nuevos. Esto evita duplicados y permite
 * re-editar la alineación libremente (la pestaña "Atrás" del wizard).
 *
 * IMPORTANTE: NO valida que los jugadores pertenezcan al equipo
 * correspondiente. Esa validación la hace cada caller porque requiere
 * cargar `participante.miembros[]`, y eso no queremos acoplarlo al
 * helper (que solo escribe).
 */
export async function guardarJugadoresDetalle(
    tx: Prisma.TransactionClient,
    detalleId: number,
    jugadoresLocalIds: number[],
    jugadoresVisitanteIds: number[],
): Promise<void> {
    await tx.torneo_partido_detalle_jugadores.deleteMany({ where: { detalle_id: detalleId } })
    const data: DetalleJugadoresCreateInput[] = [
        ...jugadoresLocalIds.map((jugadorId, index) => ({
            detalle_id: detalleId,
            jugador_id: Number(jugadorId),
            lado: 'LOCAL' as const,
            orden: index + 1,
        })),
        ...jugadoresVisitanteIds.map((jugadorId, index) => ({
            detalle_id: detalleId,
            jugador_id: Number(jugadorId),
            lado: 'VISITANTE' as const,
            orden: index + 1,
        })),
    ]
    if (data.length > 0) {
        await tx.torneo_partido_detalle_jugadores.createMany({ data })
    }
}