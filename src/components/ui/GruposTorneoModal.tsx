'use client'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'react-hot-toast'

interface Club { id: number; nombre: string }
interface Jugador { nombre: string; elo: number; clubes: Club }
interface TorneoParticipante { id: number; jugadores: Jugador }
interface TorneoGrupoParticipante { id: number; posicion: number; torneo_participantes: TorneoParticipante }
interface TorneoGrupo { id: number; numero_grupo: number; participantes: TorneoGrupoParticipante[] }
interface Categoria { id: number; nombre: string }
interface TorneoCategoria { categorias: Categoria }
interface Torneo { id: number; nombre: string; torneo_categorias: TorneoCategoria[] }

interface GruposTorneoModalProps {
    isOpen: boolean
    onClose: () => void
    torneo: Torneo | null
}

export default function GruposTorneoModal({ isOpen, onClose, torneo }: GruposTorneoModalProps) {
    const [selectedCategoriaId, setSelectedCategoriaId] = useState<string>('')
    const [grupos, setGrupos] = useState<TorneoGrupo[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [isGenerating, setIsGenerating] = useState(false)
    const [isDownloading, setIsDownloading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [hasChanges, setHasChanges] = useState(false)

    // Drag state
    const [dragging, setDragging] = useState<{ grupoId: number; participanteId: number } | null>(null)
    const [dragOver, setDragOver] = useState<{ grupoId: number; participanteId: number } | null>(null)

    const gruposRef = useRef<HTMLDivElement>(null)

    const categoriasDelTorneo: Categoria[] = torneo?.torneo_categorias
        ?.map((tc: TorneoCategoria) => tc.categorias)
        .filter(Boolean) || []

    useEffect(() => {
        setSelectedCategoriaId('')
        setGrupos([])
        setHasChanges(false)
        if (categoriasDelTorneo.length > 0) {
            setSelectedCategoriaId(categoriasDelTorneo[0].id.toString())
        }
    }, [torneo])

    const fetchGrupos = async () => {
        if (!torneo || !selectedCategoriaId) return
        setIsLoading(true)
        setHasChanges(false)
        try {
            const res = await fetch(`/api/torneos/${torneo.id}/grupos?categoriaId=${selectedCategoriaId}`)
            const data = await res.json()
            if (res.ok) setGrupos(data.grupos || [])
            else toast.error(data.error || 'Error al obtener grupos')
        } catch {
            toast.error('Error de red al cargar grupos')
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        if (isOpen && selectedCategoriaId) fetchGrupos()
    }, [isOpen, selectedCategoriaId, torneo])

    const handleGenerarGrupos = async () => {
        if (!torneo) return
        setIsGenerating(true)
        try {
            const res = await fetch(`/api/torneos/${torneo.id}/grupos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoriaId: Number(selectedCategoriaId), tamañoGrupo: 4 })
            })
            const data = await res.json()
            if (res.ok) {
                toast.success('Grupos generados exitosamente')
                fetchGrupos()
            } else {
                toast.error(data.error || 'Error al generar los grupos')
            }
        } catch {
            toast.error('Error de red')
        } finally {
            setIsGenerating(false)
        }
    }

    // ── Drag & Drop ─────────────────────────────────────────────────────────

    const handleDragStart = (grupoId: number, participanteId: number) => {
        setDragging({ grupoId, participanteId })
    }

    const handleDragOver = (e: React.DragEvent, grupoId: number, participanteId: number) => {
        e.preventDefault()
        setDragOver({ grupoId, participanteId })
    }

    const handleDragOverGroup = (e: React.DragEvent, grupoId: number) => {
        e.preventDefault()
        setDragOver({ grupoId, participanteId: -1 })
    }

    const handleDrop = (targetGrupoId: number, targetParticipanteId: number) => {
        if (!dragging) return

        const { grupoId: srcGrupoId, participanteId: srcPartId } = dragging

        // Si es el mismo jugador, no hacer nada
        if (srcGrupoId === targetGrupoId && srcPartId === targetParticipanteId) {
            setDragging(null)
            setDragOver(null)
            return
        }

        setGrupos(prev => {
            const next = prev.map(g => ({ ...g, participantes: [...g.participantes] }))

            const srcGrupo = next.find(g => g.id === srcGrupoId)!
            const tgtGrupo = next.find(g => g.id === targetGrupoId)!

            const srcIdx = srcGrupo.participantes.findIndex(p => p.id === srcPartId)
            const srcPart = srcGrupo.participantes[srcIdx]

            if (targetParticipanteId === -1) {
                // Soltar en grupo vacío o al final del grupo
                srcGrupo.participantes.splice(srcIdx, 1)
                tgtGrupo.participantes.push(srcPart)
            } else {
                const tgtIdx = tgtGrupo.participantes.findIndex(p => p.id === targetParticipanteId)
                const tgtPart = tgtGrupo.participantes[tgtIdx]

                if (srcGrupoId === targetGrupoId) {
                    // Mismo grupo — intercambiar posiciones
                    srcGrupo.participantes[srcIdx] = tgtPart
                    srcGrupo.participantes[tgtIdx] = srcPart
                } else {
                    // Distinto grupo — intercambiar entre grupos
                    srcGrupo.participantes[srcIdx] = tgtPart
                    tgtGrupo.participantes[tgtIdx] = srcPart
                }
            }

            return next
        })

        setHasChanges(true)
        setDragging(null)
        setDragOver(null)
    }

    const handleDragEnd = () => {
        setDragging(null)
        setDragOver(null)
    }

    // ── Guardar cambios manuales ─────────────────────────────────────────────
    const handleGuardarCambios = async () => {
        if (!torneo) return
        setIsSaving(true)
        try {
            const res = await fetch(`/api/torneos/${torneo.id}/grupos/reordenar`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    categoriaId: Number(selectedCategoriaId),
                    grupos: grupos.map(g => ({
                        grupoId: g.id,
                        participantes: g.participantes.map((p, idx) => ({
                            torneo_grupo_participante_id: p.id,
                            torneo_participante_id: p.torneo_participantes.id,
                            posicion: idx + 1
                        }))
                    }))
                })
            })
            if (res.ok) {
                toast.success('Cambios guardados correctamente')
                setHasChanges(false)
            } else {
                const data = await res.json()
                toast.error(data.error || 'Error al guardar')
            }
        } catch {
            toast.error('Error de red')
        } finally {
            setIsSaving(false)
        }
    }

    const handleDescargar = async () => {
        if (!gruposRef.current) return
        setIsDownloading(true)
        try {
            const { toPng } = await import('html-to-image')
            const originalError = console.error
            console.error = (...args) => { if (String(args[0]).includes('cssRules')) return; originalError(...args) }
            const dataUrl = await toPng(gruposRef.current, {
                backgroundColor: '#f8fafc',
                pixelRatio: 2,
                skipFonts: true,
                filter: (node) => !(node instanceof HTMLLinkElement && node.rel === 'stylesheet')
            })
            console.error = originalError
            const link = document.createElement('a')
            link.download = `grupos-${torneo?.nombre}-cat${selectedCategoriaId}.png`
            link.href = dataUrl
            link.click()
            toast.success('Imagen descargada')
        } catch (error) {
            console.error('Error al descargar:', error)
            toast.error('Error al generar la imagen')
        } finally {
            setIsDownloading(false)
        }
    }

    if (!isOpen || !torneo) return null

    const categoriaActual = categoriasDelTorneo.find(c => c.id.toString() === selectedCategoriaId)

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full h-full max-w-[96vw] max-h-[96vh]">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
                    <div>
                        <h2 className="text-xl font-black text-slate-800">Grupos del Torneo</h2>
                        <p className="text-sm text-slate-500 font-medium">{torneo.nombre}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full p-2 transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Controles */}
                <div className="flex flex-col sm:flex-row items-end gap-3 px-6 py-4 bg-gray-50 border-b border-gray-200 shrink-0">
                    <div className="w-full sm:w-56">
                        <label className="block mb-1 text-sm font-bold text-gray-700">Categoría</label>
                        <select
                            value={selectedCategoriaId}
                            onChange={(e) => setSelectedCategoriaId(e.target.value)}
                            className="w-full p-2.5 border border-gray-300 rounded-lg bg-white font-medium focus:ring-2 focus:ring-slate-500"
                        >
                            {categoriasDelTorneo.map((cat: Categoria) => (
                                <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto flex-wrap">
                        <button
                            onClick={handleGenerarGrupos}
                            disabled={isGenerating}
                            className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg shadow font-semibold transition-colors disabled:bg-gray-400 text-sm"
                        >
                            {isGenerating ? 'Calculando...' : grupos.length > 0 ? 'Regenerar' : 'Generar Grupos'}
                        </button>
                        {hasChanges && (
                            <button
                                onClick={handleGuardarCambios}
                                disabled={isSaving}
                                className="flex-1 sm:flex-none bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-lg shadow font-semibold transition-colors disabled:bg-gray-400 text-sm animate-pulse"
                            >
                                {isSaving ? 'Guardando...' : 'Guardar cambios'}
                            </button>
                        )}
                        {grupos.length > 0 && (
                            <button
                                onClick={handleDescargar}
                                disabled={isDownloading}
                                className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg shadow font-semibold transition-colors disabled:bg-gray-400 text-sm"
                            >
                                {isDownloading ? 'Generando...' : 'Descargar'}
                            </button>
                        )}
                    </div>
                    {hasChanges && (
                        <p className="text-xs text-amber-600 font-medium sm:ml-auto">
                            ⚠️ Tienes cambios sin guardar
                        </p>
                    )}
                </div>

                {/* Contenido scrolleable */}
                <div className="flex-1 overflow-y-auto p-6">
                    {isLoading ? (
                        <div className="flex justify-center items-center h-full">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-700"></div>
                        </div>
                    ) : grupos.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <div className="text-6xl mb-4">🎾</div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">Aún no hay grupos generados</h3>
                            <p className="text-gray-500 max-w-md">
                                Haz clic en <strong>Generar Grupos</strong> para distribuir jugadores usando el sistema Serpiente basado en ELO.
                            </p>
                        </div>
                    ) : (
                        <div ref={gruposRef} className="bg-slate-50 rounded-xl p-6">
                            <div className="text-center mb-6">
                                <h3 className="text-2xl font-black text-slate-800">{torneo.nombre}</h3>
                                <p className="text-slate-500 font-medium">Categoría {categoriaActual?.nombre} — Distribución de Grupos</p>
                                {hasChanges && <p className="text-xs text-amber-500 mt-1">Arrastra jugadores para reorganizar · Guarda cuando termines</p>}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                                {grupos.map((grupo) => (
                                    <div
                                        key={grupo.id}
                                        className={`border-2 rounded-xl shadow-sm bg-white overflow-hidden transition-all ${
                                            dragOver?.grupoId === grupo.id ? 'border-blue-400 shadow-blue-100 shadow-lg' : 'border-gray-200'
                                        }`}
                                        onDragOver={(e) => handleDragOverGroup(e, grupo.id)}
                                        onDrop={() => handleDrop(grupo.id, -1)}
                                    >
                                        <div className="bg-slate-800 text-white py-3 px-4 text-center font-black tracking-widest text-sm">
                                            GRUPO {grupo.numero_grupo}
                                            <span className="ml-2 text-slate-400 text-xs font-normal">({grupo.participantes.length})</span>
                                        </div>
                                        <ul className="divide-y divide-gray-100">
                                            {grupo.participantes?.map((gp, idx) => (
                                                <li
                                                    key={gp.id}
                                                    draggable
                                                    onDragStart={() => handleDragStart(grupo.id, gp.id)}
                                                    onDragOver={(e) => handleDragOver(e, grupo.id, gp.id)}
                                                    onDrop={(e) => { e.stopPropagation(); handleDrop(grupo.id, gp.id) }}
                                                    onDragEnd={handleDragEnd}
                                                    className={`p-3 text-sm transition-all cursor-grab active:cursor-grabbing select-none ${
                                                        dragging?.participanteId === gp.id
                                                            ? 'opacity-40 bg-blue-50'
                                                            : dragOver?.grupoId === grupo.id && dragOver?.participanteId === gp.id
                                                                ? 'bg-blue-50 border-l-4 border-blue-400'
                                                                : 'hover:bg-slate-50'
                                                    }`}
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-semibold text-gray-800 flex items-center gap-1">
                                                            <span className="text-slate-300 text-xs mr-1">⠿</span>
                                                            <span className="text-slate-400 text-xs w-4">{idx + 1}.</span>
                                                            {gp.torneo_participantes.jugadores.nombre}
                                                        </span>
                                                        <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 shrink-0 ml-2">
                                                            {gp.torneo_participantes.jugadores.elo}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-400 mt-0.5 ml-5">
                                                        {gp.torneo_participantes.jugadores.clubes?.nombre ?? '—'}
                                                    </p>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center shrink-0 bg-gray-50 rounded-b-2xl">
                    <span className="text-sm text-gray-500">
                        {grupos.length > 0 && `${grupos.length} grupos · ${grupos.reduce((acc, g) => acc + g.participantes.length, 0)} jugadores`}
                        {hasChanges && <span className="ml-2 text-amber-500 font-medium">· cambios sin guardar</span>}
                    </span>
                    <button onClick={onClose} className="px-6 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 font-medium transition-colors">
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    )
}