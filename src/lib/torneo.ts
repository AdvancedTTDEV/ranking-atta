import type { torneo_modalidad } from '@prisma/client'

export type CategoriaLite = { id: number; nombre: string }

/**
 * Devuelve las categorías que deben mostrarse en el selector de un modal
 * de torneo (grupos / partidos / llaves).
 *
 * Reglas:
 *   - DOBLES y EQUIPOS: el torneo es "abierto", se muestran TODAS.
 *   - INDIVIDUAL con la categoría "primera" asignada: también es abierto
 *     (la primera es abierta a todos), se muestran TODAS.
 *   - En cualquier otro caso: solo las categorías explícitamente
 *     asignadas al torneo en `torneo_categorias`.
 */
export function categoriasParaSelector(
    torneoCategorias: { categorias: CategoriaLite }[] | undefined,
    todasCategorias: CategoriaLite[],
    modalidad?: torneo_modalidad | string,
    abiertoHint?: boolean,
): CategoriaLite[] {
    const esAbierto =
        abiertoHint === true ||
        modalidad === 'DOBLES' ||
        modalidad === 'EQUIPOS' ||
        (torneoCategorias ?? []).some(tc => tc.categorias?.nombre === 'primera')

    if (esAbierto) {
        return todasCategorias
            .slice()
            .sort((a, b) => ordenCategoria(a.nombre) - ordenCategoria(b.nombre))
    }
    return (torneoCategorias ?? []).map(tc => tc.categorias)
}

// Orden estable: primera > segunda > tercera > cuarta, y al final cualquier
// otro nombre en orden alfabético.
const ORDEN_NOMBRE: Record<string, number> = {
    primera: 0,
    segunda: 1,
    tercera: 2,
    cuarta: 3,
}

function ordenCategoria(nombre: string): number {
    return ORDEN_NOMBRE[nombre] ?? 99
}
