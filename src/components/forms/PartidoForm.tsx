'use client'

import { useState, useEffect, useMemo, useRef, FormEvent } from 'react'
import { toast } from 'react-hot-toast'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'

interface Jugador {
    id: number
    nombre: string
    elo: number
}

interface Torneo {
    id: number
    nombre: string
    fecha: string
}

interface PartidoFormProps {
    onSuccessAction: () => void
    onCancelAction: () => void
}

export default function PartidoForm({ onSuccessAction, onCancelAction }: PartidoFormProps) {
    const [jugador1Id, setJugador1Id] = useState('')
    const [jugador2Id, setJugador2Id] = useState('')
    const [ganadorId, setGanadorId] = useState('')
    const [torneoId, setTorneoId] = useState('')
    const [ronda, setRonda] = useState('')
    const [tipoEspecial, setTipoEspecial] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [jugadores, setJugadores] = useState<Jugador[]>([])
    const [torneos, setTorneos] = useState<Torneo[]>([])
    const [isLoading, setIsLoading] = useState(true)

    const [jugador1Search, setJugador1Search] = useState('')
    const [jugador2Search, setJugador2Search] = useState('')
    const [showPlayer1Results, setShowPlayer1Results] = useState(false)
    const [showPlayer2Results, setShowPlayer2Results] = useState(false)

    const p1Ref = useRef<HTMLDivElement>(null)
    const p2Ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const fetchData = async () => {
            try {
                setIsLoading(true)
                const [jugadoresRes, torneosRes] = await Promise.all([
                    fetch('/api/jugadores?all=true'),
                    fetch('/api/torneos?all=true'),
                ])
                const jugadoresData = await jugadoresRes.json()
                const jugadoresArray = jugadoresData.jugadores || jugadoresData.data || []
                setJugadores(Array.isArray(jugadoresArray) ? jugadoresArray : [])
                const torneosData = await torneosRes.json()
                const torneosArray = torneosData.torneos || torneosData.data || []
                setTorneos(Array.isArray(torneosArray) ? torneosArray : [])
            } catch {
                toast.error('Error cargando datos')
                setJugadores([])
                setTorneos([])
            } finally {
                setIsLoading(false)
            }
        }
        fetchData()
    }, [])

    // Auto-select most recent tournament
    useEffect(() => {
        if (torneos.length > 0 && !torneoId) {
            setTorneoId(torneos[0].id.toString())
        }
    }, [torneos, torneoId])

    // Close dropdowns on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (p1Ref.current && !p1Ref.current.contains(e.target as Node)) setShowPlayer1Results(false)
            if (p2Ref.current && !p2Ref.current.contains(e.target as Node)) setShowPlayer2Results(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const filteredPlayers1 = useMemo(() => {
        if (!jugador1Search) return jugadores
        const term = jugador1Search.toLowerCase()
        return jugadores.filter(
            (p) => p.nombre.toLowerCase().includes(term) || p.elo.toString().includes(term)
        )
    }, [jugadores, jugador1Search])

    const filteredPlayers2 = useMemo(() => {
        const filtered = jugadores.filter((j) => j.id !== parseInt(jugador1Id || '0'))
        if (!jugador2Search) return filtered
        const term = jugador2Search.toLowerCase()
        return filtered.filter(
            (p) => p.nombre.toLowerCase().includes(term) || p.elo.toString().includes(term)
        )
    }, [jugadores, jugador2Search, jugador1Id])

    // Auto winner if only one player
    useEffect(() => {
        if (jugador1Id && !jugador2Id) {
            setGanadorId(jugador1Id)
        }
    }, [jugador1Id, jugador2Id])

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setIsSubmitting(true)
        const partidoData = {
            jugador1_id: jugador1Id,
            jugador2_id: jugador2Id || null,
            ganador_id: ganadorId,
            torneo_id: torneoId,
            ronda: ronda || null,
            tipo_especial: tipoEspecial || null,
        }
        try {
            const response = await fetch('/api/partidos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(partidoData),
            })
            if (response.ok) {
                toast.success('Partido registrado exitosamente')
                onSuccessAction()
            } else {
                const errorData = await response.json()
                toast.error(errorData.message || 'Error al registrar partido')
            }
        } catch {
            toast.error('Error de conexión')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <Select
                label="Torneo"
                value={torneoId}
                onChange={(e) => setTorneoId(e.target.value)}
                required
                disabled={isLoading}
            >
                <option value="">Selecciona un torneo</option>
                {isLoading ? (
                    <option>Cargando torneos…</option>
                ) : torneos.length === 0 ? (
                    <option>No hay torneos disponibles</option>
                ) : (
                    torneos.map((torneo) => (
                        <option key={torneo.id} value={torneo.id}>
                            {torneo.nombre} — {new Date(torneo.fecha).toLocaleDateString()}
                        </option>
                    ))
                )}
            </Select>

            {/* Player dropdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="w-full" ref={p1Ref}>
                    <label htmlFor="player1-search" className="label">Jugador 1</label>
                    <div className="relative">
                        <input
                            id="player1-search"
                            type="text"
                            value={jugador1Search}
                            onChange={(e) => {
                                setJugador1Search(e.target.value)
                                setShowPlayer1Results(true)
                            }}
                            onFocus={() => setShowPlayer1Results(true)}
                            placeholder="Buscar jugador…"
                            className="input-base"
                            required
                            autoComplete="off"
                        />
                        {showPlayer1Results && filteredPlayers1.length > 0 && (
                            <div className="absolute z-20 mt-1 w-full card-elevated max-h-60 overflow-auto scrollbar-thin py-1">
                                {filteredPlayers1.map((j) => (
                                    <button
                                        key={j.id}
                                        type="button"
                                        onClick={() => {
                                            setJugador1Id(j.id.toString())
                                            setJugador1Search(j.nombre)
                                            setShowPlayer1Results(false)
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-subtle transition-colors flex items-center gap-2"
                                    >
                                        <span className="text-fg">{j.nombre}</span>
                                        <span className="text-xs text-fg-muted ml-auto">{j.elo} pts</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="w-full" ref={p2Ref}>
                    <label htmlFor="player2-search" className="label">Jugador 2 (opcional)</label>
                    <div className="relative">
                        <input
                            id="player2-search"
                            type="text"
                            value={jugador2Search}
                            onChange={(e) => {
                                setJugador2Search(e.target.value)
                                setShowPlayer2Results(true)
                            }}
                            onFocus={() => setShowPlayer2Results(true)}
                            placeholder="Buscar jugador…"
                            className="input-base"
                            autoComplete="off"
                        />
                        {showPlayer2Results && filteredPlayers2.length > 0 && (
                            <div className="absolute z-20 mt-1 w-full card-elevated max-h-60 overflow-auto scrollbar-thin py-1">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setJugador2Id('')
                                        setJugador2Search('')
                                        setShowPlayer2Results(false)
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm text-fg-muted hover:bg-subtle transition-colors italic"
                                >
                                    Bye / Forfeit
                                </button>
                                {filteredPlayers2.map((j) => (
                                    <button
                                        key={j.id}
                                        type="button"
                                        onClick={() => {
                                            setJugador2Id(j.id.toString())
                                            setJugador2Search(j.nombre)
                                            setShowPlayer2Results(false)
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-subtle transition-colors flex items-center gap-2"
                                    >
                                        <span className="text-fg">{j.nombre}</span>
                                        <span className="text-xs text-fg-muted ml-auto">{j.elo} pts</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {jugador1Id && jugador2Id && (
                <Select
                    label="Ganador"
                    value={ganadorId}
                    onChange={(e) => setGanadorId(e.target.value)}
                    required
                >
                    <option value="">Selecciona un ganador</option>
                    <option value={jugador1Id}>
                        {jugadores.find((j) => j.id === parseInt(jugador1Id))?.nombre}
                    </option>
                    <option value={jugador2Id}>
                        {jugadores.find((j) => j.id === parseInt(jugador2Id))?.nombre}
                    </option>
                </Select>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                    label="Ronda"
                    value={ronda}
                    onChange={(e) => setRonda(e.target.value)}
                    required
                >
                    <option value="">Selecciona una ronda</option>
                    <option value="Grupos">Grupos</option>
                    <option value="32avos">32avos</option>
                    <option value="16avos">16avos</option>
                    <option value="Octavos">Octavos</option>
                    <option value="Cuartos">Cuartos</option>
                    <option value="Semifinal">Semifinal</option>
                    <option value="Campeón">Campeón</option>
                </Select>
                <Select
                    label="Tipo especial"
                    value={tipoEspecial}
                    onChange={(e) => setTipoEspecial(e.target.value)}
                >
                    <option value="">Ninguno</option>
                    <option value="Forfeit">Forfeit</option>
                    <option value="Bye">Bye</option>
                </Select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={onCancelAction} disabled={isSubmitting}>
                    Cancelar
                </Button>
                <Button type="submit" variant="primary" isLoading={isSubmitting}>
                    {isSubmitting ? 'Registrando…' : 'Registrar Partido'}
                </Button>
            </div>
        </form>
    )
}
