import assert from 'node:assert/strict'
import { asignarFechas } from '../src/lib/torneo/calendario-liga.ts'
import { crucesRoundRobin } from '../src/lib/seed.ts'

const nFechas = (f: number[]) => Math.max(...f)

for (let n = 3; n <= 8; n++) {
    for (let porFecha = 1; porFecha <= 3; porFecha++) {
        const ids = Array.from({ length: n }, (_, i) => i + 1)
        const cruces = crucesRoundRobin(ids)
        const fechas = asignarFechas(cruces, porFecha)
        assert.equal(fechas.length, cruces.length)
        assert.equal(cruces.length, (n * (n - 1)) / 2)
        const porF = new Map<number, [number, number][]>()
        cruces.forEach((c, i) => {
            assert.ok(fechas[i] >= 1, `cruce sin fecha n=${n}`)
            porF.set(fechas[i], [...(porF.get(fechas[i]) ?? []), c])
        })
        for (const [f, cs] of porF) {
            assert.ok(cs.length <= porFecha, `n=${n} p=${porFecha} fecha ${f} excede`)
            const eq = cs.flat()
            assert.equal(new Set(eq).size, eq.length, `n=${n} p=${porFecha} fecha ${f} repite equipo`)
        }
        const pares = new Set(cruces.map(([a, b]) => [a, b].sort().join('-')))
        assert.equal(pares.size, cruces.length)
    }
}

const f = (n: number, p: number) =>
    nFechas(asignarFechas(crucesRoundRobin(Array.from({ length: n }, (_, i) => i + 1)), p))
assert.equal(f(6, 2), 8)
assert.equal(f(5, 2), 5)
assert.equal(f(6, 3), 5)
console.log('check-calendario-liga OK')
