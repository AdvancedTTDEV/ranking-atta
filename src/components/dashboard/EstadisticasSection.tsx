'use client'
import { useState, useEffect } from 'react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'
import Link from 'next/link'
import { Section } from '@/components/ui/Section'
import { StatTile } from '@/components/ui/StatTile'
import { chartPalette } from '@/lib/design-tokens'
import { fetchCache, obtenerCache } from '@/lib/fetchCache'
import {
    UserGroupIcon,
    TrophyIcon,
    DocumentTextIcon,
} from '@heroicons/react/24/outline'

interface Torneo {
    id: number
    nombre: string
}

interface Partido {
    torneo_id: number
}

interface EloPorCategoria {
    categoria: string
    elo_promedio: number
}

interface JugadoresPorClub {
    club: string
    jugadores: number
}

interface PartidosPorTorneo {
    nombre: string
    partidos: number
}

interface Estadisticas {
    totalJugadores: number
    totalTorneos: number
    totalPartidos: number
    eloPorCategoria: EloPorCategoria[]
    jugadoresPorClub: JugadoresPorClub[]
    partidosPorTorneo: PartidosPorTorneo[]
}

const tooltipStyles = {
    contentStyle: {
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-line)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--color-fg)',
        fontSize: '0.8125rem',
        boxShadow: 'var(--shadow-lg)',
    },
    itemStyle: {
        color: 'var(--color-fg)',
    },
    labelStyle: {
        color: 'var(--color-fg-muted)',
        fontWeight: 500,
        marginBottom: 4,
    },
}

export default function EstadisticasSection({ className = '' }) {
    const [stats, setStats] = useState<Estadisticas>({
        totalJugadores: 0,
        totalTorneos: 0,
        totalPartidos: 0,
        eloPorCategoria: [],
        jugadoresPorClub: [],
        partidosPorTorneo: []
    })

    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchStats = async () => {
            // Con caché SWR: primera visita carga de red; revisitas pinta al
            // instante y revalida por detrás.
            if (!obtenerCache('/api/estadisticas/elo-por-categoria')) setLoading(true)
            try {
                const [jugadoresData, torneosData, partidosData, eloData, clubesData] = await Promise.all([
                    fetchCache<{ jugadores?: { id?: number }[] }>('/api/jugadores?limit=1000'),
                    fetchCache<{ torneos?: Torneo[] } | Torneo[]>('/api/torneos?limit=1000'),
                    fetchCache<{ partidos?: Partido[] } | Partido[]>('/api/partidos?limit=1000'),
                    fetchCache<EloPorCategoria[]>('/api/estadisticas/elo-por-categoria'),
                    fetchCache<JugadoresPorClub[]>('/api/estadisticas/jugadores-por-club')
                ])

                const jugadoresArray = (jugadoresData as { jugadores?: { id?: number }[] }).jugadores || []
                const torneosArray = ((torneosData as { torneos?: Torneo[] }).torneos || torneosData) as Torneo[]
                const partidosArray = ((partidosData as { partidos?: Partido[] }).partidos || partidosData) as Partido[]

                const partidosPorTorneo: PartidosPorTorneo[] = torneosArray.map((torneo: Torneo) => {
                    const count = partidosArray.filter((p: Partido) => p.torneo_id === torneo.id).length
                    return { nombre: torneo.nombre, partidos: count }
                })

                const clubesOrdenados = [...clubesData].sort((a, b) => b.jugadores - a.jugadores)
                const top5 = clubesOrdenados.slice(0, 5)
                const resto = clubesOrdenados.slice(5)
                const otrosTotal = resto.reduce((acc, club) => acc + club.jugadores, 0)
                if (otrosTotal > 0) {
                    top5.push({ club: 'Otros', jugadores: otrosTotal })
                }

                setStats({
                    totalJugadores: jugadoresArray.length,
                    totalTorneos: torneosArray.length,
                    totalPartidos: partidosArray.length,
                    eloPorCategoria: eloData,
                    jugadoresPorClub: top5,
                    partidosPorTorneo
                })
            } catch (error) {
                console.error('Error al obtener estadísticas:', error)
            } finally {
                setLoading(false)
            }
        }
        fetchStats()
    }, [])

    if (loading) {
        return (
            <Section title="Estadísticas" subtitle="Resumen general del club" compact className={className}>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="card card-body h-20 sm:h-28 animate-pulse-soft bg-subtle" />
                    ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4">
                    <div className="card h-56 sm:h-80 animate-pulse-soft bg-subtle" />
                    <div className="card h-56 sm:h-80 animate-pulse-soft bg-subtle" />
                </div>
            </Section>
        )
    }

    return (
        <Section
            title="Estadísticas"
            subtitle="Resumen general del club"
            compact
            className={className}
        >
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <StatTile
                    label="Jugadores"
                    value={stats.totalJugadores}
                    icon={<UserGroupIcon className="h-4 w-4 sm:h-5 sm:w-5" />}
                    accent="brand"
                    href="/dashboard/jugadores"
                    size="sm"
                />
                <StatTile
                    label="Torneos"
                    value={stats.totalTorneos}
                    icon={<TrophyIcon className="h-4 w-4 sm:h-5 sm:w-5" />}
                    accent="success"
                    href="/dashboard/torneos"
                    size="sm"
                />
                <StatTile
                    label="Partidos"
                    value={stats.totalPartidos}
                    icon={<DocumentTextIcon className="h-4 w-4 sm:h-5 sm:w-5" />}
                    accent="info"
                    href="/dashboard/partidos"
                    size="sm"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4">
                <div className="card card-body !p-3 sm:!p-5">
                    <h3 className="text-sm font-semibold text-fg mb-3 sm:mb-4">
                        Puntos promedio por categoría
                    </h3>
                    <div className="h-48 sm:h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={stats.eloPorCategoria}
                                margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                                <XAxis
                                    dataKey="categoria"
                                    stroke="var(--color-fg-muted)"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    stroke="var(--color-fg-muted)"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Tooltip
                                    {...tooltipStyles}
                                    formatter={(value: number) => [`${value}`, 'Promedio']}
                                />
                                <Legend wrapperStyle={{ color: 'var(--color-fg-muted)', fontSize: 12 }} />
                                <Bar dataKey="elo_promedio" name="ELO promedio" fill={chartPalette[0]} radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="card card-body !p-3 sm:!p-5">
                    <h3 className="text-sm font-semibold text-fg mb-3 sm:mb-4">
                        Jugadores por club
                    </h3>
                    <div className="h-48 sm:h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={stats.jugadoresPorClub}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    outerRadius={88}
                                    innerRadius={48}
                                    paddingAngle={2}
                                    dataKey="jugadores"
                                    nameKey="club"
                                    stroke="var(--color-surface)"
                                    strokeWidth={2}
                                    label={({ name, percent }: { name?: string; percent?: number }) =>
                                        `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`
                                    }
                                >
                                    {stats.jugadoresPorClub.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={chartPalette[index % chartPalette.length]}
                                        />
                                    ))}
                                </Pie>
                                <Tooltip
                                    {...tooltipStyles}
                                    formatter={(value: number) => [`${value} jugadores`, '']}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </Section>
    )
}
