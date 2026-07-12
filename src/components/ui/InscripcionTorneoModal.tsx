'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import PlayerSelector from '@/components/ui/PlayerSelector'

interface Jugador { id: number; nombre: string; categoria_id: number }
interface Categoria { id: number; nombre: string }
interface Inscripcion { id?: number; nombrePersonalizado: string; jugadores: Jugador[] }
interface Torneo {
    id: number
    nombre: string
    modalidad: 'INDIVIDUAL' | 'DOBLES' | 'EQUIPOS'
    torneo_categorias: { categorias?: Categoria }[]
}

interface Props { isOpen: boolean; onClose: () => void; torneo: Torneo | null }

const etiquetasModalidad = {
    INDIVIDUAL: 'Individual',
    DOBLES: 'Dobles',
    EQUIPOS: 'Por equipos'
}

export default function InscripcionTorneoModal({ isOpen, onClose, torneo }: Props) {
    const [categoriaId, setCategoriaId] = useState('')
    const [jugadoresDisponibles, setJugadoresDisponibles] = useState<Jugador[]>([])
    const [inscripciones, setInscripciones] = useState<Inscripcion[]>([])
    const [jugadoresEnEdicion, setJugadoresEnEdicion] = useState<Jugador[]>([])
    const [nombrePersonalizado, setNombrePersonalizado] = useState('')
    const [isSaving, setIsSaving] = useState(false)

    const categorias = torneo?.torneo_categorias.map(item => item.categorias).filter(Boolean) as Categoria[] || []
    const modalidad = torneo?.modalidad || 'INDIVIDUAL'
    const jugadoresUsados = useMemo(
        () => new Set(inscripciones.flatMap(inscripcion => inscripcion.jugadores.map(jugador => jugador.id))),
        [inscripciones]
    )

    useEffect(() => {
        setCategoriaId(categorias[0]?.id.toString() || '')
        setInscripciones([])
        setJugadoresEnEdicion([])
        setNombrePersonalizado('')
    }, [torneo])

    useEffect(() => {
        if (!torneo || !categoriaId || !isOpen) return

        const cargar = async () => {
            try {
                const [resJugadores, resInscritos] = await Promise.all([
                    fetch(`/api/jugadores?all=true&categoriaId=${categoriaId}`),
                    fetch(`/api/torneos/${torneo.id}/participantes?categoriaId=${categoriaId}`)
                ])
                const dataJugadores = await resJugadores.json()
                const dataInscritos = await resInscritos.json()
                setJugadoresDisponibles(dataJugadores.jugadores || [])
                setInscripciones((dataInscritos.participantes || []).map((participante: any) => ({
                    id: participante.id,
                    nombrePersonalizado: participante.nombre_personalizado || '',
                    jugadores: participante.miembros?.map((miembro: any) => miembro.jugadores)
                        || (participante.jugadores ? [participante.jugadores] : [])
                })))
            } catch {
                toast.error('No se pudieron cargar las inscripciones')
            }
        }
        cargar()
    }, [categoriaId, isOpen, torneo])

    const cambiarJugador = (jugador: Jugador) => {
        if (jugadoresUsados.has(jugador.id)) {
            toast.error('Ese jugador ya pertenece a otra inscripción')
            return
        }
        setJugadoresEnEdicion(prev => prev.some(item => item.id === jugador.id)
            ? prev.filter(item => item.id !== jugador.id)
            : [...prev, jugador])
    }

    const agregarInscripcion = () => {
        const cantidadValida = modalidad === 'EQUIPOS'
            ? jugadoresEnEdicion.length >= 3
            : jugadoresEnEdicion.length === (modalidad === 'DOBLES' ? 2 : 1)

        if (!cantidadValida) {
            const mensaje = modalidad === 'EQUIPOS'
                ? 'Un equipo debe tener al menos 3 jugadores'
                : modalidad === 'DOBLES' ? 'Una pareja debe tener exactamente 2 jugadores' : 'Selecciona un jugador'
            toast.error(mensaje)
            return
        }

        setInscripciones(prev => [...prev, {
            nombrePersonalizado: nombrePersonalizado.trim(),
            jugadores: jugadoresEnEdicion
        }])
        setJugadoresEnEdicion([])
        setNombrePersonalizado('')
    }

    const guardar = async () => {
        if (!torneo || !categoriaId) return
        setIsSaving(true)
        try {
            const response = await fetch(`/api/torneos/${torneo.id}/participantes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    categoriaId: Number(categoriaId),
                    participantes: inscripciones.map(inscripcion => ({
                        nombrePersonalizado: inscripcion.nombrePersonalizado,
                        jugadoresIds: inscripcion.jugadores.map(jugador => jugador.id)
                    }))
                })
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || 'No se pudieron guardar las inscripciones')
            toast.success('Inscripciones actualizadas')
            onClose()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Error de conexión')
        } finally {
            setIsSaving(false)
        }
    }

    if (!isOpen || !torneo) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-5xl max-h-[92vh]">
                <div className="flex items-center justify-between px-6 py-4 border-b">
                    <div>
                        <h2 className="text-xl font-black text-slate-800">Inscripciones · {etiquetasModalidad[modalidad]}</h2>
                        <p className="text-sm text-slate-500">{torneo.nombre}</p>
                    </div>
                    <button onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-700">×</button>
                </div>

                <div className="px-6 py-3 bg-gray-50 border-b">
                    <label className="text-sm font-bold text-gray-700 mr-3">Categoría:</label>
                    <select value={categoriaId} onChange={e => setCategoriaId(e.target.value)} className="p-2 border rounded-lg bg-white">
                        {categorias.map(categoria => <option key={categoria.id} value={categoria.id}>{categoria.nombre}</option>)}
                    </select>
                </div>

                <div className="grid md:grid-cols-[1fr_360px] flex-1 overflow-hidden">
                    <div className="p-5 overflow-y-auto border-r">
                        <h3 className="font-bold text-slate-700 mb-3">
                            Crear {modalidad === 'EQUIPOS' ? 'equipo' : modalidad === 'DOBLES' ? 'pareja' : 'participante'}
                        </h3>
                        {modalidad !== 'INDIVIDUAL' && (
                            <input
                                value={nombrePersonalizado}
                                onChange={e => setNombrePersonalizado(e.target.value)}
                                placeholder="Nombre personalizado (opcional)"
                                className="w-full mb-4 p-2 border rounded-lg"
                            />
                        )}
                        <PlayerSelector
                            jugadores={jugadoresDisponibles}
                            selectedJugadores={jugadoresEnEdicion}
                            onJugadorChange={cambiarJugador}
                            onRemoveJugador={id => setJugadoresEnEdicion(prev => prev.filter(jugador => jugador.id !== id))}
                        />
                        <button onClick={agregarInscripcion} className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-4 py-2.5">
                            Añadir {modalidad === 'EQUIPOS' ? 'equipo' : modalidad === 'DOBLES' ? 'pareja' : 'participante'}
                        </button>
                    </div>

                    <div className="p-5 overflow-y-auto bg-slate-50">
                        <h3 className="font-bold text-slate-700 mb-3">Inscritos ({inscripciones.length})</h3>
                        <div className="space-y-2">
                            {inscripciones.map((inscripcion, index) => (
                                <div key={`${inscripcion.id || 'nuevo'}-${index}`} className="bg-white border rounded-lg p-3">
                                    <div className="flex justify-between gap-2">
                                        <p className="font-semibold text-sm text-slate-800">
                                            {inscripcion.nombrePersonalizado || inscripcion.jugadores.map(jugador => jugador.nombre).join(' / ')}
                                        </p>
                                        <button onClick={() => setInscripciones(prev => prev.filter((_, itemIndex) => itemIndex !== index))} className="text-red-500 text-sm">Quitar</button>
                                    </div>
                                    {inscripcion.nombrePersonalizado && <p className="text-xs text-slate-500 mt-1">{inscripcion.jugadores.map(jugador => jugador.nombre).join(' / ')}</p>}
                                </div>
                            ))}
                            {inscripciones.length === 0 && <p className="text-sm text-slate-400">Aún no hay inscritos.</p>}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50">
                    <button onClick={onClose} disabled={isSaving} className="px-4 py-2 border rounded-lg">Cancelar</button>
                    <button onClick={guardar} disabled={isSaving} className="px-5 py-2 bg-blue-600 text-white rounded-lg font-semibold disabled:bg-gray-400">
                        {isSaving ? 'Guardando...' : 'Guardar inscripciones'}
                    </button>
                </div>
            </div>
        </div>
    )
}
