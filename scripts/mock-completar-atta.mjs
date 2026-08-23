// ============================================================================
// COMPLETA el torneo MOCK "MOCK - ATTA Teams Circuito" (solo DEV / hopper):
//   1) Alinea los 5 juegos de cada encuentro en el orden canónico ATTA
//      (A/B/C = miembros orden 1/2/3 del local · X/Y/Z del visitante).
//   2) Juega cada serie juego por juego hasta que un equipo llega a 3
//      victorias, replicando la lógica del endpoint PUT .../detalles/[id]:
//      sets válidos (a 11, diff 2), SP procesar_partido por individual,
//      cierre del encuentro al llegar a 3. El dobles no toca ranking.
// Determinista (RNG sembrado con ids) y re-ejecutable: salta lo ya jugado.
//
// Uso: node scripts/mock-completar-atta.mjs
// ============================================================================

import fs from 'node:fs'
import { PrismaClient } from '@prisma/client'

const TORNEO_NOMBRE = 'MOCK - ATTA Teams Circuito'

// ── Seguridad: NUNCA contra producción ─────────────────────────────────────
const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
const m = env.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)
if (!m) throw new Error('DATABASE_URL no encontrada en .env')
const url = new URL(m[1])
if (!url.hostname.startsWith('hopper.')) {
    throw new Error(`ABORTADO: esta BD (${url.hostname}) no es la de desarrollo (hopper)`)
}
console.log(`BD objetivo: ${url.hostname}:${url.port}${url.pathname} ✔ dev`)

const prisma = new PrismaClient()

// ── RNG determinista ───────────────────────────────────────────────────────
function mulberry32(seed) {
    let a = seed >>> 0
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

/** Sets del ganador (3 victorias + 0..2 derrotas), desde SU perspectiva. */
function generarSets(rng) {
    const perdidos = rng() < 0.45 ? 0 : (rng() < 0.6 ? 1 : 2)
    const deuce = () => (rng() < 0.7 ? [12, 10] : [15, 13])
    const normal = () => [11, Math.floor(rng() * 8)]
    const sets = []
    for (let i = 0; i < 3; i++) sets.push(rng() < 0.4 ? deuce() : normal())
    for (let i = 0; i < perdidos; i++) {
        const [g, p] = rng() < 0.4 ? deuce() : normal()
        sets.push([p, g])
    }
    return sets
}

async function main() {
    const torneo = await prisma.torneos.findFirst({ where: { nombre: TORNEO_NOMBRE } })
    if (!torneo) throw new Error(`Torneo "${TORNEO_NOMBRE}" no existe; corre antes scripts/mock-atta-teams.sql`)
    console.log(`Torneo #${torneo.id} · ${torneo.modalidad} · sub21=${torneo.sub21}`)

    const eloDe = new Map(
        (await prisma.jugadores.findMany({ select: { id: true, elo: true } })).map(j => [j.id, j.elo])
    )

    const partidos = await prisma.torneo_partidos_programados.findMany({
        where: { torneo_id: torneo.id, fase: 'GRUPOS' },
        orderBy: { orden: 'asc' },
        include: {
            participante_local: { include: { miembros: { orderBy: { orden: 'asc' } }, jugadores: true } },
            participante_visitante: { include: { miembros: { orderBy: { orden: 'asc' } }, jugadores: true } },
            detalles: { orderBy: { orden: 'asc' }, include: { jugadores: true } },
        },
    })
    console.log(`Encuentros de grupos: ${partidos.length}`)

    const nombre = p => p.nombre_personalizado || '?'
    let juegosJugados = 0

    for (const partido of partidos) {
        const L = partido.participante_local.miembros.map(x => x.jugador_id)
        const V = partido.participante_visitante.miembros.map(x => x.jugador_id)
        if (L.length < 3 || V.length < 3) throw new Error(`Equipo incompleto en encuentro #${partido.id}`)

        // Orden canónico ATTA: dobles B+C vs Y+Z · A-X · C-Z · A-Y · B-X
        const plan = [
            { tipo: 'DOBLES', local: [L[1], L[2]], visitante: [V[1], V[2]] },
            { tipo: 'INDIVIDUAL', local: [L[0]], visitante: [V[0]] },
            { tipo: 'INDIVIDUAL', local: [L[2]], visitante: [V[2]] },
            { tipo: 'INDIVIDUAL', local: [L[0]], visitante: [V[1]] },
            { tipo: 'INDIVIDUAL', local: [L[1]], visitante: [V[0]] },
        ]

        // Alineación preventiva de TODOS los juegos (como el wizard: los
        // 5 quedan asignados aunque la serie cierre antes de jugarlos).
        // Corre también para series ya cerradas.
        for (let i = 0; i < partido.detalles.length && i < plan.length; i++) {
            const detalle = partido.detalles[i]
            if (detalle.jugadores.length > 0) continue
            await prisma.torneo_partido_detalle_jugadores.createMany({
                data: [
                    ...plan[i].local.map((jugadorId, idx) => ({ detalle_id: detalle.id, jugador_id: jugadorId, lado: 'LOCAL', orden: idx + 1 })),
                    ...plan[i].visitante.map((jugadorId, idx) => ({ detalle_id: detalle.id, jugador_id: jugadorId, lado: 'VISITANTE', orden: idx + 1 })),
                ],
            })
        }

        if (partido.estado === 'FINALIZADO') { console.log(`· ${nombre(partido.participante_local)} vs ${nombre(partido.participante_visitante)} — ya cerrada, se omite`); continue }

        for (let i = 0; i < partido.detalles.length && i < plan.length; i++) {
            // Victorias actuales de la serie (recalculadas tras cada juego)
            const finales = await prisma.torneo_partido_detalles.findMany({
                where: { partido_programado_id: partido.id, estado: 'FINALIZADO' },
                select: { ganador_lado: true },
            })
            const vl = finales.filter(d => d.ganador_lado === 'LOCAL').length
            const vv = finales.filter(d => d.ganador_lado === 'VISITANTE').length
            if (vl === 3 || vv === 3) break

            const detalle = partido.detalles[i]
            const juego = plan[i]
            if (detalle.tipo !== juego.tipo) throw new Error(`Plan desalineado en encuentro #${partido.id} juego #${detalle.orden}`)
            if (detalle.estado === 'FINALIZADO') continue

            // Probabilidad por ELO (dobles: promedio de la pareja)
            const elo = ids => ids.reduce((s, id) => s + (eloDe.get(id) ?? 600), 0) / ids.length
            const rng = mulberry32(partido.id * 100 + detalle.orden)
            const ganaLocal = rng() < 1 / (1 + 10 ** ((elo(juego.visitante) - elo(juego.local)) / 400))
            const setsGanadorPerspectiva = generarSets(rng)
            const sets = ganaLocal
                ? setsGanadorPerspectiva.map(([gl, gp]) => ({ gl, gv: gp }))
                : setsGanadorPerspectiva.map(([gl, gp]) => ({ gl: gp, gv: gl }))
            const sl = sets.filter(s => s.gl > s.gv).length
            const sv = sets.filter(s => s.gv > s.gl).length
            if (sl !== 3 && sv !== 3) throw new Error('Serie inválida generada')

            // 1) Transacción idéntica al endpoint: alineación + sets + detalle
            await prisma.$transaction(async tx => {
                await tx.torneo_partido_detalle_jugadores.deleteMany({ where: { detalle_id: detalle.id } })
                await tx.torneo_partido_detalle_jugadores.createMany({
                    data: [
                        ...juego.local.map((jugadorId, idx) => ({ detalle_id: detalle.id, jugador_id: jugadorId, lado: 'LOCAL', orden: idx + 1 })),
                        ...juego.visitante.map((jugadorId, idx) => ({ detalle_id: detalle.id, jugador_id: jugadorId, lado: 'VISITANTE', orden: idx + 1 })),
                    ],
                })
                await tx.torneo_partido_detalle_sets.createMany({
                    data: sets.map((s, idx) => ({ detalle_id: detalle.id, numero: idx + 1, puntos_local: s.gl, puntos_visitante: s.gv })),
                })
                await tx.torneo_partido_detalles.update({
                    where: { id: detalle.id },
                    data: { sets_local: sl, sets_visitante: sv, ganador_lado: ganaLocal ? 'LOCAL' : 'VISITANTE', estado: 'FINALIZADO' },
                })
            })

            // 2) Ranking (igual que el endpoint: individuales, no sub21)
            if (detalle.tipo === 'INDIVIDUAL' && !torneo.sub21) {
                const local = juego.local[0]
                const visitante = juego.visitante[0]
                const ganador = ganaLocal ? local : visitante
                await prisma.$executeRawUnsafe(`SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;`)
                await prisma.$executeRaw`CALL procesar_partido(${local}, ${visitante}, ${ganador}, ${torneo.id}, 'Grupos', NULL)`
            }

            juegosJugados++
        }

        // 3) Recomputa el marcador del encuentro y cierra al llegar a 3
        const finales = await prisma.torneo_partido_detalles.findMany({
            where: { partido_programado_id: partido.id, estado: 'FINALIZADO' },
            select: { ganador_lado: true },
        })
        const vl = finales.filter(d => d.ganador_lado === 'LOCAL').length
        const vv = finales.filter(d => d.ganador_lado === 'VISITANTE').length
        const cerrar = vl === 3 || vv === 3
        await prisma.torneo_partidos_programados.update({
            where: { id: partido.id },
            data: {
                sets_local: vl,
                sets_visitante: vv,
                ...(cerrar ? { ganador_participante_id: vl === 3 ? partido.participante_local_id : partido.participante_visitante_id, estado: 'FINALIZADO' } : {}),
            },
        })
        console.log(`✔ ${nombre(partido.participante_local)} ${vl}–${vv} ${nombre(partido.participante_visitante)}${cerrar ? '' : ' (abierta)'}`)
    }

    console.log(`\nJuegos jugados en esta corrida: ${juegosJugados}`)
}

main()
    .catch(e => { console.error(e); process.exitCode = 1 })
    .finally(() => prisma.$disconnect())
