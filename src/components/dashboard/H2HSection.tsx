'use client'

import { useState } from 'react'
import { Section } from '@/components/ui/Section'
import JugadorSearchAutocomplete from '@/components/dashboard/JugadorSearchAutoComplete'
import { useRecurso } from '@/app/hooks/useRecurso'
import { ScaleIcon } from '@heroicons/react/24/outline'

type Jugador = {
    id: number
    nombre: string
    elo: number
    clubes?: { nombre?: string }
    categorias?: { nombre?: string }
}

type H2HResponse = {
    jugadorA: Jugador
    jugadorB: Jugador
    resumen: { jugados: number; victoriasA: number; victoriasB: number }
    duelos: {
        id: number
        fecha: string | null
        torneoNombre: string
        ganadorId: number
        ganadorNombre: string
    }[]
}

export default function H2HSection({ className = '' }: { className?: string }) {
    const [jugadorA, setJugadorA] = useState<Jugador | null>(null)
    const [jugadorB, setJugadorB] = useState<Jugador | null>(null)

    // Clave estable: el par ordenado dispara la carga; '/api/categorias' es
    // solo un marcador barato mientras falta algún jugador.
    const lista = jugadorA && jugadorB ? [jugadorA.id, jugadorB.id].sort((x, y) => x - y) : null
    const url = lista ? `/api/h2h?a=${lista[0]}&b=${lista[1]}` : '/api/categorias'
    const { datos, isLoading } = useRecurso<H2HResponse>(url)
    const h2h =
        jugadorA && jugadorB && datos?.jugadorA && datos?.jugadorB && datos.resumen?.jugados !== undefined
            ? datos
            : null

    return (
        <div className={`space-y-6 ${className}`}>
            <Section
                title="Cara a cara"
                subtitle="Compara dos jugadores y revisa todos sus enfrentamientos"
            >
                <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
                    <div>
                        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">Jugador A</p>
                        <JugadorSearchAutocomplete onSelect={setJugadorA} />
                    </div>
                    <span className="hidden sm:flex h-10 w-10 mx-auto items-center justify-center rounded-full bg-subtle text-fg-muted">
                        <ScaleIcon className="h-5 w-5" />
                    </span>
                    <div>
                        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">Jugador B</p>
                        <JugadorSearchAutocomplete onSelect={setJugadorB} />
                    </div>
                </div>

                {!lista && (
                    <p className="mt-4 text-sm text-fg-muted">
                        Elige a los dos jugadores para ver su historial completo.
                    </p>
                )}
            </Section>

            {lista && !h2h && isLoading && (
                <p className="text-sm text-fg-muted">Buscando enfrentamientos…</p>
            )}

            {h2h && (
                <>
                    {/* Marcador grande */}
                    <Section title="Marcador histórico">
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2">
                            <LadoJugador
                                jugador={h2h.jugadorA}
                                victorias={h2h.resumen.victoriasA}
                                lado="izquierda"
                            />
                            <div className="text-center">
                                <p className="text-3xl font-bold tabular-nums text-fg sm:text-4xl">
                                    <span>{h2h.resumen.victoriasA}</span>
                                    <span className="mx-2 text-fg-muted">–</span>
                                    <span>{h2h.resumen.victoriasB}</span>
                                </p>
                                <p className="mt-1 text-xs uppercase tracking-wide text-fg-muted">
                                    {h2h.resumen.jugados} {h2h.resumen.jugados === 1 ? 'duelo' : 'duelos'}
                                </p>
                            </div>
                            <LadoJugador
                                jugador={h2h.jugadorB}
                                victorias={h2h.resumen.victoriasB}
                                lado="derecha"
                            />
                        </div>

                        {/* Barra de dominio proporcional */}
                        {h2h.resumen.jugados > 0 && (
                            <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-subtle" role="img" aria-label="Proporción de victorias">
                                <div
                                    className="bg-emerald-500 transition-all duration-700"
                                    style={{ width: `${(h2h.resumen.victoriasA / h2h.resumen.jugados) * 100}%` }}
                                />
                                <div className="flex-1 bg-red-400 transition-all duration-700" />
                            </div>
                            )}
                    </Section>

                    {/* Historial de duelos */}
                    <Section title="Duelos previos" subtitle="Del más reciente al más antiguo">
                        {h2h.duelos.length === 0 ? (
                            <p className="py-6 text-center text-sm text-fg-muted">
                                Nunca se han enfrentado. ¡El próximo partido será el primero!
                            </p>
                        ) : (
                            <ul className="space-y-2">
                                {h2h.duelos.map((d, i) => (
                                    <li
                                        key={d.id}
                                        style={{ animationDelay: `${Math.min(i * 40, 200)}ms` }}
                                        className="animate-slide-up flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line bg-canvas/40 px-3 py-2.5 text-sm"
                                    >
                                        <span
                                            className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                                                d.ganadorId === h2h.jugadorA.id
                                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                                    : 'bg-red-500/15 text-red-600 dark:text-red-400'
                                            }`}
                                        >
                                            G: {d.ganadorNombre}
                                        </span>
                                        <span className="min-w-0 flex-1 truncate text-fg-muted">
                                            {d.torneoNombre || 'Torneo'}
                                        </span>
                                        <span className="shrink-0 text-xs text-fg-muted">
                                            {d.fecha
                                                ? new Date(d.fecha).toLocaleDateString('es', {
                                                      day: 'numeric',
                                                      month: 'short',
                                                      year: '2-digit',
                                                  })
                                                : ''}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Section>
                </>
            )}
        </div>
    )
}

function LadoJugador({
    jugador,
    victorias,
    lado,
}: {
    jugador: Jugador
    victorias: number
    lado: 'izquierda' | 'derecha'
}) {
    const alineacion = lado === 'izquierda' ? 'items-start text-left' : 'items-end text-right'
    return (
        <div className={`flex min-w-0 flex-col ${alineacion}`}>
            <p className="truncate text-sm font-semibold text-fg sm:text-base">{jugador.nombre}</p>
            <p className="truncate text-xs capitalize text-fg-muted">
                {[jugador.categorias?.nombre, `ELO ${Math.round(Number(jugador.elo) || 0)}`]
                    .filter(Boolean)
                    .join(' · ')}
            </p>
            <p className="mt-1 text-xs font-medium text-fg-muted">{victorias} victorias</p>
        </div>
    )
}
