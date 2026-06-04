'use client'
import { useState } from 'react'

interface Jugador {
    id: number
    nombre: string
    categoria_id: number
    categorias?: {
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
        <div className="space-y-6">
            <div>
                <label className="block mb-2 font-medium text-gray-700">
                    Buscar jugador
                </label>
                <input
                    type="text"
                    placeholder="Nombre del jugador..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                />
            </div>

            {showTags && selectedJugadores.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">
                        Jugadores seleccionados ({selectedJugadores.length}):
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {selectedJugadores.map(jugador => (
                            <div
                                key={jugador.id}
                                className="flex items-center bg-blue-100 text-blue-800 rounded-full py-1 px-3 text-sm font-medium"
                            >
                                {jugador.nombre}
                                <button
                                    type="button"
                                    onClick={() => onRemoveJugador(jugador.id)}
                                    className="ml-2 text-blue-600 hover:text-blue-900 focus:outline-none text-base font-bold"
                                    title="Eliminar"
                                >
                                    &times;
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div>
                <label className="block mb-2 font-medium text-gray-700">
                    Listado de Jugadores
                </label>
                <div className="border border-gray-300 rounded-md max-h-60 overflow-y-auto shadow-sm bg-white">
                    {filteredJugadores.length === 0 ? (
                        <p className="p-4 text-center text-gray-500">
                            No se encontraron jugadores
                        </p>
                    ) : (
                        <ul className="divide-y divide-gray-200">
                            {filteredJugadores.map(jugador => {
                                const isChecked = selectedJugadores.some(j => j.id === jugador.id)
                                return (
                                    <li key={jugador.id} className="p-3 hover:bg-gray-50 transition">
                                        <label className="flex items-center cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => onJugadorChange(jugador)}
                                                className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                            />
                                            <span className="ml-3 block text-gray-900">
                                                {jugador.nombre}
                                            </span>
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