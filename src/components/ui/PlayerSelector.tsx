'use client'
import { useState } from 'react'
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'

interface Jugador {
    id: number
    nombre: string
    categoria_id?: number
    categorias?: {
        id: number
        nombre: string
    }
}

interface SelectorJugadoresProps {
    jugadores: Jugador[]
    selectedJugadores: Jugador[]
    onJugadorChange: (jugador: Jugador) => void
    onRemoveJugador: (jugadorId: number) => void
    showTags?: boolean
}

export default function SelectorJugadores({
                                              jugadores,
                                              selectedJugadores,
                                              onJugadorChange,
                                              onRemoveJugador,
                                              showTags = true
                                          }: SelectorJugadoresProps) {
    const [searchTerm, setSearchTerm] = useState('')

    const filteredJugadores = jugadores.filter(jugador =>
        jugador.nombre.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="space-y-5">
            <Input
                type="text"
                placeholder="Nombre del jugador..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                leadingIcon={<MagnifyingGlassIcon className="h-4 w-4" />}
            />

            {showTags && selectedJugadores.length > 0 && (
                <div className="card-flush p-3">
                    <h3 className="text-xs font-semibold text-fg-muted mb-2">
                        Jugadores seleccionados ({selectedJugadores.length})
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                        {selectedJugadores.map(jugador => (
                            <Badge key={jugador.id} variant="brand" className="gap-1.5 pr-1">
                                {jugador.nombre}
                                <button
                                    type="button"
                                    onClick={() => onRemoveJugador(jugador.id)}
                                    className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-brand/20 transition-colors"
                                    aria-label={`Quitar a ${jugador.nombre}`}
                                    title="Eliminar"
                                >
                                    <XMarkIcon className="h-3 w-3" />
                                </button>
                            </Badge>
                        ))}
                    </div>
                </div>
            )}

            <div>
                <label className="label">Listado de jugadores</label>
                <div className="card-flush max-h-60 overflow-y-auto scrollbar-thin">
                    {filteredJugadores.length === 0 ? (
                        <p className="p-4 text-center text-sm text-fg-muted">
                            No se encontraron jugadores
                        </p>
                    ) : (
                        <ul className="divide-y divide-line">
                            {filteredJugadores.map(jugador => {
                                const isChecked = selectedJugadores.some(j => j.id === jugador.id)
                                return (
                                    <li key={jugador.id} className="px-3 py-2 hover:bg-subtle transition-colors">
                                        <label className="flex items-center gap-3 cursor-pointer select-none text-sm">
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => onJugadorChange(jugador)}
                                                className="h-4 w-4 rounded border-line text-brand focus:ring-brand bg-surface"
                                            />
                                            <span className="text-fg">{jugador.nombre}</span>
                                            {jugador.categorias?.nombre && (
                                                <Badge variant="neutral" className="ml-auto text-[0.65rem]">
                                                    {jugador.categorias.nombre}
                                                </Badge>
                                            )}
                                        </label>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    )
}
