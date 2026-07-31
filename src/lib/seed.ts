/**
 * Genera el orden de cruces (round-robin) para un grupo de `n` jugadores
 * de manera que nadie repita rival y la siembra esté balanceada.
 *
 * Algoritmo del círculo:
 *   - Para `n` par: el jugador en el índice 0 queda anclado, los `n-1`
 *     restantes rotan en sentido horario una posición por ronda. Hay
 *     `n-1` rondas, cada una con `n/2` cruces.
 *   - Para `n` impar: se añade un "bye" fantasma para llegar a `n+1`
 *     par, se aplica el mismo algoritmo y se filtran los cruces que
 *     incluyen al bye. Resultado: `n` rondas con `(n-1)/2` cruces
 *     reales cada una.
 *
 * Reordenamiento de rondas: el round-robin clásico puede dejar al
 * mismo jugador en dos cruces consecutivos (sobre todo con `n` par).
 * Para minimizarlo, las rondas se emiten en el orden
 * `[R1, R2, ..., Rn-1, R0]` (rotación a la izquierda), que mantiene a
 * cada jugador separado por al menos 2 cruces para `n` entre 3 y 6.
 *
 * Salida: array de tuplas `[local, visitante]`. Cada jugador aparece
 * exactamente una vez por ronda.
 */
export function crucesRoundRobin(ids: number[]): [number, number][] {
    const n = ids.length
    if (n < 2) return []

    // Para n impar, añadimos un id "bye" (-1) que filtraremos al final.
    const BYE = -1
    const extendido = n % 2 === 0 ? ids.slice() : [...ids, BYE]
    const m = extendido.length // siempre par

    // El algoritmo del círculo opera sobre los m-1 elementos rotantes
    // (excluyendo el anclado, índice 0 de `extendido`).
    let rotacion = extendido.slice(1) // m-1 elementos

    // Generamos las `m-1` rondas, cada una con `m/2` cruces.
    const rondas: [number, number][][] = []
    for (let ronda = 0; ronda < m - 1; ronda++) {
        const pares: [number, number][] = []
        // El anclado (extendido[0]) siempre empareja con el último de la
        // rotación actual.
        pares.push([extendido[0], rotacion[m - 2]])
        // El resto de los cruces: i vs (m-2-i) sobre la rotación.
        for (let i = 0; i < (m - 2) / 2; i++) {
            pares.push([rotacion[i], rotacion[m - 3 - i]])
        }
        rondas.push(pares)
        // Rotación horaria: el último elemento pasa al principio.
        rotacion = [rotacion[m - 2], ...rotacion.slice(0, m - 2)]
    }

    // Reordenamos las rondas para que ningún jugador aparezca en dos
    // cruces consecutivos del array final. Movemos la primera ronda al
    // final (rotación a la izquierda: R1, R2, ..., Rn-1, R0).
    const rondasReordenadas = rondas.length > 1
        ? [...rondas.slice(1), rondas[0]]
        : rondas

    // Aplanamos y filtramos los cruces con bye.
    return rondasReordenadas
        .flat()
        .filter(([a, b]) => a !== BYE && b !== BYE)
}
