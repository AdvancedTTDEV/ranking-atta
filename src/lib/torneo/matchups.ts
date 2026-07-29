/**
 * Matchups estándar de la ATTA para partidos por equipos.
 *
 * Una serie de equipos (5 partidos) sigue SIEMPRE este orden, sin importar
 * el grupo ni la fecha. El operador asigna A, B, C al local y X, Y, Z al
 * visitante UNA sola vez por grupo en el wizard, y el sistema autollena
 * los cruces de CADA partido del grupo.
 *
 * Estándar (referencia cliente ATTA):
 *   Partido 1 — Dobles:        B+C vs Y+Z
 *   Partido 2 — Individual:    A   vs X
 *   Partido 3 — Individual:    C   vs Z
 *   Partido 4 — Individual:    A   vs Y
 *   Partido 5 — Individual:    B   vs X
 *
 * Para DOBLES (1 partido), el cruce es B+C vs Y+Z.
 *
 * Si un equipo tiene menos de 3 integrantes, los matchups se mantienen
 * igual y el(los) jugador(es) faltante(s) queda(n) sin jugar ese cruce.
 * Si tiene más de 3, los sobrantes tampoco juegan.
 */

/** Letras válidas. SOLO 3 por lado. */
export type LetraLocal = 'A' | 'B' | 'C'
export type LetraVisitante = 'X' | 'Y' | 'Z'

/** Matchup individual: una posición del local vs una del visitante. */
export interface MatchupUnitario {
    /** Letras del local que juegan este cruce. Para DOBLES puede ser 2. */
    local: LetraLocal | [LetraLocal, LetraLocal]
    /** Letras del visitante que juegan este cruce. */
    visitante: LetraVisitante | [LetraVisitante, LetraVisitante]
}

/** Una serie completa: N partidos con sus cruces. */
export interface Matchup {
    /** Tipo del partido (DOBLES para partido 1 de EQUIPOS y único de DOBLES,
     *  INDIVIDUAL el resto). */
    tipo: 'DOBLES' | 'INDIVIDUAL'
    /** Letras implicadas en este cruce. */
    cruces: MatchupUnitario
    /** Etiqueta humana ("A+B vs X+Y", "A vs X"). */
    etiqueta: string
}

/** Matchups estándar para una serie de EQUIPOS (5 partidos: 1 dobles + 4 individuales). */
export const MATCHUPS_EQUIPOS: Matchup[] = [
    { tipo: 'DOBLES',     cruces: { local: ['B', 'C'], visitante: ['Y', 'Z'] }, etiqueta: 'B+C vs Y+Z' },
    { tipo: 'INDIVIDUAL', cruces: { local: 'A', visitante: 'X' },               etiqueta: 'A vs X' },
    { tipo: 'INDIVIDUAL', cruces: { local: 'C', visitante: 'Z' },               etiqueta: 'C vs Z' },
    { tipo: 'INDIVIDUAL', cruces: { local: 'A', visitante: 'Y' },               etiqueta: 'A vs Y' },
    { tipo: 'INDIVIDUAL', cruces: { local: 'B', visitante: 'X' },               etiqueta: 'B vs X' },
]

/** Matchups estándar para DOBLES (1 partido: B+C vs Y+Z). */
export const MATCHUPS_DOBLES: Matchup[] = [
    { tipo: 'DOBLES', cruces: { local: ['B', 'C'], visitante: ['Y', 'Z'] }, etiqueta: 'B+C vs Y+Z' },
]

/** Cantidad de detalles que una serie tiene según la modalidad. */
export const DETALLES_POR_MODALIDAD: Record<'DOBLES' | 'EQUIPOS', number> = {
    DOBLES: 1,
    EQUIPOS: 5,
}

/** Letras del local y visitante. Solo 3 por lado. */
export const LETRAS_LOCALES: readonly LetraLocal[] = ['A', 'B', 'C']
export const LETRAS_VISITANTES: readonly LetraVisitante[] = ['X', 'Y', 'Z']

/** Cantidad de filas (slots) que la hoja de alineación debe tener por lado. */
export const FILAS_POR_LADO: Record<'DOBLES' | 'EQUIPOS', 3> = {
    DOBLES: 3,
    EQUIPOS: 3,
}

/** Asignación de IDs de jugador por letra. Cada letra tiene 0 = sin asignar. */
export interface Asignacion {
    abc: Partial<Record<LetraLocal, number>>
    xyz: Partial<Record<LetraVisitante, number>>
}

/** Devuelve los matchups estándar según la modalidad. */
export function matchupsEstandar(modalidad: 'DOBLES' | 'EQUIPOS'): Matchup[] {
    return modalidad === 'DOBLES' ? MATCHUPS_DOBLES : MATCHUPS_EQUIPOS
}

/**
 * Resuelve un matchup a los IDs reales de jugador usando la asignación
 * dada. Si alguna letra no tiene jugador, devuelve `null`.
 */
export function resolverMatchup(matchup: Matchup, asignacion: Asignacion): {
    local: number[]
    visitante: number[]
} | null {
    const localIds = Array.isArray(matchup.cruces.local)
        ? matchup.cruces.local.map(l => asignacion.abc[l] ?? 0)
        : [asignacion.abc[matchup.cruces.local] ?? 0]
    const visitanteIds = Array.isArray(matchup.cruces.visitante)
        ? matchup.cruces.visitante.map(l => asignacion.xyz[l] ?? 0)
        : [asignacion.xyz[matchup.cruces.visitante] ?? 0]
    if (localIds.some(id => !id) || visitanteIds.some(id => !id)) return null
    return { local: localIds, visitante: visitanteIds }
}

/** Cantidad de letras que la modalidad ocupa por lado. */
export function cantidadLetras(modalidad: 'DOBLES' | 'EQUIPOS'): 3 {
    return FILAS_POR_LADO[modalidad]
}

/**
 * Genera la asignación por defecto para cada equipo: el primer jugador
 * del roster es A (o X), el segundo es B (o Y), el tercero es C (o Z).
 * Si la cantidad de jugadores es menor que la cantidad de letras, las
 * restantes quedan en 0 (sin asignar). Si es mayor, los sobrantes no
 * entran en la asignación.
 *
 * Recibe las IDs de los miembros del equipo `abc` y del equipo `xyz`
 * por separado (en orden de roster).
 */
export function asignacionPorDefecto(
    idsRosterAbc: number[],
    idsRosterXyz: number[],
    modalidad: 'DOBLES' | 'EQUIPOS',
): Asignacion {
    const cantidad = cantidadLetras(modalidad)
    const abc: Partial<Record<LetraLocal, number>> = {}
    const xyz: Partial<Record<LetraVisitante, number>> = {}
    for (let i = 0; i < cantidad; i++) {
        const idAbc = idsRosterAbc[i] ?? 0
        const idXyz = idsRosterXyz[i] ?? 0
        if (idAbc > 0) abc[LETRAS_LOCALES[i]] = idAbc
        if (idXyz > 0) xyz[LETRAS_VISITANTES[i]] = idXyz
    }
    return { abc, xyz }
}
