'use client'

import { useState } from 'react'
import DataTable from '@/components/ui/DataTable'
import { Section } from '@/components/ui/Section'
import JugadorSearchAutocomplete from '@/components/dashboard/JugadorSearchAutoComplete'
import { useRecurso } from '@/app/hooks/useRecurso'
import {
    BoltIcon,
    TrophyIcon,
    FireIcon,
    ChartBarIcon,
    CalendarDaysIcon,
    UserIcon,
    ArrowUpCircleIcon,
    ArrowDownCircleIcon,
    HashtagIcon,
} from '@heroicons/react/24/outline'

type Jugador = {
    id: number
    nombre: string
    elo: number
    clubes?: { nombre?: string }
    categorias?: { nombre?: string }
}

type EstadisticasResponse = {
    jugador: {
        id: number
        nombre: string
        elo: number
        clubes?: { nombre?: string } | null
        categorias?: { nombre?: string } | null
    }
    resumen: {
        jugados: number
        victorias: number
        derrotas: number
        winRate: number
        racha: { tipo: 'G' | 'P'; n: number } | null
        mejorRacha: number
        peorRacha: number
        torneosDistintos: number
        eloPromedioRivales: number | null
        posicionCategoria: number | null
        totalCategoria: number | null
        rivalMasFrecuente: { nombre: string; jugados: number } | null
        bestiaNegra: { nombre: string; perdidos: number } | null
        victimaFavorita: { nombre: string; ganados: number } | null
        formaUltimos5: ('G' | 'P')[]
    }
    h2h: {
        rivalId: number
        rivalNombre: string
        jugados: number
        ganados: number
        perdidos: number
    }[]
    ultimosPartidos: {
        id: number
        rivalNombre: string
        resultado: 'G' | 'P'
        torneoNombre: string
        fecha: string | null
    }[]
}

export default function AnaliticaSection({ className = '' }: { className?: string }) {
    const [jugadorSeleccionado, setJugadorSeleccionado] = useState<Jugador | null>(null)

    const url = jugadorSeleccionado
        ? `/api/jugadores/${jugadorSeleccionado.id}/estadisticas`
        : null
    // useRecurso exige URL: usamos una clave nula cuando no hay jugador aún.
    const { datos, isLoading } = useRecurso<EstadisticasResponse>(url ?? '/api/categorias')
    const activo =
        jugadorSeleccionado && datos?.jugador?.id === jugadorSeleccionado.id ? datos : null

    return (
        <div className={`space-y-6 ${className}`}>
            <Section
                title="Analítica de jugadores"
                subtitle="Elige un jugador para ver su perfil completo, rachas y historial contra rivales"
            >
                <div className="max-w-md">
                    <JugadorSearchAutocomplete onSelect={setJugadorSeleccionado} />
                </div>

                {!jugadorSeleccionado && (
                    <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-8 text-center animate-fade-in">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-subtle text-fg-muted">
                            <UserIcon className="h-5 w-5" />
                        </span>
                        <p className="text-sm font-medium text-fg">Elige un jugador</p>
                        <p className="max-w-xs text-xs text-fg-muted">
                            Escribe al menos dos letras y selecciona del listado para ver su
                            perfil, rachas e historial contra rivales.
                        </p>
                    </div>
                )}
                {jugadorSeleccionado && !activo && isLoading && (
                    <p className="mt-4 text-sm text-fg-muted">Calculando estadísticas…</p>
                )}

                {/* Cabecera del jugador + resumen en tarjetas */}
                {activo && (
                    <>
                        <div className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-canvas/40 p-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fg text-sm font-bold text-canvas">
                                {activo.jugador.nombre?.[0]?.toUpperCase() ?? '?'}
                            </span>
                            <div className="min-w-0">
                                <p className="truncate font-semibold text-fg">{activo.jugador.nombre}</p>
                                <p className="text-xs capitalize text-fg-muted">
                                    {[
                                        activo.jugador.categorias?.nombre,
                                        activo.jugador.clubes?.nombre,
                                        `ELO ${Math.round(Number(activo.jugador.elo) || 0)}`,
                                    ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                </p>
                            </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-3 xl:grid-cols-4">
                            <MiniStat icon={<BoltIcon className="h-5 w-5" />} etiqueta="Partidos" valor={activo.resumen.jugados} />
                            <MiniStat icon={<TrophyIcon className="h-5 w-5" />} etiqueta="Victorias" valor={activo.resumen.victorias} acento="emerald" />
                            <MiniStat icon={<ChartBarIcon className="h-5 w-5" />} etiqueta="Win rate" valor={`${activo.resumen.winRate}%`} />
                            <MiniStat
                                icon={<FireIcon className="h-5 w-5" />}
                                etiqueta="Racha actual"
                                valor={
                                    activo.resumen.racha
                                        ? `${activo.resumen.racha.n} ${activo.resumen.racha.tipo === 'G' ? 'ganando' : 'perdiendo'}`
                                        : '—'
                                }
                                acento={activo.resumen.racha?.tipo === 'G' ? 'amber' : undefined}
                            />
                            <MiniStat icon={<ArrowUpCircleIcon className="h-5 w-5" />} etiqueta="Mejor racha" valor={activo.resumen.mejorRacha || '—'} acento="emerald" />
                            <MiniStat icon={<ArrowDownCircleIcon className="h-5 w-5" />} etiqueta="Peor racha" valor={activo.resumen.peorRacha || '—'} />
                            <MiniStat
                                icon={<CalendarDaysIcon className="h-5 w-5" />}
                                etiqueta="Torneos"
                                valor={activo.resumen.torneosDistintos}
                            />
                            <MiniStat
                                icon={<HashtagIcon className="h-5 w-5" />}
                                etiqueta={
                                    activo.resumen.posicionCategoria
                                        ? `De ${activo.resumen.totalCategoria} en su cat.`
                                        : 'Posición'
                                }
                                valor={activo.resumen.posicionCategoria ? `#${activo.resumen.posicionCategoria}` : '—'}
                            />
                        </div>

                        {/* Forma reciente + rivales clave */}
                        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-line bg-canvas/40 p-3">
                            <div>
                                <p className="mb-1.5 text-xs uppercase tracking-wide text-fg-muted">Forma (últimos 5)</p>
                                <div className="flex gap-1">
                                    {(activo.resumen.formaUltimos5?.length
                                        ? activo.resumen.formaUltimos5
                                        : []
                                    ).map((r, i) => (
                                        <span
                                            key={i}
                                            className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                                                r === 'G'
                                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                                    : 'bg-red-500/15 text-red-600 dark:text-red-400'
                                            }`}
                                            title={r === 'G' ? 'Victoria' : 'Derrota'}
                                        >
                                            {r}
                                        </span>
                                    ))}
                                    {!activo.resumen.formaUltimos5?.length && (
                                        <span className="text-sm text-fg-muted">Sin partidos</span>
                                    )}
                                </div>
                            </div>
                            {activo.resumen.eloPromedioRivales != null && (
                                <div>
                                    <p className="mb-1.5 text-xs uppercase tracking-wide text-fg-muted">ELO medio de rivales</p>
                                    <p className="text-sm font-semibold tabular-nums text-fg">{activo.resumen.eloPromedioRivales}</p>
                                </div>
                            )}
                            {activo.resumen.bestiaNegra && (
                                <div>
                                    <p className="mb-1.5 text-xs uppercase tracking-wide text-fg-muted">Bestia negra</p>
                                    <p className="text-sm font-semibold text-fg">
                                        {activo.resumen.bestiaNegra.nombre}
                                        <span className="ml-1 font-normal text-fg-muted">({activo.resumen.bestiaNegra.perdidos}P)</span>
                                    </p>
                                </div>
                            )}
                            {activo.resumen.victimaFavorita && (
                                <div>
                                    <p className="mb-1.5 text-xs uppercase tracking-wide text-fg-muted">Víctima favorita</p>
                                    <p className="text-sm font-semibold text-fg">
                                        {activo.resumen.victimaFavorita.nombre}
                                        <span className="ml-1 font-normal text-fg-muted">({activo.resumen.victimaFavorita.ganados}G)</span>
                                    </p>
                                </div>
                            )}
                        </div>

                    </>
                )}
            </Section>

            {activo && (
                <>
                    <Section title={`Head to head · ${activo.jugador.nombre}`} subtitle="Historial contra cada rival enfrentado">
                        <DataTable
                            columns={[
                                {
                                    header: 'Rival',
                                    accessor: 'rivalNombre',
                                    render: (v: string) => <span className="font-medium text-fg">{v}</span>,
                                },
                                { header: 'PJ', accessor: 'jugados', sortable: true },
                                { header: 'G', accessor: 'ganados', sortable: true },
                                { header: 'P', accessor: 'perdidos', sortable: true },
                                {
                                    header: 'Dominio',
                                    accessor: '_dominio',
                                    ocultarEnMovil: true,
                                    render: (_v, row) => {
                                        const pct = row.jugados ? Math.round((row.ganados / row.jugados) * 100) : 0
                                        return (
                                            <div className="flex items-center gap-2">
                                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-500 ${pct >= 50 ? 'bg-emerald-500' : 'bg-red-400'}`}
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                                <span className="w-10 text-right tabular-nums text-xs text-fg-muted">{pct}%</span>
                                            </div>
                                        )
                                    },
                                },
                            ]}
                            data={activo.h2h.map((h) => ({ ...h, _dominio: 0 }))}
                            currentPage={1}
                            itemsPerPage={Math.max(8, activo.h2h.length)}
                            totalItems={activo.h2h.length}
                            onPageChange={() => {}}
                            hideItemsPerPage
                            emptyMessage="Este jugador todavía no tiene partidos registrados"
                            rowKey={(row) => row.rivalId}
                        />
                    </Section>

                    <Section title="Últimos partidos" subtitle="Los ocho enfrentamientos más recientes">
                        <ul className="space-y-2">
                            {activo.ultimosPartidos.map((p, i) => (
                                <li
                                    key={p.id}
                                    style={{ animationDelay: `${Math.min(i * 40, 200)}ms` }}
                                    className="animate-slide-up flex items-center justify-between gap-3 rounded-lg border border-line bg-canvas/40 px-3 py-2.5"
                                >
                                    <span
                                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                            p.resultado === 'G'
                                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                                : 'bg-red-500/15 text-red-600 dark:text-red-400'
                                        }`}
                                        title={p.resultado === 'G' ? 'Victoria' : 'Derrota'}
                                    >
                                        {p.resultado}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-sm text-fg">
                                        vs <span className="font-medium">{p.rivalNombre}</span>
                                        {p.torneoNombre && (
                                            <span className="text-fg-muted"> · {p.torneoNombre}</span>
                                        )}
                                    </span>
                                    <span className="shrink-0 text-xs text-fg-muted">
                                        {p.fecha
                                            ? new Date(p.fecha).toLocaleDateString('es', { day: 'numeric', month: 'short', year: '2-digit' })
                                            : ''}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </Section>
                </>
            )}
        </div>
    )
}

function MiniStat({
    icon,
    etiqueta,
    valor,
    acento,
}: {
    icon: React.ReactNode
    etiqueta: string
    valor: React.ReactNode
    acento?: 'emerald' | 'amber'
}) {
    const acentoClase =
        acento === 'emerald'
            ? 'text-emerald-600 dark:text-emerald-400'
            : acento === 'amber'
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-fg-muted'
    return (
        <div className="rounded-xl border border-line bg-surface p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-4">
            <span className={`flex h-8 w-8 items-center justify-center rounded-full bg-subtle ${acentoClase} sm:h-9 sm:w-9`}>
                {icon}
            </span>
            <p className="mt-2 text-lg font-semibold tabular-nums text-fg sm:mt-3 sm:text-2xl">{valor}</p>
            <p className="mt-0.5 text-xs uppercase tracking-wide text-fg-muted">{etiqueta}</p>
        </div>
    )
}
