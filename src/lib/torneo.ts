import type { torneo_modalidad } from '@prisma/client'

export type CategoriaLite = { id: number; nombre: string }

/**
 * Devuelve las categorías que deben mostrarse en el selector de un modal
 * de torneo (grupos / partidos / llaves).
 *
 * Reglas:
 *   - DOBLES y EQUIPOS: el torneo es "abierto total", se muestran TODAS
 *     las categorías del catálogo ordenadas.
 *   - INDIVIDUAL con la categoría "primera" asignada: el selector de
 *     JUGADORES permite elegir de cualquier categoría (inscripción
 *     abierta), pero los grupos/partidos/llaves se corren por categoría.
 *     El selector de categoría muestra solo las del torneo.
 *   - Cualquier otro caso: solo las categorías explícitamente
 *     asignadas al torneo en `torneo_categorias`.
 */
export function categoriasParaSelector(
    torneoCategorias: { categorias: CategoriaLite }[] | undefined,
    todasCategorias: CategoriaLite[],
    modalidad?: torneo_modalidad | string,
    _abiertoHint?: boolean,
): CategoriaLite[] {
    if (esTorneoAbiertoTotal(modalidad)) {
        return todasCategorias
            .slice()
            .sort((a, b) => ordenCategoria(a.nombre) - ordenCategoria(b.nombre))
    }
    return (torneoCategorias ?? []).map(tc => tc.categorias)
}

/**
 * Indica si un torneo es "totalmente abierto": cualquier jugador puede
 * inscribirse y los grupos/partidos/llaves se arman una sola vez sobre la
 * categoría "primera" mezclando a todos los inscritos.
 *
 * Aplica en dos casos:
 *   1. Modalidad DOBLES o EQUIPOS (siempre abiertas por convención).
 *   2. INDIVIDUAL con la marca `abierto = true` (creado con el toggle
 *      "Abierto" del formulario de creación).
 *
 * IMPORTANTE: en INDIVIDUAL sin marca `abierto`, aunque la categoría
 * "primera" esté abierta a todos los jugadores, las demás categorías
 * se corren por separado, así que el selector debe seguir mostrándose.
 */
export function esTorneoAbiertoTotal(
    modalidad?: torneo_modalidad | string,
    abiertoPersistido?: boolean,
): boolean {
    if (abiertoPersistido) return true
    return modalidad === 'DOBLES' || modalidad === 'EQUIPOS'
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
