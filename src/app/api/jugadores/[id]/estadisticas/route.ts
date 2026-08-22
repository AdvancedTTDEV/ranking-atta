import prisma from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

/**
 * GET /api/jugadores/[id]/estadisticas
 *
 * Perfil estadístico completo de un jugador a partir de su historial de
 * partidos: balance victorias/derrotas, racha vigente y head-to-head contra
 * cada rival enfrentado.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const unauthorized = await requireAuth()
    if (unauthorized) return unauthorized

    const { id } = await params
    const jugadorId = Number(id)
    if (!Number.isFinite(jugadorId)) {
        return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    try {
        const jugador = await prisma.jugadores.findUnique({
            where: { id: jugadorId },
            select: {
                id: true,
                nombre: true,
                elo: true,
                clubes: { select: { nombre: true } },
                categorias: { select: { nombre: true } },
            },
        })
        if (!jugador) {
            return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 })
        }

        const partidos = await prisma.partidos.findMany({
            where: {
                OR: [{ jugador1_id: jugadorId }, { jugador2_id: jugadorId }],
            },
            orderBy: { id: 'desc' },
            include: {
                jugadores_partidos_jugador1_idTojugadores: { select: { id: true, nombre: true, elo: true } },
                jugadores_partidos_jugador2_idTojugadores: { select: { id: true, nombre: true, elo: true } },
                jugadores_partidos_ganador_idTojugadores: { select: { id: true, nombre: true } },
                torneos: { select: { id: true, nombre: true } },
            },
        })

        let victorias = 0
        const h2h = new Map<number, { rivalNombre: string; jugados: number; ganados: number; perdidos: number }>()
        const torneosIds = new Set<number>()
        let rachaTipo: 'G' | 'P' | null = null
        let rachaN = 0
        let mejorRacha = 0
        let peorRacha = 0
        let rachaGanandoActual = 0
        let rachaPerdiendoActual = 0
        const sumaEloRivales: number[] = []
        const formaUltimos5: ('G' | 'P')[] = []

        const ultimosPartidos = partidos.slice(0, 8).map((p) => {
            const esJ1 = p.jugador1_id === jugadorId
            const rival = esJ1 ? p.jugadores_partidos_jugador2_idTojugadores : p.jugadores_partidos_jugador1_idTojugadores
            return {
                id: p.id,
                rivalNombre: rival?.nombre ?? '—',
                resultado: p.ganador_id === jugadorId ? ('G' as const) : ('P' as const),
                torneoNombre: p.torneos?.nombre ?? '',
                fecha: p.fecha?.toISOString() ?? null,
            }
        })

        for (const p of partidos) {
            torneosIds.add(p.torneo_id)
            const gano = p.ganador_id === jugadorId
            if (gano) victorias += 1

            // Racha: cuenta resultados consecutivos iguales desde el más reciente.
            const tipo: 'G' | 'P' = gano ? 'G' : 'P'
            if (formaUltimos5.length < 5) formaUltimos5.push(tipo)
            if (tipo === 'G') {
                rachaGanandoActual += 1
                rachaPerdiendoActual = 0
                mejorRacha = Math.max(mejorRacha, rachaGanandoActual)
            } else {
                rachaPerdiendoActual += 1
                rachaGanandoActual = 0
                peorRacha = Math.max(peorRacha, rachaPerdiendoActual)
            }
            if (rachaTipo === null) {
                rachaTipo = tipo
                rachaN = 1
            } else if (rachaTipo === tipo) {
                rachaN += 1
            }

            const esJ1 = p.jugador1_id === jugadorId
            const rival = esJ1 ? p.jugadores_partidos_jugador2_idTojugadores : p.jugadores_partidos_jugador1_idTojugadores
            if (!rival) continue // BYE o rival eliminado
            if (typeof rival.elo === 'number') sumaEloRivales.push(rival.elo)
            const actual = h2h.get(rival.id) ?? { rivalNombre: rival.nombre, jugados: 0, ganados: 0, perdidos: 0 }
            actual.jugados += 1
            if (gano) actual.ganados += 1
            else actual.perdidos += 1
            h2h.set(rival.id, actual)
        }

        // Rivales destacados: más frecuente, bestia negra y víctima favorita.
        let rivalMasFrecuente: { nombre: string; jugados: number } | null = null
        let bestiaNegra: { nombre: string; perdidos: number } | null = null
        let victimaFavorita: { nombre: string; ganados: number } | null = null
        for (const { rivalNombre: n, jugados: j, ganados: g, perdidos: p } of h2h.values()) {
            if (!rivalMasFrecuente || j > rivalMasFrecuente.jugados) rivalMasFrecuente = { nombre: n, jugados: j }
            if (!bestiaNegra || p > bestiaNegra.perdidos) bestiaNegra = { nombre: n, perdidos: p }
            if (!victimaFavorita || g > victimaFavorita.ganados) victimaFavorita = { nombre: n, ganados: g }
        }

        // Posición dentro de su categoría por ELO.
        let posicionCategoria: number | null = null
        let totalCategoria: number | null = null
        if (jugador.categorias?.nombre && typeof jugador.elo === 'number') {
            totalCategoria = await prisma.jugadores.count({
                where: { categorias: { nombre: jugador.categorias.nombre } },
            })
            posicionCategoria =
                (
                    await prisma.jugadores.count({
                        where: {
                            categorias: { nombre: jugador.categorias.nombre },
                            elo: { gt: jugador.elo },
                        },
                    })
                ) + 1
        }

        const jugados = partidos.length
        const derrotas = jugados - victorias

        return NextResponse.json({
            jugador,
            resumen: {
                jugados,
                victorias,
                derrotas,
                winRate: jugados > 0 ? Math.round((victorias / jugados) * 1000) / 10 : 0,
                racha: rachaTipo ? { tipo: rachaTipo, n: rachaN } : null,
                mejorRacha,
                peorRacha,
                torneosDistintos: torneosIds.size,
                eloPromedioRivales: sumaEloRivales.length
                    ? Math.round(sumaEloRivales.reduce((x, y) => x + y, 0) / sumaEloRivales.length)
                    : null,
                posicionCategoria,
                totalCategoria,
                rivalMasFrecuente,
                bestiaNegra,
                victimaFavorita,
                formaUltimos5,
            },
            h2h: [...h2h.entries()]
                .map(([rivalId, v]) => ({ rivalId, ...v }))
                .sort((a, b) => b.jugados - a.jugados),
            ultimosPartidos,
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: 'Error al calcular estadísticas' }, { status: 500 })
    }
}
