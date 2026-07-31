/**
 * Helpers para la siembra del bracket de eliminación.
 *
 * Reutiliza `calcularClasificacionGrupo` de `@/lib/empates` para que el
 * "pool esperado" de clasificados sea el MISMO cálculo que usa el
 * endpoint POST /llaves al sembrar automáticamente. Sin esto, el pool
 * que muestra la UI en modo manual podría divergir del que el backend
 * considera válido al guardar, y el operador sembraría una llave que
 * el servidor rechaza.
 */

import { PosicionManual, calcularClasificacionGrupo, PartidoParaTabla } from '@/lib/empates'

type GrupoConParticipantes = {
    id: number
    participantes: { torneo_participante_id: number }[]
}

/**
 * Devuelve los `clasificanPorGrupo` primeros clasificados de cada grupo,
 * en el orden canónico: grupo 1 → grupo 2 → ... (cada grupo ordenado
 * internamente por la cascada de desempate de empates.ts).
 *
 * El frontend usa esto para renderizar el pool de la siembra manual;
 * el backend lo reusa implícitamente a través de POST /llaves y PUT
 * /llaves/reordenar para validar que los IDs asignados están en este
 * mismo pool.
 */
export const clasificadosEsperados = (
    grupos: GrupoConParticipantes[],
    resultadosGrupo: Map<number, PartidoParaTabla[]>,
    manualPorGrupo: Map<number, PosicionManual>,
    clasificanPorGrupo: number
): { grupoId: number; posicionEnGrupo: number; participanteId: number }[] => {
    const out: { grupoId: number; posicionEnGrupo: number; participanteId: number }[] = []
    for (const grupo of grupos) {
        const ids = grupo.participantes.map(p => p.torneo_participante_id)
        const partidosDelGrupo = resultadosGrupo.get(grupo.id) || []
        const { orden } = calcularClasificacionGrupo(
            ids,
            partidosDelGrupo,
            manualPorGrupo.get(grupo.id) || new Map()
        )
        orden.slice(0, clasificanPorGrupo).forEach((participanteId, index) => {
            out.push({
                grupoId: grupo.id,
                posicionEnGrupo: index + 1,
                participanteId,
            })
        })
    }
    return out
}
