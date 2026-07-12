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
            setLoading(true)
            try {
                const [jugadoresRes, torneosRes, partidosRes, eloRes, clubesRes] = await Promise.all([
                    fetch('/api/jugadores?limit=1000'),
                    fetch('/api/torneos?limit=1000'),
                    fetch('/api/partidos?limit=1000'),
                    fetch('/api/estadisticas/elo-por-categoria'),
                    fetch('/api/estadisticas/jugadores-por-club')
                ])

                if (!jugadoresRes.ok) throw new Error('Error fetching jugadores')
                if (!torneosRes.ok) throw new Error('Error fetching torneos')
                if (!partidosRes.ok) throw new Error('Error fetching partidos')
                if (!eloRes.ok) throw new Error('Error fetching elo data')
                if (!clubesRes.ok) throw new Error('Error fetching clubes data')

                const jugadoresData = await jugadoresRes.json()
                const torneosData = await torneosRes.json()
                const partidosData = await partidosRes.json()
                const eloData: EloPorCategoria[] = await eloRes.json()
                const clubesData: JugadoresPorClub[] = await clubesRes.json()

                const jugadoresArray = jugadoresData.jugadores || []
                const torneosArray = torneosData.torneos || torneosData
                const partidosArray = partidosData.partidos || partidosData

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
            <Section title="Estadísticas" subtitle="Resumen general del club" className={className}>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="card card-body h-28 animate-pulse-soft bg-subtle" />
                    ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                    <div className="card h-80 animate-pulse-soft bg-subtle" />
                    <div className="card h-80 animate-pulse-soft bg-subtle" />
                </div>
            </Section>
        )
    }

    return (
        <Section
            title="Estadísticas"
            subtitle="Resumen general del club"
            className={className}
        >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatTile
                    label="Jugadores"
                    value={stats.totalJugadores}
                    icon={<UserGroupIcon className="h-5 w-5" />}
                    accent="brand"
                    href="/dashboard/jugadores"
                />
                <StatTile
                    label="Torneos"
                    value={stats.totalTorneos}
                    icon={<TrophyIcon className="h-5 w-5" />}
                    accent="success"
                    href="/dashboard/torneos"
                />
                <StatTile
                    label="Partidos"
                    value={stats.totalPartidos}
                    icon={<DocumentTextIcon className="h-5 w-5" />}
                    accent="info"
                    href="/dashboard/partidos"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
                <div className="card card-body">
                    <h3 className="text-sm font-semibold text-fg mb-4">
                        Puntos promedio por categoría
                    </h3>
                    <div className="h-72">
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

                <div className="card card-body">
                    <h3 className="text-sm font-semibold text-fg mb-4">
                        Jugadores por club
                    </h3>
                    <div className="h-72">
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
