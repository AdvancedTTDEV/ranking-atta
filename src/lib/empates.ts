/**
 * Lógica de desempate para el round-robin de grupos.
 *
 * Se usa desde:
 * - GET /api/torneos/[id]/partidos: para mostrar la clasificación.
 * - POST /api/torneos/[id]/llaves: para sembrar el bracket de eliminación
 *   respetando el orden del ranking (incluyendo desempates manuales).
 *
 * El orden final de los participantes se calcula con esta cascada:
 *   1. Victorias (W)
 *   2. Ratio de sets a favor / en contra
 *   3. Ratio de puntos a favor / en contra
 *   4. Posición manual (cuando el operador resolvió un empate desde la UI)
 *
 * El cuarto criterio usa una sentinela (OFFSET_MANUAL) en BD: si
 * `posicionManual >= 1000`, se interpreta como "valor real + 1000". Esto
 * distingue las posiciones que el operador guardó desde
 * PUT /torneos/[id]/grupos/[grupoId]/posiciones del sembrado inicial
 * (que ahora se deja en `null`).
 */

export type ResultadoGrupo = {
    participanteId: number
    victorias: number
    derrotas: number
    setsFavor: number
    setsContra: number
    puntosFavor: number
    puntosContra: number
}

export type PartidoParaTabla = {
    participante_local_id: number | null
    participante_visitante_id: number | null
    ganador_participante_id: number | null
    sets_local: number
    sets_visitante: number
    estado: string
    sets: { puntos_local: number; puntos_visitante: number }[]
}

export const OFFSET_MANUAL = 1000

const crearEstadisticas = (ids: number[]): Map<number, ResultadoGrupo> => new Map(ids.map(participanteId => [participanteId, {
    participanteId, victorias: 0, derrotas: 0, setsFavor: 0, setsContra: 0, puntosFavor: 0, puntosContra: 0
}]))

export const calcularEstadisticas = (ids: number[], partidos: PartidoParaTabla[]): Map<number, ResultadoGrupo> => {
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

export const compararRatio = (favorA: number, contraA: number, favorB: number, contraB: number) => {
    // Sin derrotas el ratio se considera superior; la multiplicación evita
    // errores de precisión de divisiones decimales.
    if (contraA === 0 && contraB !== 0) return -1
    if (contraB === 0 && contraA !== 0) return 1
    if (contraA === 0 && contraB === 0) return 0
    return (favorB * contraA) - (favorA * contraB)
}

/**
 * Posición manual persistida en BD por el usuario, usada como desempate
 * final. Si el operador ya asignó `posicion` a algún participante
 * empatado, ese orden se respeta.
 */
export type PosicionManual = Map<number, number>

/**
 * Desempata un grupo de IDs aplicando la cascada W → ratio sets →
 * ratio puntos → manual. Devuelve los IDs en el orden final y los IDs
 * que quedaron pendientes (no se pudo desempatar con la info disponible).
 */
export const ordenarEmpate = (
    ids: number[],
    partidos: PartidoParaTabla[],
    posicionManual: PosicionManual
): { ids: number[]; pendiente: number[] } => {
    if (ids.length < 2) return { ids, pendiente: [] }
    const estadisticas = calcularEstadisticas(
        ids,
        partidos.filter(partido =>
            partido.participante_local_id !== null
            && partido.participante_visitante_id !== null
            && ids.includes(partido.participante_local_id)
            && ids.includes(partido.participante_visitante_id)
        )
    )
    const ordenados = [...ids].sort((a, b) => {
        const primero = estadisticas.get(a)!
        const segundo = estadisticas.get(b)!
        const porSets = compararRatio(primero.setsFavor, primero.setsContra, segundo.setsFavor, segundo.setsContra)
        const porPuntos = compararRatio(primero.puntosFavor, primero.puntosContra, segundo.puntosFavor, segundo.puntosContra)
        if (porSets === 0 && porPuntos === 0) {
            const rawA = posicionManual.get(a)
            const rawB = posicionManual.get(b)
            const posA = rawA === undefined ? Number.POSITIVE_INFINITY : (rawA >= OFFSET_MANUAL ? rawA - OFFSET_MANUAL : rawA)
            const posB = rawB === undefined ? Number.POSITIVE_INFINITY : (rawB >= OFFSET_MANUAL ? rawB - OFFSET_MANUAL : rawB)
            return posA - posB
        }
        return porSets || porPuntos
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
        if (bloque.length === 1) {
            resueltos.push(...bloque)
            continue
        }
        const bloqueTieneManual = bloque.some(id => {
            const v = posicionManual.get(id)
            return v !== undefined && v >= OFFSET_MANUAL
        })
        if (bloqueTieneManual) {
            resueltos.push(...bloque)
            continue
        }
        if (bloques.length > 1) {
            const siguiente = ordenarEmpate(bloque, partidos, posicionManual)
            resueltos.push(...siguiente.ids)
            pendiente.push(...siguiente.pendiente)
        } else {
            resueltos.push(...bloque)
            pendiente.push(...bloque)
        }
    }
    return { ids: resueltos, pendiente }
}

/**
 * Devuelve la clasificación completa de un grupo, idéntica a la que
 * expone GET /partidos. La usa POST /llaves para sembrar el bracket
 * respetando el orden del ranking (incluyendo desempates manuales).
 */
export const calcularClasificacionGrupo = (
    ids: number[],
    partidos: PartidoParaTabla[],
    posicionManual: PosicionManual
): { orden: number[]; pendientes: number[] } => {
    const estadisticas = calcularEstadisticas(
        ids,
        partidos.filter(partido =>
            partido.participante_local_id !== null
            && partido.participante_visitante_id !== null
            && ids.includes(partido.participante_local_id)
            && ids.includes(partido.participante_visitante_id)
        )
    )
    // Agrupa por V y resuelve cada bloque con `ordenarEmpate`.
    const bloquesVictorias = new Map<number, number[]>()
    ids.forEach(participanteId => {
        const victorias = estadisticas.get(participanteId)!.victorias
        bloquesVictorias.set(victorias, [...(bloquesVictorias.get(victorias) || []), participanteId])
    })
    const orden: number[] = []
    const pendientes = new Set<number>()
    ;[...bloquesVictorias.keys()].sort((a, b) => b - a).forEach(victorias => {
        const desempate = ordenarEmpate(bloquesVictorias.get(victorias)!, partidos, posicionManual)
        orden.push(...desempate.ids)
        desempate.pendiente.forEach(id => pendientes.add(id))
    })
    return { orden, pendientes: [...pendientes] }
}
