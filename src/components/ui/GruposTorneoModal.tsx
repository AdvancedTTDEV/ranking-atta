'use client'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'react-hot-toast'

interface Club { id: number; nombre: string }
interface Jugador { id: number; nombre: string; elo: number | null; clubes?: Club }
interface Miembro { orden: number; jugadores: Jugador }
interface TorneoParticipante {
    id: number
    nombre_personalizado?: string | null
    jugadores?: Jugador | null
    miembros: Miembro[]
}
interface TorneoGrupoParticipante { id: number; posicion: number; torneo_participantes: TorneoParticipante }
interface TorneoGrupo { id: number; numero_grupo: number; participantes: TorneoGrupoParticipante[] }
interface Categoria { id: number; nombre: string }
interface TorneoCategoria { categorias: Categoria }
interface Torneo { id: number; nombre: string; torneo_categorias: TorneoCategoria[] }

interface GruposTorneoModalProps {
    isOpen: boolean
    onClose: () => void
    torneo: Torneo | null
    onOpenPartidos?: () => void
}

type Modo = 'auto' | 'manual'

const nombreParticipante = (participante: TorneoParticipante) =>
    participante.nombre_personalizado?.trim()
    || participante.miembros.map(({ jugadores }) => jugadores.nombre).join(' / ')
    || participante.jugadores?.nombre
    || 'Participante sin nombre'

const eloParticipante = (participante: TorneoParticipante) => {
    const integrantes = participante.miembros.length > 0
        ? participante.miembros.map(({ jugadores }) => jugadores)
        : participante.jugadores ? [participante.jugadores] : []
    if (integrantes.length === 0) return 0
    return Math.round(integrantes.reduce((total, jugador) => total + (jugador.elo ?? 0), 0) / integrantes.length)
}

export default function GruposTorneoModal({ isOpen, onClose, torneo, onOpenPartidos }: GruposTorneoModalProps) {
    const [selectedCategoriaId, setSelectedCategoriaId] = useState<string>('')
    const [grupos, setGrupos] = useState<TorneoGrupo[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [isGenerating, setIsGenerating] = useState(false)
    const [isDownloading, setIsDownloading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [hasChanges, setHasChanges] = useState(false)

    // Modo automático / manual
    const [modo, setModo] = useState<Modo>('auto')

    // Pool de jugadores sin asignar (modo manual)
    const [inscritos, setInscritos] = useState<TorneoParticipante[]>([])
    const [isLoadingInscritos, setIsLoadingInscritos] = useState(false)

    // Drag state
    const [dragging, setDragging] = useState<{ grupoId: number; participanteId: number } | null>(null)
    const [draggingFromPool, setDraggingFromPool] = useState<number | null>(null) // torneo_participante_id
    const [dragOver, setDragOver] = useState<{ grupoId: number; participanteId: number } | null>(null)
    const [dragOverPool, setDragOverPool] = useState(false)

    // Menú de sustitución por clic
    const [swapMenu, setSwapMenu] = useState<{ grupoId: number; participanteId: number } | null>(null)
    const [poolMenu, setPoolMenu] = useState<number | null>(null) // torneo_participante_id del pool

    const gruposRef = useRef<HTMLDivElement>(null)
    const tempIdCounter = useRef(-1)

    const categoriasDelTorneo: Categoria[] = torneo?.torneo_categorias
        ?.map((tc: TorneoCategoria) => tc.categorias)
        .filter(Boolean) || []

    useEffect(() => {
        setSelectedCategoriaId('')
        setGrupos([])
        setInscritos([])
        setHasChanges(false)
        setModo('auto')
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

    // NOTA: este endpoint es una suposición — ajústalo al que ya tengas para
    // listar los inscritos de una categoría (torneo_participantes + jugadores).
    // Debe devolver: { participantes: TorneoParticipante[] }
    const fetchInscritos = async () => {
        if (!torneo || !selectedCategoriaId) return
        setIsLoadingInscritos(true)
        try {
            const res = await fetch(`/api/torneos/${torneo.id}/participantes?categoriaId=${selectedCategoriaId}`)
            const data = await res.json()
            if (res.ok) setInscritos(data.participantes || [])
            else toast.error(data.error || 'Error al obtener inscritos')
        } catch {
            toast.error('Error de red al cargar inscritos')
        } finally {
            setIsLoadingInscritos(false)
        }
    }

    useEffect(() => {
        if (isOpen && selectedCategoriaId) {
            fetchGrupos()
            fetchInscritos()
        }
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

    // ── Pool: jugadores inscritos que aún no están en ningún grupo ──────────
    const idsEnGrupos = new Set(grupos.flatMap(g => g.participantes.map(p => p.torneo_participantes.id)))
    const pool = inscritos.filter(p => !idsEnGrupos.has(p.id))

    // ── Modo manual: añadir grupo vacío ──────────────────────────────────────
    const handleAñadirGrupo = () => {
        const maxNumero = grupos.reduce((max, g) => Math.max(max, g.numero_grupo), 0)
        const nuevoGrupo: TorneoGrupo = {
            id: tempIdCounter.current--,
            numero_grupo: maxNumero + 1,
            participantes: []
        }
        setGrupos(prev => [...prev, nuevoGrupo])
        setHasChanges(true)
    }

    const handleEliminarGrupoVacio = (grupoId: number) => {
        setGrupos(prev => prev.filter(g => g.id !== grupoId))
        setHasChanges(true)
    }

    // ── Asignar un jugador del pool a un grupo ───────────────────────────────
    const asignarDesdePool = (torneoParticipanteId: number, targetGrupoId: number) => {
        const participante = inscritos.find(p => p.id === torneoParticipanteId)
        if (!participante) return
        setGrupos(prev => prev.map(g => {
            if (g.id !== targetGrupoId) return g
            const nuevo: TorneoGrupoParticipante = {
                id: tempIdCounter.current--,
                posicion: g.participantes.length + 1,
                torneo_participantes: participante
            }
            return { ...g, participantes: [...g.participantes, nuevo] }
        }))
        setHasChanges(true)
        setPoolMenu(null)
    }

    // ── Devolver un jugador de un grupo al pool ──────────────────────────────
    const enviarAlPool = (grupoId: number, participanteId: number) => {
        setGrupos(prev => prev.map(g => {
            if (g.id !== grupoId) return g
            return { ...g, participantes: g.participantes.filter(p => p.id !== participanteId) }
        }))
        setHasChanges(true)
        setSwapMenu(null)
    }

    // ── Drag & Drop (grupos existentes) ──────────────────────────────────────

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
        // Soltando un jugador que venía del pool
        if (draggingFromPool !== null) {
            asignarDesdePool(draggingFromPool, targetGrupoId)
            setDraggingFromPool(null)
            setDragOver(null)
            return
        }

        if (!dragging) return

        const { grupoId: srcGrupoId, participanteId: srcPartId } = dragging

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
                srcGrupo.participantes.splice(srcIdx, 1)
                tgtGrupo.participantes.push(srcPart)
            } else {
                const tgtIdx = tgtGrupo.participantes.findIndex(p => p.id === targetParticipanteId)
                const tgtPart = tgtGrupo.participantes[tgtIdx]

                if (srcGrupoId === targetGrupoId) {
                    srcGrupo.participantes[srcIdx] = tgtPart
                    srcGrupo.participantes[tgtIdx] = srcPart
                } else {
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
        setDraggingFromPool(null)
        setDragOverPool(false)
    }

    // Soltar un jugador de vuelta en el pool (arrastrándolo fuera de un grupo)
    const handleDropOnPool = () => {
        if (dragging) {
            enviarAlPool(dragging.grupoId, dragging.participanteId)
        }
        setDragging(null)
        setDragOverPool(false)
    }

    // ── Swap por clic (funciona en ambos modos) ──────────────────────────────
    const toggleSwapMenu = (grupoId: number, participanteId: number) => {
        setPoolMenu(null)
        setSwapMenu(prev => (prev?.grupoId === grupoId && prev?.participanteId === participanteId) ? null : { grupoId, participanteId })
    }

    const togglePoolMenu = (torneoParticipanteId: number) => {
        setSwapMenu(null)
        setPoolMenu(prev => prev === torneoParticipanteId ? null : torneoParticipanteId)
    }

    const closeMenus = () => {
        setSwapMenu(null)
        setPoolMenu(null)
    }

    const handleSwapClick = (targetGrupoId: number, targetParticipanteId: number) => {
        if (!swapMenu) return
        handleDrop(targetGrupoId, targetParticipanteId)
        setSwapMenu(null)
    }

    // Todos los participantes actualmente colocados en grupos (para el listado del menú)
    const todosLosColocados = grupos.flatMap(g => g.participantes.map(p => ({ grupo: g, p })))

    // ── Guardar cambios manuales ─────────────────────────────────────────────
    const handleGuardarCambios = async () => {
        if (!torneo) return
        const hayGruposNuevos = grupos.some(g => g.id < 0)
        setIsSaving(true)
        try {
            const res = await fetch(`/api/torneos/${torneo.id}/grupos/reordenar`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    categoriaId: Number(selectedCategoriaId),
                    grupos: grupos.map(g => ({
                        // id negativo = grupo nuevo creado en modo manual (aún no existe en BD)
                        grupoId: g.id > 0 ? g.id : null,
                        numeroGrupoTemporal: g.id < 0 ? g.numero_grupo : undefined,
                        participantes: g.participantes.map((p, idx) => ({
                            // id negativo = fila nueva (aún no existe en torneo_grupo_participantes)
                            torneo_grupo_participante_id: p.id > 0 ? p.id : null,
                            torneo_participante_id: p.torneo_participantes.id,
                            posicion: idx + 1
                        }))
                    }))
                })
            })
            if (res.ok) {
                toast.success('Cambios guardados correctamente')
                setHasChanges(false)
                fetchGrupos()
                fetchInscritos()
            } else {
                const data = await res.json()
                toast.error(data.error || 'Error al guardar')
            }
        } catch {
            toast.error('Error de red')
        } finally {
            setIsSaving(false)
        }
        if (hayGruposNuevos) {
            // Aviso para Oscar: el endpoint /grupos/reordenar debe soportar
            // grupoId: null (crear grupo nuevo) y torneo_grupo_participante_id: null (crear fila nueva).
            console.warn('Se guardaron grupos creados en modo manual: verificar soporte backend para grupoId/participante null.')
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

                    {/* Selector de modo */}
                    <div className="w-full sm:w-auto">
                        <label className="block mb-1 text-sm font-bold text-gray-700">Modo</label>
                        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
                            <button
                                onClick={() => setModo('auto')}
                                className={`px-4 py-2.5 text-sm font-semibold transition-colors ${
                                    modo === 'auto' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-gray-100'
                                }`}
                            >
                                Automático
                            </button>
                            <button
                                onClick={() => setModo('manual')}
                                className={`px-4 py-2.5 text-sm font-semibold transition-colors border-l border-gray-300 ${
                                    modo === 'manual' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-gray-100'
                                }`}
                            >
                                Manual
                            </button>
                        </div>
                    </div>

                    <div className="flex gap-2 w-full sm:w-auto flex-wrap">
                        {modo === 'auto' && (
                            <button
                                onClick={handleGenerarGrupos}
                                disabled={isGenerating}
                                className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg shadow font-semibold transition-colors disabled:bg-gray-400 text-sm"
                            >
                                {isGenerating ? 'Calculando...' : grupos.length > 0 ? 'Regenerar' : 'Generar Grupos'}
                            </button>
                        )}
                        {modo === 'manual' && (
                            <button
                                onClick={handleAñadirGrupo}
                                className="flex-1 sm:flex-none bg-slate-700 hover:bg-slate-800 text-white px-5 py-2.5 rounded-lg shadow font-semibold transition-colors text-sm"
                            >
                                + Añadir Grupo
                            </button>
                        )}
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
                                onClick={onOpenPartidos}
                                className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg shadow font-semibold transition-colors text-sm"
                            >
                                Partidos y hojas
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

                {/* Overlay para cerrar menús al hacer clic fuera */}
                {(swapMenu || poolMenu !== null) && (
                    <div className="fixed inset-0 z-30" onClick={closeMenus} />
                )}

                {/* Contenido scrolleable */}
                <div className="flex-1 overflow-y-auto p-6">

                    {/* Pool de jugadores sin asignar — solo en modo manual */}
                    {modo === 'manual' && (
                        <div
                            className={`mb-6 rounded-xl border-2 border-dashed p-4 transition-colors ${
                                dragOverPool ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-white'
                            }`}
                            onDragOver={(e) => { e.preventDefault(); setDragOverPool(true) }}
                            onDragLeave={() => setDragOverPool(false)}
                            onDrop={handleDropOnPool}
                        >
                            <h4 className="text-sm font-black text-slate-700 mb-3">
                                Jugadores sin asignar ({isLoadingInscritos ? '...' : pool.length})
                            </h4>
                            {pool.length === 0 ? (
                                <p className="text-sm text-slate-400">
                                    {isLoadingInscritos ? 'Cargando inscritos...' : 'Todos los jugadores están asignados a un grupo.'}
                                </p>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {pool.map((p) => (
                                        <div key={p.id} className="relative">
                                            <button
                                                draggable
                                                onDragStart={() => setDraggingFromPool(p.id)}
                                                onDragEnd={handleDragEnd}
                                                onClick={() => togglePoolMenu(p.id)}
                                                className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-full pl-3 pr-2 py-1.5 text-sm font-semibold text-slate-700 cursor-grab active:cursor-grabbing transition-colors"
                                            >
                                                {nombreParticipante(p)}
                                                <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                                                    {eloParticipante(p)}
                                                </span>
                                            </button>
                                            {poolMenu === p.id && (
                                                <div className="absolute z-40 top-full left-0 mt-1 w-56 bg-white rounded-lg shadow-xl border border-gray-200 max-h-56 overflow-y-auto">
                                                    <div className="px-3 py-2 text-xs font-bold text-slate-400 border-b border-gray-100">
                                                        Asignar a grupo
                                                    </div>
                                                    {grupos.length === 0 ? (
                                                        <p className="px-3 py-2 text-xs text-slate-400">Añade un grupo primero</p>
                                                    ) : (
                                                        grupos.map(g => (
                                                            <button
                                                                key={g.id}
                                                                onClick={(e) => { e.stopPropagation(); asignarDesdePool(p.id, g.id) }}
                                                                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors"
                                                            >
                                                                Grupo {g.numero_grupo} <span className="text-slate-400 text-xs">({g.participantes.length})</span>
                                                            </button>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {isLoading ? (
                        <div className="flex justify-center items-center h-full">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-700"></div>
                        </div>
                    ) : grupos.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <div className="text-6xl mb-4">🎾</div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">Aún no hay grupos generados</h3>
                            <p className="text-gray-500 max-w-md">
                                {modo === 'auto'
                                    ? <>Haz clic en <strong>Generar Grupos</strong> para distribuir jugadores usando el sistema Serpiente basado en ELO.</>
                                    : <>Haz clic en <strong>+ Añadir Grupo</strong> y arrastra jugadores desde la lista de arriba.</>}
                            </p>
                        </div>
                    ) : (
                        <div ref={gruposRef} className="bg-slate-50 rounded-xl p-6">
                            <div className="text-center mb-6">
                                <h3 className="text-2xl font-black text-slate-800">{torneo.nombre}</h3>
                                <p className="text-slate-500 font-medium">Categoría {categoriaActual?.nombre} — Distribución de Grupos</p>
                                {hasChanges && <p className="text-xs text-amber-500 mt-1">Arrastra o haz clic en un jugador para reorganizar · Guarda cuando termines</p>}
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
                                        <div className="bg-slate-800 text-white py-3 px-4 text-center font-black tracking-widest text-sm flex items-center justify-between">
                                            <span>
                                                GRUPO {grupo.numero_grupo}
                                                <span className="ml-2 text-slate-400 text-xs font-normal">({grupo.participantes.length})</span>
                                            </span>
                                            {modo === 'manual' && grupo.participantes.length === 0 && (
                                                <button
                                                    onClick={() => handleEliminarGrupoVacio(grupo.id)}
                                                    title="Eliminar grupo vacío"
                                                    className="text-slate-400 hover:text-red-400 transition-colors"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                        {grupo.participantes.length === 0 ? (
                                            <div className="p-6 text-center text-xs text-slate-300 font-medium">
                                                Arrastra jugadores aquí
                                            </div>
                                        ) : (
                                            <ul className="divide-y divide-gray-100">
                                                {grupo.participantes?.map((gp, idx) => (
                                                    <li
                                                        key={gp.id}
                                                        draggable
                                                        onDragStart={() => handleDragStart(grupo.id, gp.id)}
                                                        onDragOver={(e) => handleDragOver(e, grupo.id, gp.id)}
                                                        onDrop={(e) => { e.stopPropagation(); handleDrop(grupo.id, gp.id) }}
                                                        onDragEnd={handleDragEnd}
                                                        className={`relative p-3 text-sm transition-all cursor-grab active:cursor-grabbing select-none ${
                                                            dragging?.participanteId === gp.id
                                                                ? 'opacity-40 bg-blue-50'
                                                                : dragOver?.grupoId === grupo.id && dragOver?.participanteId === gp.id
                                                                    ? 'bg-blue-50 border-l-4 border-blue-400'
                                                                    : 'hover:bg-slate-50'
                                                        }`}
                                                    >
                                                        <div className="flex justify-between items-center">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); toggleSwapMenu(grupo.id, gp.id) }}
                                                                className="font-semibold text-gray-800 flex items-center gap-1 hover:text-indigo-700 transition-colors"
                                                            >
                                                                <span className="text-slate-300 text-xs mr-1">⠿</span>
                                                                <span className="text-slate-400 text-xs w-4">{idx + 1}.</span>
                                                                {nombreParticipante(gp.torneo_participantes)}
                                                            </button>
                                                            <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 shrink-0 ml-2">
                                                            {eloParticipante(gp.torneo_participantes)}
                                                        </span>
                                                        </div>
                                                        <p className="text-xs text-slate-400 mt-0.5 ml-5">
                                                            {gp.torneo_participantes.miembros.length > 1
                                                                ? `${gp.torneo_participantes.miembros.length} integrantes`
                                                                : (gp.torneo_participantes.miembros[0]?.jugadores.clubes?.nombre
                                                                    ?? gp.torneo_participantes.jugadores?.clubes?.nombre
                                                                    ?? '—')}
                                                        </p>

                                                        {/* Menú de sustitución por clic */}
                                                        {swapMenu?.grupoId === grupo.id && swapMenu?.participanteId === gp.id && (
                                                            <div className="absolute z-40 top-full left-3 mt-1 w-64 bg-white rounded-lg shadow-xl border border-gray-200 max-h-64 overflow-y-auto">
                                                                <div className="px-3 py-2 text-xs font-bold text-slate-400 border-b border-gray-100">
                                                                    Sustituir por
                                                                </div>
                                                                {modo === 'manual' && (
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); enviarAlPool(grupo.id, gp.id) }}
                                                                        className="w-full text-left px-3 py-2 text-sm text-amber-600 hover:bg-amber-50 font-semibold transition-colors border-b border-gray-100"
                                                                    >
                                                                        ↩ Devolver a la lista
                                                                    </button>
                                                                )}
                                                                {todosLosColocados
                                                                    .filter(({ p }) => p.id !== gp.id)
                                                                    .map(({ grupo: g2, p }) => (
                                                                        <button
                                                                            key={p.id}
                                                                            onClick={(e) => { e.stopPropagation(); handleSwapClick(g2.id, p.id) }}
                                                                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors flex justify-between items-center"
                                                                        >
                                                                            <span>{nombreParticipante(p.torneo_participantes)}</span>
                                                                            <span className="text-xs text-slate-400">G{g2.numero_grupo}</span>
                                                                        </button>
                                                                    ))}
                                                            </div>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
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
