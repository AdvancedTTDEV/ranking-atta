'use client'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'react-hot-toast'
import {
    XMarkIcon,
    PlayIcon,
    ArrowDownTrayIcon,
    PlusIcon,
    ExclamationTriangleIcon,
    ArrowsRightLeftIcon,
    ArrowsPointingOutIcon,
    Bars3Icon,
    TrophyIcon,
    CheckIcon,
} from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { categoriasParaSelector, esTorneoAbiertoTotal } from '@/lib/torneo'

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
interface Torneo { id: number; nombre: string; modalidad?: string; abierto?: boolean; torneo_categorias: TorneoCategoria[] }

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
    const [todasCategorias, setTodasCategorias] = useState<Categoria[]>([])

    // Cargamos el catálogo completo de categorías para soportar torneos
    // "abiertos" (DOBLES, EQUIPOS o primera categoría), donde el selector
    // debe mostrar TODAS las categorías, no solo las asignadas.
    useEffect(() => {
        let cancelado = false
        fetch('/api/categorias')
            .then(r => r.ok ? r.json() : [])
            .then(data => { if (!cancelado) setTodasCategorias(Array.isArray(data) ? data : []) })
            .catch(() => { /* silencioso */ })
        return () => { cancelado = true }
    }, [])

    const categoriasDelTorneo: Categoria[] = categoriasParaSelector(
        torneo?.torneo_categorias as { categorias: Categoria }[] | undefined,
        todasCategorias,
        torneo?.modalidad,
        torneo?.abierto,
    )

    // Solo DOBLES y EQUIPOS son torneos totalmente abiertos. En INDIVIDUAL,
    // aunque "primera" admita jugadores de cualquier categoría, el resto
    // se corren por separado y el selector debe permanecer visible.
    const esAbierto = esTorneoAbiertoTotal(torneo?.modalidad)
    const categoriaOperativa = esAbierto
        ? (todasCategorias.find(c => c.nombre === 'primera') || categoriasDelTorneo[0])
        : categoriasDelTorneo.find(c => c.id.toString() === selectedCategoriaId) || categoriasDelTorneo[0]
    const categoriaOperativaId = categoriaOperativa?.id ? String(categoriaOperativa.id) : ''

    useEffect(() => {
        // Al cambiar de torneo, seleccionamos la primera categoría SOLO si
        // la actual ya no es válida. NO limpiamos grupos/inscritos/hasChanges
        // ni reseteamos el modo: el useEffect de [isOpen, selectedCategoriaId]
        // recargará los datos y el usuario conserva su trabajo al alternar
        // entre categorías del mismo torneo.
        if (!torneo) {
            setSelectedCategoriaId('')
            return
        }
        // En abiertos forzamos SIEMPRE la primera categoría como operativa
        // y bloqueamos el cambio manual.
        if (esAbierto) {
            const primera = todasCategorias.find(c => c.nombre === 'primera') || categoriasDelTorneo[0]
            if (primera) setSelectedCategoriaId(String(primera.id))
            return
        }
        const categoriaValida = categoriasDelTorneo.some(c => c.id.toString() === selectedCategoriaId)
        if (!categoriaValida) {
            setSelectedCategoriaId(categoriasDelTorneo[0]?.id.toString() || '')
        }
    }, [torneo, esAbierto, todasCategorias])

    const fetchGrupos = async () => {
        if (!torneo || !categoriaOperativaId) return
        setIsLoading(true)
        setHasChanges(false)
        try {
            const res = await fetch(`/api/torneos/${torneo.id}/grupos?categoriaId=${categoriaOperativaId}`)
            const data = await res.json()
            if (res.ok) setGrupos(data.grupos || [])
            else toast.error(data.error || 'Error al obtener grupos')
        } catch {
            toast.error('Error de red al cargar grupos')
        } finally {
            setIsLoading(false)
        }
    }

    // En torneos abiertos listamos TODOS los inscritos del torneo (sin
    // filtrar por su categoría de origen), porque los grupos mezclan a
    // todos bajo la categoría operativa "primera".
    const fetchInscritos = async () => {
        if (!torneo) return
        setIsLoadingInscritos(true)
        try {
            const url = esAbierto
                ? `/api/torneos/${torneo.id}/participantes`
                : `/api/torneos/${torneo.id}/participantes?categoriaId=${categoriaOperativaId}`
            const res = await fetch(url)
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
        if (isOpen && categoriaOperativaId) {
            fetchGrupos()
            fetchInscritos()
        }
    }, [isOpen, categoriaOperativaId, torneo?.id])

    const handleGenerarGrupos = async () => {
        if (!torneo || !categoriaOperativaId) return
        setIsGenerating(true)
        try {
            const res = await fetch(`/api/torneos/${torneo.id}/grupos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    categoriaId: Number(categoriaOperativaId),
                    tamañoGrupo: 4,
                    abierto: esAbierto,
                })
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
                    categoriaId: Number(categoriaOperativaId),
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
            link.download = `grupos-${torneo?.nombre}-cat${categoriaOperativaId}.png`
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
    const totalIntegrantes = grupos.reduce((acc, g) => acc + g.participantes.length, 0)

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Grupos del torneo"
            description={torneo.nombre}
            size="full"
        >
            <div className="-mx-5 -mt-5 mb-4 card-flush overflow-hidden">
                <div className="flex flex-col sm:flex-row items-end gap-3 p-3 bg-subtle">
                    {!esAbierto && (
                        <Select
                            label="Categoría"
                            value={selectedCategoriaId}
                            onChange={(e) => setSelectedCategoriaId(e.target.value)}
                            className="w-full sm:w-56"
                        >
                            {categoriasDelTorneo.map((cat: Categoria) => (
                                <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                            ))}
                        </Select>
                    )}

                    {esAbierto && (
                        <div className="banner banner-info text-xs flex-1">
                            Torneo abierto: los grupos se arman en <b>primera categoría</b> mezclando a todos los inscritos.
                        </div>
                    )}

                    {/* Selector de modo */}
                    <div className="w-full sm:w-auto">
                        <label className="label">Modo</label>
                        <div className="inline-flex rounded-md border border-line overflow-hidden bg-surface">
                            <button
                                type="button"
                                onClick={() => setModo('auto')}
                                className={`px-4 py-2 text-sm font-semibold transition-colors ${
                                    modo === 'auto' ? 'bg-subtle text-fg' : 'text-fg-muted hover:bg-subtle'
                                }`}
                            >
                                Automático
                            </button>
                            <button
                                type="button"
                                onClick={() => setModo('manual')}
                                className={`px-4 py-2 text-sm font-semibold transition-colors border-l border-line ${
                                    modo === 'manual' ? 'bg-subtle text-fg' : 'text-fg-muted hover:bg-subtle'
                                }`}
                            >
                                Manual
                            </button>
                        </div>
                    </div>

                    <div className="flex gap-2 w-full sm:w-auto flex-wrap">
                        {modo === 'auto' && (
                            <Button
                                variant="success"
                                onClick={handleGenerarGrupos}
                                isLoading={isGenerating}
                                leadingIcon={<PlayIcon className="h-4 w-4" />}
                            >
                                {isGenerating ? 'Calculando...' : grupos.length > 0 ? 'Regenerar' : 'Generar grupos'}
                            </Button>
                        )}
                        {modo === 'manual' && (
                            <Button
                                variant="secondary"
                                onClick={handleAñadirGrupo}
                                leadingIcon={<PlusIcon className="h-4 w-4" />}
                            >
                                Añadir grupo
                            </Button>
                        )}
                        {hasChanges && (
                            <Button
                                variant="warning"
                                onClick={handleGuardarCambios}
                                isLoading={isSaving}
                                className="animate-pulse-soft"
                            >
                                {isSaving ? 'Guardando...' : 'Guardar cambios'}
                            </Button>
                        )}
                        {grupos.length > 0 && onOpenPartidos && (
                            <Button
                                variant="primary"
                                onClick={onOpenPartidos}
                                leadingIcon={<TrophyIcon className="h-4 w-4" />}
                            >
                                Partidos y hojas
                            </Button>
                        )}
                        {grupos.length > 0 && (
                            <Button
                                variant="secondary"
                                onClick={handleDescargar}
                                isLoading={isDownloading}
                                leadingIcon={<ArrowDownTrayIcon className="h-4 w-4" />}
                            >
                                {isDownloading ? 'Generando...' : 'Descargar'}
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* Overlay para cerrar menús al hacer clic fuera */}
            {(swapMenu || poolMenu !== null) && (
                <div className="fixed inset-0 z-30" onClick={closeMenus} />
            )}

            <div className="min-h-[300px]">
                {/* Pool de jugadores sin asignar — solo en modo manual */}
                {modo === 'manual' && (
                    <div
                        className={`mb-4 rounded-xl border-2 border-dashed p-4 transition-colors ${
                            dragOverPool
                                ? 'border-brand bg-brand-soft'
                                : 'border-line bg-surface'
                        }`}
                        onDragOver={(e) => { e.preventDefault(); setDragOverPool(true) }}
                        onDragLeave={() => setDragOverPool(false)}
                        onDrop={handleDropOnPool}
                    >
                        <h4 className="text-sm font-bold text-fg mb-3 inline-flex items-center gap-2">
                            <ArrowsPointingOutIcon className="h-4 w-4 text-fg-muted" />
                            Jugadores sin asignar ({isLoadingInscritos ? '...' : pool.length})
                        </h4>
                        {pool.length === 0 ? (
                            <p className="text-sm text-fg-muted">
                                {isLoadingInscritos ? 'Cargando inscritos...' : 'Todos los jugadores están asignados a un grupo.'}
                            </p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {pool.map((p) => (
                                    <div key={p.id} className="relative">
                                        <button
                                            type="button"
                                            draggable
                                            onDragStart={() => setDraggingFromPool(p.id)}
                                            onDragEnd={handleDragEnd}
                                            onClick={() => togglePoolMenu(p.id)}
                                            className="flex items-center gap-1.5 bg-subtle hover:bg-surface-2 border border-line rounded-full pl-3 pr-2 py-1.5 text-sm font-semibold text-fg cursor-grab active:cursor-grabbing transition-colors"
                                        >
                                            <Bars3Icon className="h-3.5 w-3.5 text-fg-muted" />
                                            {nombreParticipante(p)}
                                            <Badge variant="brand" className="text-[0.65rem]">
                                                {eloParticipante(p)}
                                            </Badge>
                                        </button>
                                        {poolMenu === p.id && (
                                            <div className="absolute z-40 top-full left-0 mt-1 w-56 card-elevated max-h-56 overflow-y-auto">
                                                <div className="px-3 py-2 text-xs font-bold text-fg-muted uppercase tracking-wider border-b border-line">
                                                    Asignar a grupo
                                                </div>
                                                {grupos.length === 0 ? (
                                                    <p className="px-3 py-2 text-xs text-fg-muted">Añade un grupo primero</p>
                                                ) : (
                                                    grupos.map(g => (
                                                        <button
                                                            key={g.id}
                                                            onClick={(e) => { e.stopPropagation(); asignarDesdePool(p.id, g.id) }}
                                                            className="w-full text-left px-3 py-2 text-sm hover:bg-subtle transition-colors flex justify-between items-center"
                                                        >
                                                            <span>Grupo {g.numero_grupo}</span>
                                                            <Badge variant="neutral">{g.participantes.length}</Badge>
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
                    <div className="flex justify-center items-center py-16">
                        <div className="h-10 w-10 rounded-full border-2 border-line border-t-brand animate-spin" />
                    </div>
                ) : grupos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <TrophyIcon className="h-10 w-10 text-fg-muted opacity-40" />
                        <h3 className="mt-3 font-semibold text-fg">Aún no hay grupos generados</h3>
                        <p className="text-sm text-fg-muted mt-1.5 max-w-md">
                            {modo === 'auto'
                                ? <>Haz clic en <b>Generar grupos</b> para distribuir jugadores usando el sistema Serpiente basado en ELO.</>
                                : <>Haz clic en <b>Añadir grupo</b> y arrastra jugadores desde la lista de arriba.</>}
                        </p>
                    </div>
                ) : (
                    <div ref={gruposRef} className="bg-subtle rounded-xl p-5">
                        <div className="text-center mb-5">
                            <h3 className="text-xl font-bold text-fg">{torneo.nombre}</h3>
                            <p className="text-sm text-fg-muted">Categoría {categoriaActual?.nombre} — Distribución de Grupos</p>
                            {hasChanges && (
                                <p className="text-xs text-warning mt-1 inline-flex items-center gap-1.5">
                                    <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                                    Arrastra o haz clic para reorganizar · Guarda cuando termines
                                </p>
                            )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                            {grupos.map((grupo) => {
                                const isDragOver = dragOver?.grupoId === grupo.id
                                return (
                                    <div
                                        key={grupo.id}
                                        className={`card-flush overflow-hidden transition-shadow ${
                                            isDragOver ? 'border-brand shadow-lg' : ''
                                        }`}
                                        onDragOver={(e) => handleDragOverGroup(e, grupo.id)}
                                        onDrop={() => handleDrop(grupo.id, -1)}
                                    >
                                        <div className="px-3 py-2.5 bg-subtle border-b border-line text-xs font-bold text-fg-muted uppercase tracking-wider flex items-center justify-between">
                                            <span>
                                                Grupo {grupo.numero_grupo}
                                                <span className="ml-2 text-fg-muted">({grupo.participantes.length})</span>
                                            </span>
                                            {modo === 'manual' && grupo.participantes.length === 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleEliminarGrupoVacio(grupo.id)}
                                                    title="Eliminar grupo vacío"
                                                    className="text-fg-muted hover:text-danger transition-colors"
                                                >
                                                    <XMarkIcon className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                        {grupo.participantes.length === 0 ? (
                                            <div className="p-6 text-center text-xs text-fg-muted">
                                                Arrastra jugadores aquí
                                            </div>
                                        ) : (
                                            <ul className="divide-y divide-line">
                                                {grupo.participantes?.map((gp, idx) => {
                                                    const isDraggingThis = dragging?.participanteId === gp.id
                                                    const isDropTarget = dragOver?.grupoId === grupo.id && dragOver?.participanteId === gp.id
                                                    return (
                                                        <li
                                                            key={gp.id}
                                                            draggable
                                                            onDragStart={() => handleDragStart(grupo.id, gp.id)}
                                                            onDragOver={(e) => handleDragOver(e, grupo.id, gp.id)}
                                                            onDrop={(e) => { e.stopPropagation(); handleDrop(grupo.id, gp.id) }}
                                                            onDragEnd={handleDragEnd}
                                                            className={`relative p-2.5 text-sm transition-all cursor-grab active:cursor-grabbing select-none ${
                                                                isDraggingThis
                                                                    ? 'opacity-40 bg-brand-soft'
                                                                    : isDropTarget
                                                                        ? 'bg-brand-soft border-l-4 border-brand'
                                                                        : 'hover:bg-subtle'
                                                            }`}
                                                        >
                                                            <div className="flex justify-between items-center">
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); toggleSwapMenu(grupo.id, gp.id) }}
                                                                    className="font-semibold text-fg flex items-center gap-1 hover:text-brand transition-colors min-w-0"
                                                                >
                                                                    <Bars3Icon className="h-3.5 w-3.5 text-fg-muted shrink-0" />
                                                                    <span className="text-fg-muted text-xs w-4">{idx + 1}.</span>
                                                                    <span className="truncate">{nombreParticipante(gp.torneo_participantes)}</span>
                                                                </button>
                                                                <Badge variant="brand" className="shrink-0 ml-2">
                                                                    {eloParticipante(gp.torneo_participantes)}
                                                                </Badge>
                                                            </div>
                                                            <p className="text-xs text-fg-muted mt-0.5 ml-5">
                                                                {gp.torneo_participantes.miembros.length > 1
                                                                    ? `${gp.torneo_participantes.miembros.length} integrantes`
                                                                    : (gp.torneo_participantes.miembros[0]?.jugadores.clubes?.nombre
                                                                        ?? gp.torneo_participantes.jugadores?.clubes?.nombre
                                                                        ?? '—')}
                                                            </p>

                                                            {/* Menú de sustitución por clic */}
                                                            {swapMenu?.grupoId === grupo.id && swapMenu?.participanteId === gp.id && (
                                                                <div className="absolute z-40 top-full left-3 mt-1 w-64 card-elevated max-h-64 overflow-y-auto">
                                                                    <div className="px-3 py-2 text-xs font-bold text-fg-muted uppercase tracking-wider border-b border-line inline-flex items-center gap-1.5">
                                                                        <ArrowsRightLeftIcon className="h-3 w-3" />
                                                                        Sustituir por
                                                                    </div>
                                                                    {modo === 'manual' && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => { e.stopPropagation(); enviarAlPool(grupo.id, gp.id) }}
                                                                            className="w-full text-left px-3 py-2 text-sm text-warning hover:bg-warning-soft font-semibold transition-colors border-b border-line inline-flex items-center gap-1.5"
                                                                        >
                                                                            <ArrowDownTrayIcon className="h-3 w-3" />
                                                                            Devolver a la lista
                                                                        </button>
                                                                    )}
                                                                    {todosLosColocados
                                                                        .filter(({ p }) => p.id !== gp.id)
                                                                        .map(({ grupo: g2, p }) => (
                                                                            <button
                                                                                key={p.id}
                                                                                type="button"
                                                                                onClick={(e) => { e.stopPropagation(); handleSwapClick(g2.id, p.id) }}
                                                                                className="w-full text-left px-3 py-2 text-sm hover:bg-subtle transition-colors flex justify-between items-center"
                                                                            >
                                                                                <span className="truncate">{nombreParticipante(p.torneo_participantes)}</span>
                                                                                <Badge variant="neutral">G{g2.numero_grupo}</Badge>
                                                                            </button>
                                                                        ))}
                                                                </div>
                                                            )}
                                                        </li>
                                                    )
                                                })}
                                            </ul>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>

            <div className="-mx-5 -mb-5 mt-4 px-5 py-3 border-t border-line flex justify-between items-center bg-subtle rounded-b-xl">
                <span className="text-sm text-fg-muted inline-flex items-center gap-2">
                    {grupos.length > 0 && (
                        <>
                            <CheckIcon className="h-3.5 w-3.5 text-success" />
                            {grupos.length} grupos · {totalIntegrantes} jugadores
                        </>
                    )}
                    {hasChanges && (
                        <span className="text-warning font-medium">· cambios sin guardar</span>
                    )}
                </span>
                <Button variant="secondary" onClick={onClose}>
                    Cerrar
                </Button>
            </div>
        </Modal>
    )
}
