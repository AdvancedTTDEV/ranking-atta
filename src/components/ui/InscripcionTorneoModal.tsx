'use client'
import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import PlayerSelector from '@/components/ui/PlayerSelector'

interface Jugador {
    id: number
    nombre: string
    categoria_id: number
}

interface TorneoCategoriaItem {
    categorias?: {
        id: number
        nombre: string
    }
}

interface Torneo {
    id: number
    nombre: string
    torneo_categorias: TorneoCategoriaItem[]
}

interface InscripcionTorneoModalProps {
    isOpen: boolean
    onClose: () => void
    torneo: Torneo | null
}

export default function InscripcionTorneoModal({ isOpen, onClose, torneo }: InscripcionTorneoModalProps) {
    const [selectedCategoriaId, setSelectedCategoriaId] = useState<string>('')
    const [jugadoresDisponibles, setJugadoresDisponibles] = useState<Jugador[]>([])
    const [selectedJugadores, setSelectedJugadores] = useState<Jugador[]>([])
    const [isSaving, setIsSaving] = useState(false)

    const categoriasDelTorneo = torneo?.torneo_categorias
        ?.map(tc => tc.categorias)
        .filter(Boolean) as { id: number; nombre: string }[] || []

    useEffect(() => {
        if (categoriasDelTorneo.length > 0) {
            setSelectedCategoriaId(categoriasDelTorneo[0].id.toString())
        }
    }, [torneo])

    useEffect(() => {
        if (!torneo || !selectedCategoriaId) return

        const fetchData = async () => {
            try {
                const resJugadores = await fetch(`/api/jugadores?all=true&categoriaId=${selectedCategoriaId}`)
                const dataJugadores = await resJugadores.json()
                setJugadoresDisponibles(dataJugadores.jugadores || [])

                const resInscritos = await fetch(`/api/torneos/${torneo.id}/participantes?categoriaId=${selectedCategoriaId}`)
                if (resInscritos.ok) {
                    const dataInscritos = await resInscritos.json()
                    const jugadoresInscritos: Jugador[] = (dataInscritos.participantes || [])
                        .map((p: any) => p.jugadores)
                        .filter(Boolean)
                    setSelectedJugadores(jugadoresInscritos)
                } else {
                    setSelectedJugadores([])
                }
            } catch (error) {
                console.error(error)
                toast.error('Error al cargar datos de inscripciones')
            }
        }

        fetchData()
    }, [selectedCategoriaId, torneo])

    const handleJugadorChange = (jugador: Jugador) => {
        setSelectedJugadores(prev => {
            const exists = prev.find(j => j.id === jugador.id)
            return exists ? prev.filter(j => j.id !== jugador.id) : [...prev, jugador]
        })
    }

    const handleRemoveJugador = (jugadorId: number) => {
        setSelectedJugadores(prev => prev.filter(j => j.id !== jugadorId))
    }

    const handleGuardarInscripciones = async () => {
        if (!torneo || !selectedCategoriaId) return
        setIsSaving(true)
        try {
            const response = await fetch(`/api/torneos/${torneo.id}/participantes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    categoriaId: Number(selectedCategoriaId),
                    jugadoresIds: selectedJugadores.map(j => j.id)
                })
            })
            if (response.ok) {
                toast.success('Inscripciones actualizadas correctamente')
                onClose()
            } else {
                const errData = await response.json()
                toast.error(errData.error || 'Error al guardar inscripciones')
            }
        } catch (error) {
            console.error(error)
            toast.error('Error de conexión con el servidor')
        } finally {
            setIsSaving(false)
        }
    }

    if (!isOpen || !torneo) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-5xl max-h-[92vh]">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
                    <div>
                        <h2 className="text-xl font-black text-slate-800">Inscripciones</h2>
                        <p className="text-sm text-slate-500 font-medium">{torneo.nombre}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full p-2 transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Selector de categoría */}
                <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 shrink-0">
                    <div className="flex items-center gap-4">
                        <label className="text-sm font-bold text-gray-700 shrink-0">Categoría:</label>
                        <select
                            value={selectedCategoriaId}
                            onChange={(e) => setSelectedCategoriaId(e.target.value)}
                            className="p-2 border border-gray-300 rounded-lg bg-white font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        >
                            {categoriasDelTorneo.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                            ))}
                        </select>
                        <span className="text-xs text-gray-400">
                            {selectedJugadores.length} inscritos · {jugadoresDisponibles.length} disponibles
                        </span>
                    </div>
                </div>

                {/* Contenido en dos columnas */}
                <div className="flex flex-1 overflow-hidden">

                    {/* Columna izquierda — jugadores disponibles */}
                    <div className="flex-1 flex flex-col border-r border-gray-200 overflow-hidden">
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 shrink-0">
                            <h3 className="text-sm font-bold text-gray-700">Jugadores disponibles</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4">
                            <PlayerSelector
                                jugadores={jugadoresDisponibles}
                                selectedJugadores={selectedJugadores}
                                onJugadorChange={handleJugadorChange}
                                onRemoveJugador={handleRemoveJugador}
                                showTags={false}
                            />
                        </div>
                    </div>

                    {/* Columna derecha — inscritos */}
                    <div className="w-72 flex flex-col overflow-hidden shrink-0">
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 shrink-0">
                            <h3 className="text-sm font-bold text-gray-700">
                                Inscritos
                                <span className="ml-2 bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                    {selectedJugadores.length}
                                </span>
                            </h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3">
                            {selectedJugadores.length === 0 ? (
                                <div className="text-center text-gray-400 text-sm mt-8">
                                    <p className="text-2xl mb-2">👈</p>
                                    <p>Selecciona jugadores de la lista</p>
                                </div>
                            ) : (
                                <ul className="space-y-1.5">
                                    {selectedJugadores.map((j, idx) => (
                                        <li key={j.id} className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-sm">
                                            <span className="flex items-center gap-2">
                                                <span className="text-blue-400 text-xs w-4">{idx + 1}.</span>
                                                <span className="font-medium text-gray-800">{j.nombre}</span>
                                            </span>
                                            <button
                                                onClick={() => handleRemoveJugador(j.id)}
                                                className="text-red-400 hover:text-red-600 ml-2 shrink-0"
                                            >
                                                ✕
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-between items-center px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl shrink-0">
                    <span className="text-sm text-gray-500">
                        {selectedJugadores.length} jugador{selectedJugadores.length !== 1 ? 'es' : ''} seleccionado{selectedJugadores.length !== 1 ? 's' : ''}
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            disabled={isSaving}
                            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 text-sm font-medium transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleGuardarInscripciones}
                            disabled={isSaving}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:bg-gray-400 transition-colors"
                        >
                            {isSaving ? 'Guardando...' : 'Guardar Inscritos'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}