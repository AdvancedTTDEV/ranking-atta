/**
 * Calendario de Liga: reparte los cruces de un grupo (todos contra todos)
 * en fechas, con a lo sumo `porFecha` cruces por fecha y sin que un equipo
 * juegue dos veces en la misma fecha. Devuelve la fecha (base 1) de cada
 * cruce, en el mismo orden de entrada.
 *
 * shortcut: voraz, no garantiza el mínimo teórico de fechas para todo n;
 * el check (scripts/check-calendario-liga.mts) fija los casos que importan.
 */
export function asignarFechas(cruces: [number, number][], porFecha: number): number[] {
    const fechas: number[] = new Array(cruces.length).fill(0)
    let pendientes = cruces.length
    for (let fecha = 1; pendientes > 0; fecha++) {
        const ocupados = new Set<number>()
        let usados = 0
        for (let i = 0; i < cruces.length && usados < porFecha; i++) {
            if (fechas[i]) continue
            const [a, b] = cruces[i]
            if (ocupados.has(a) || ocupados.has(b)) continue
            ocupados.add(a)
            ocupados.add(b)
            fechas[i] = fecha
            usados++
            pendientes--
        }
    }
    return fechas
}
