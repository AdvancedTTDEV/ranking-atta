/**
 * Envío de borradores de JUEGOS de serie (sub-partidos de un cruce por
 * equipos). Compartido por el modal de resultados y por los modales
 * padre (grupos y llaves) para poder «Enviar y salir» desde sus diálogos.
 */

export type BorradorJuego = { sets: { local: number; visitante: number }[] }

export type ResolucionDetalle = {
    partidoProgramadoId: number
    jugadoresLocalIds: number[]
    jugadoresVisitanteIds: number[]
}

/** Valida los sets de un juego con las mismas reglas del backend:
 *  entre 3 y 5 sets, a 11 puntos con diferencia de 2. Devuelve el
 *  motivo del error o null si es válido. */
export function validarSetsJuego(sets: BorradorJuego['sets']): string | null {
    if (sets.length < 3 || sets.length > 5) return 'Ingresa entre 3 y 5 sets'
    for (const s of sets) {
        const hi = Math.max(s.local, s.visitante)
        const lo = Math.min(s.local, s.visitante)
        if (hi < 11) return 'Cada set se gana a 11 puntos'
        if (hi - lo < 2) return 'Debe haber diferencia de 2 puntos'
    }
    return null
}

/**
 * Envía cada borrador a PUT /partidos/[partido]/detalles/[detalle].
 * Los datos de alineación (jugadores por lado) los aporta `resolverDetalle`
 * desde los partidos ya cargados en el cliente. Un 409 (juego ya cerrado,
 * típico de doble operador) cuenta como guardado. Paraleliza en lotes
 * pequeños para no convertir cada envío en segundos sobre una BD remota.
 */
export async function enviarBorradoresJuegos(opts: {
    torneoId: number
    borradores: Record<number, BorradorJuego>
    resolverDetalle: (detalleId: number) => ResolucionDetalle | null
}): Promise<{ guardados: number[]; fallidos: { id: number; motivo: string }[] }> {
    const guardados: number[] = []
    const fallidos: { id: number; motivo: string }[] = []

    const enviarUno = async ([detalleIdStr, borrador]: [string, BorradorJuego]) => {
        const detalleId = Number(detalleIdStr)
        const resolucion = opts.resolverDetalle(detalleId)
        if (!resolucion) {
            fallidos.push({ id: detalleId, motivo: 'No se encontró la alineación del juego' })
            return
        }
        const errorValidacion = validarSetsJuego(borrador.sets)
        if (errorValidacion) {
            fallidos.push({ id: detalleId, motivo: errorValidacion })
            return
        }
        try {
            const response = await fetch(
                `/api/torneos/${opts.torneoId}/partidos/${resolucion.partidoProgramadoId}/detalles/${detalleId}`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jugadoresLocalIds: resolucion.jugadoresLocalIds,
                        jugadoresVisitanteIds: resolucion.jugadoresVisitanteIds,
                        sets: borrador.sets,
                    }),
                },
            )
            if (!response.ok) {
                const data = await response.json().catch(() => ({}))
                // 409: ya estaba finalizado en BD → lo limpiamos igual.
                if (response.status === 409) {
                    guardados.push(detalleId)
                } else {
                    fallidos.push({ id: detalleId, motivo: data.error || data.detalles || `HTTP ${response.status}` })
                }
                return
            }
            guardados.push(detalleId)
        } catch (error) {
            fallidos.push({ id: detalleId, motivo: error instanceof Error ? error.message : 'Error de red' })
        }
    }

    const entradas = Object.entries(opts.borradores)
    const LOTE = 3
    for (let i = 0; i < entradas.length; i += LOTE) {
        await Promise.all(entradas.slice(i, i + LOTE).map(enviarUno))
    }
    return { guardados, fallidos }
}
