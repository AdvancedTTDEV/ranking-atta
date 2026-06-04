'use client'
import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import Modal from '@/components/ui/Modal'
import PlayerSelector from '@/components/ui/PlayerSelector'

interface Jugador {
    id: number
    nombre: string
    categoria_id: number // 🔥 Usaremos este ID directo de la raíz
    categorias?: {
        nombre: string
    }
}

interface Categoria {
    id: number
    nombre: string
}

interface Props {
    tipo: 'ascenso' | 'descenso'
    onClose: () => void
}

export default function GestionAscensoDescenso({ tipo, onClose }: Props) {
    const [categorias, setCategorias] = useState<Categoria[]>([])
    const [jugadores, setJugadores] = useState<Jugador[]>([])
    const [selectedCategoriaId, setSelectedCategoriaId] = useState<string>('')
    const [selectedJugadores, setSelectedJugadores] = useState<Jugador[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [showConfirmation, setShowConfirmation] = useState(false)

    useEffect(() => {
        const fetchCategorias = async () => {
            try {
                const res = await fetch('/api/categorias')
                const data = await res.json()
                const filtered = data.filter((cat: Categoria) =>
                    tipo === 'ascenso' ? cat.id !== 1 : cat.id !== 4
                )
                setCategorias(filtered)
                if (filtered.length > 0) {
                    setSelectedCategoriaId(filtered[0].id.toString())
                }
            } catch (error) {
                console.error(error)
                toast.error('Error al obtener categorías')
            }
        }
        fetchCategorias()
    }, [tipo])

    useEffect(() => {
        if (!selectedCategoriaId) return
        const fetchJugadores = async () => {
            try {
                const res = await fetch(`/api/jugadores?all=true&categoriaId=${selectedCategoriaId}`)
                const data = await res.json()
                setJugadores(data.jugadores)
            } catch (error) {
                console.error(error)
                toast.error('Error al obtener jugadores')
            }
        }
        fetchJugadores()
    }, [selectedCategoriaId])

    const handleJugadorChange = (jugador: Jugador) => {
        setSelectedJugadores(prev => {
            const exists = prev.find(j => j.id === jugador.id)
            return exists ? prev.filter(j => j.id !== jugador.id) : [...prev, jugador]
        })
    }

    const handleRemoveJugador = (jugadorId: number) => {
        setSelectedJugadores(prev => prev.filter(j => j.id !== jugadorId))
    }

    const handleSubmit = async () => {
        setIsSubmitting(true)
        try {
            const motivo = tipo === 'ascenso' ? 'Ascenso' : 'Descenso'

            // 🔥 Agrupamos usando j.categoria_id directamente de la raíz
            const grupos = selectedJugadores.reduce((acc, j) => {
                const catId = j.categoria_id
                if (!catId) return acc
                if (!acc[catId]) acc[catId] = []
                acc[catId].push(j)
                return acc
            }, {} as Record<number, Jugador[]>)

            for (const [catId, jugadoresGrupo] of Object.entries(grupos)) {
                const newCategoriaId = tipo === 'ascenso'
                    ? Number(catId) - 1
                    : Number(catId) + 1

                const res = await fetch('/api/jugadores/cambiar-categoria', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jugadores: jugadoresGrupo,
                        nuevaCategoriaId: newCategoriaId,
                        motivo
                    })
                })

                if (!res.ok) {
                    const errorData = await res.json()
                    toast.error(errorData.error || 'Error al aplicar cambios')
                    return
                }
            }

            toast.success(`${motivo}s aplicados correctamente`)
            window.dispatchEvent(new Event('ranking:refresh'))
            onClose()
        } catch (err) {
            console.error(err)
            toast.error('Error de conexión')
        } finally {
            setIsSubmitting(false)
            setShowConfirmation(false)
        }
    }

    const getCategoriaChange = (jugador: Jugador) => {
        if (!jugador.categorias) return { actual: 'Desconocida', nueva: 'Desconocida' }
        const categoriaActual = jugador.categorias.nombre
        let nuevaCategoria = 'Desconocida'
        if (tipo === 'ascenso') {
            switch (categoriaActual.toLowerCase()) { // ToLowerCase para evitar sustos con mayúsculas
                case 'segunda': nuevaCategoria = 'Primera'; break;
                case 'tercera': nuevaCategoria = 'Segunda'; break;
                case 'cuarta': nuevaCategoria = 'Tercera'; break;
            }
        } else {
            switch (categoriaActual.toLowerCase()) {
                case 'primera': nuevaCategoria = 'Segunda'; break;
                case 'segunda': nuevaCategoria = 'Tercera'; break;
                case 'tercera': nuevaCategoria = 'Cuarta'; break;
            }
        }
        return { actual: categoriaActual, nueva: nuevaCategoria }
    }

    const esAscenso = tipo === 'ascenso'
    const colorBoton = esAscenso ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'

    return (
        <>
            {/* Selector de categoría */}
            <div className="flex items-center gap-4 mb-4 pb-4 border-b border-gray-200">
                <label className="text-sm font-bold text-gray-700 shrink-0">Categoría:</label>
                <select
                    value={selectedCategoriaId}
                    onChange={(e) => setSelectedCategoriaId(e.target.value)}
                    className="p-2 border border-gray-300 rounded-lg bg-white font-medium focus:ring-2 focus:ring-blue-500 text-sm"
                >
                    {categorias.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                    ))}
                </select>
                <span className="text-xs text-gray-400">
                    Cambia de categoría para seleccionar jugadores de cada una
                </span>
            </div>

            {/* Dos columnas */}
            <div className="flex gap-4 h-[50vh]">

                {/* Izquierda — buscador y checkboxes */}
                <div className="flex-1 flex flex-col border border-gray-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 shrink-0">
                        <h3 className="text-sm font-bold text-gray-700">Jugadores disponibles</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4">
                        <PlayerSelector
                            jugadores={jugadores}
                            selectedJugadores={selectedJugadores}
                            onJugadorChange={handleJugadorChange}
                            onRemoveJugador={handleRemoveJugador}
                            showTags={false}
                        />
                    </div>
                </div>

                {/* Derecha — seleccionados */}
                <div className="w-72 flex flex-col border border-gray-200 rounded-xl overflow-hidden shrink-0">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 shrink-0">
                        <h3 className="text-sm font-bold text-gray-700">
                            {esAscenso ? 'A ascender' : 'A descender'}
                            <span className={`ml-2 text-xs font-bold px-2 py-0.5 rounded-full ${esAscenso ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
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
                                {selectedJugadores.map((j, idx) => {
                                    const { actual, nueva } = getCategoriaChange(j)
                                    return (
                                        <li key={j.id} className={`border rounded-lg px-3 py-2 text-sm ${esAscenso ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                                            <div className="flex items-center justify-between">
                                                <span className="flex items-center gap-2">
                                                    <span className="text-gray-400 text-xs w-4">{idx + 1}.</span>
                                                    <span className="font-medium text-gray-800">{j.nombre}</span>
                                                </span>
                                                <button
                                                    onClick={() => handleRemoveJugador(j.id)}
                                                    className="text-red-400 hover:text-red-600 ml-2 shrink-0"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                            <p className="text-xs text-gray-400 mt-1 ml-5">
                                                {actual} → <span className="font-semibold text-gray-600">{nueva}</span>
                                            </p>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-200">
                <span className="text-sm text-gray-500">
                    {selectedJugadores.length} jugador{selectedJugadores.length !== 1 ? 'es' : ''} seleccionado{selectedJugadores.length !== 1 ? 's' : ''}
                </span>
                <div className="flex gap-2">
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 text-sm font-medium"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => setShowConfirmation(true)}
                        disabled={selectedJugadores.length === 0 || isSubmitting}
                        className={`px-6 py-2 text-white rounded-lg text-sm font-semibold disabled:bg-gray-400 ${colorBoton}`}
                    >
                        {esAscenso ? 'Ascender seleccionados' : 'Descender seleccionados'}
                    </button>
                </div>
            </div>

            {/* Modal de confirmación */}
            <Modal
                isOpen={showConfirmation}
                onClose={() => setShowConfirmation(false)}
                title={`Confirmar ${esAscenso ? 'ascensos' : 'descensos'}`}
            >
                <div className="mb-6">
                    <p className="mb-4">Estás a punto de realizar los siguientes cambios:</p>
                    <div className="border rounded-md p-4 max-h-60 overflow-y-auto">
                        <ul className="space-y-2">
                            {selectedJugadores.map(jugador => {
                                const { actual, nueva } = getCategoriaChange(jugador)
                                return (
                                    <li key={jugador.id} className="flex justify-between items-center py-2 border-b">
                                        <span className="font-medium">{jugador.nombre}</span>
                                        <div className="flex items-center gap-2 text-sm">
                                            <span className="text-gray-600">{actual}</span>
                                            <span className="text-gray-400">→</span>
                                            <span className="font-semibold">{nueva}</span>
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                    <p className="mt-4 text-sm text-red-600">⚠️ Esta acción no se puede deshacer. ¿Desea continuar?</p>
                </div>
                <div className="flex justify-end space-x-3">
                    <button
                        onClick={() => setShowConfirmation(false)}
                        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                        disabled={isSubmitting}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className={`px-4 py-2 rounded-md text-white disabled:bg-gray-400 ${colorBoton}`}
                    >
                        {isSubmitting ? 'Procesando...' : 'Confirmar cambios'}
                    </button>
                </div>
            </Modal>
        </>
    )
}