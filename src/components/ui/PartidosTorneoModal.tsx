'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { PrinterIcon, PlayIcon, CheckBadgeIcon, TrophyIcon, ExclamationTriangleIcon, ChevronUpDownIcon, CheckIcon } from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import NavegacionModales, { DestinoModal } from '@/components/ui/NavegacionModales'
import CargandoPantalla from '@/components/ui/CargandoPantalla'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import PartidosResultadoModal from '@/components/ui/PartidosResultadoModal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import PartidosGrupoModal, { GrupoLite } from '@/components/ui/PartidosGrupoModal'
import ResolverEmpateModal from '@/components/ui/ResolverEmpateModal'
import EncuentroEquiposWizardModal from '@/components/ui/EncuentroEquiposWizardModal'
import { categoriasParaSelector, esTorneoAbiertoTotal } from '@/lib/torneo'
import { fetchCache, obtenerCache, precargar } from '@/lib/fetchCache'
import { imprimirAlineacionesBatch as importarEImprimirAlineacionBatch } from '@/lib/torneo/imprimirAlineacion'
import { MATCHUPS_EQUIPOS, MATCHUPS_DOBLES } from '@/lib/torneo/matchups'
import { alineacionDesdeDetalles, imprimirHojaPartidos } from '@/lib/torneo/hojaPartidos'
import { enviarBorradoresJuegos, type BorradorJuego } from '@/lib/torneo/borradores-juegos'

interface Categoria { id: number; nombre: string }
interface Jugador { id: number; nombre: string }
interface Miembro { jugador_id: number; jugadores: Jugador }
interface Participante {
    id: number
    nombre_personalizado?: string | null
    jugadores?: Jugador | null
    miembros: Miembro[]
}
interface SetPartido { numero: number; puntos_local: number; puntos_visitante: number }
interface DetalleEquipo {
    id: number
    orden: number
    tipo: 'DOBLES' | 'INDIVIDUAL'
    estado: 'PENDIENTE' | 'FINALIZADO'
    sets_local: number
    sets_visitante: number
    jugadores: { jugador_id: number; lado: 'LOCAL' | 'VISITANTE'; orden: number; jugadores: Jugador }[]
    sets: SetPartido[]
}
interface PosicionGrupo {
    posicion: number
    /** Posición "real" considerando empates: tres empatados muestran 2/2/2
     *  en vez de 2/3/4. Para no-empatados, coincide con `posicion`. */
    posicion_empatada?: number
    participante_id: number
    nombre: string
    victorias: number
    derrotas: number
    setsFavor: number
    setsContra: number
    puntosFavor: number
    puntosContra: number
    requiere_decision_manual: boolean
}
interface ClasificacionGrupo {
    grupoId: number
    numero_grupo: number
    posiciones: PosicionGrupo[]
    /** IDs de participantes que el sistema no puede desempatar. */
    pendientes_manual?: number[]
}
interface Partido {
    id: number
    orden: number
    sets_local: number
    sets_visitante: number
    estado: 'PENDIENTE' | 'FINALIZADO'
    torneo_grupos: { id: number; numero_grupo: number } | null
    participante_local: Participante
    participante_visitante: Participante
    arbitro: Jugador | null
    sets: SetPartido[]
    detalles: DetalleEquipo[]
}
interface Torneo {
    id: number
    nombre: string
    modalidad: 'INDIVIDUAL' | 'DOBLES' | 'EQUIPOS' | 'ATTA_TEAMS'
    abierto?: boolean
    torneo_categorias: { categorias: Categoria }[]
}
interface Props { isOpen: boolean; onClose: () => void; torneo: Torneo | null; onOpenLlaves?: () => void; onNavegar?: (destino: DestinoModal) => void }

const nombreParticipante = (participante: Participante) =>
    participante.nombre_personalizado?.trim()
    || participante.miembros.map(miembro => miembro.jugadores.nombre).join(' / ')
    || participante.jugadores?.nombre
    || 'Participante'

const escaparHtml = (texto: string) => texto.replace(/[&<>"']/g, caracter => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[caracter] || caracter))

interface CruceDisponible {
    grupo_id: number
    participante_local_id: number
    participante_visitante_id: number
    arbitro_jugador_id: number | null
    local: string
    visitante: string
}

function TablasClasificacion({
    clasificaciones,
    onClickGrupo,
    grupoFiltroId,
    borradoresPorGrupo,
    onResolverEmpate,
    clasifican = 2,
}: {
    clasificaciones: ClasificacionGrupo[]
    onClickGrupo?: (grupoId: number) => void
    grupoFiltroId?: number | null
    /** Mapa grupoId → IDs de partidos con borrador. */
    borradoresPorGrupo?: Map<number, Set<number>>
    /** Abre el modal de resolución de empate para el grupo dado. */
    onResolverEmpate?: (grupoId: number) => void
    /** Posiciones que clasifican a llaves; se resaltan en la tabla. ATTA Teams usa 3. */
    clasifican?: number
}) {
    if (clasificaciones.length === 0) return null
    return (
        <section className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {clasificaciones.map(grupo => {
                const activo = grupoFiltroId === grupo.grupoId
                const tieneBorrador = !!borradoresPorGrupo?.get(grupo.grupoId)?.size
                const idsPendientes = grupo.pendientes_manual ?? []
                const tieneEmpate = idsPendientes.length > 0
                // Calculamos el rango de posiciones empatadas para el banner
                // (ej. "posiciones 2 a 4").
                const posicionesPendientes = grupo.posiciones
                    .filter(p => idsPendientes.includes(p.participante_id))
                    .map(p => p.posicion_empatada ?? p.posicion)
                const posMin = posicionesPendientes.length > 0 ? Math.min(...posicionesPendientes) : null
                const posMax = posicionesPendientes.length > 0 ? Math.max(...posicionesPendientes) : null
                return (
                    <div
                        key={grupo.grupoId}
                        className={`card-flush overflow-hidden transition-colors ${activo ? 'ring-2 ring-brand' : ''}`}
                    >
                        <div className="px-4 py-2.5 bg-subtle border-b border-line text-xs font-bold text-fg-muted uppercase tracking-wider flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2">
                                Clasificación · Grupo {grupo.numero_grupo}
                                {tieneBorrador && (
                                    <Badge variant="warning">
                                        <span className="inline-flex items-center gap-1">
                                            <ExclamationTriangleIcon className="h-3 w-3" />
                                            Borrador
                                        </span>
                                    </Badge>
                                )}
                            </span>
                            <div className="flex items-center gap-2">
                                {onClickGrupo && (
                                    <button
                                        type="button"
                                        onClick={() => onClickGrupo(grupo.grupoId)}
                                        className="text-[0.65rem] font-normal normal-case text-brand hover:underline"
                                    >
                                        {activo ? 'Quitar filtro' : 'Ver partidos →'}
                                    </button>
                                )}
                            </div>
                        </div>
                        {tieneEmpate && onResolverEmpate && (
                            <button
                                type="button"
                                onClick={() => onResolverEmpate(grupo.grupoId)}
                                className="w-full px-4 py-2 bg-warning-soft/40 border-b border-warning/30 text-left flex items-center gap-2 hover:bg-warning-soft/60 transition-colors"
                                title="El sistema no puede desempatar a estos participantes. Pulsa para asignar el orden manualmente."
                            >
                                <ExclamationTriangleIcon className="h-4 w-4 text-warning flex-shrink-0" />
                                <span className="text-xs text-fg">
                                    <b className="font-semibold">Empate en posiciones {posMin}{posMin !== posMax ? ` a ${posMax}` : ''}.</b>{' '}
                                    <span className="text-fg-muted">Toca aquí para resolver quién pasa primero.</span>
                                </span>
                            </button>
                        )}
                        <div className="overflow-x-auto">
                            <table className="table-compact">
                                <thead>
                                    <tr>
                                        <th className="w-8">#</th>
                                        <th>Participante</th>
                                        <th className="text-center w-10">V</th>
                                        <th className="text-center w-10">D</th>
                                        <th className="text-center w-20">Sets</th>
                                        <th className="text-center w-24">Puntos</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {grupo.posiciones.map(posicion => {
                                        const clasifica = posicion.posicion <= clasifican
                                        const filaClass = [
                                            'transition-colors',
                                            onClickGrupo ? 'cursor-pointer hover:bg-subtle' : '',
                                            posicion.requiere_decision_manual ? 'bg-warning-soft/40 border-l-2 border-warning' : clasifica ? 'border-l-2 border-success' : '',
                                        ].filter(Boolean).join(' ')
                                        const tooltip = posicion.requiere_decision_manual
                                            ? 'Empate de W, sets y puntos: el sistema no puede desempatar. Asigna la posición manualmente antes de continuar.'
                                            : undefined
                                        const contenido = (
                                            <>
                                                <td className="font-bold text-fg">
                                                    {posicion.requiere_decision_manual
                                                        ? <span title={tooltip} className="inline-flex items-center gap-1">
                                                            {posicion.posicion_empatada ?? posicion.posicion}
                                                            <ExclamationTriangleIcon className="h-3.5 w-3.5 text-warning" />
                                                        </span>
                                                        : posicion.posicion_empatada ?? posicion.posicion}
                                                </td>
                                                <td className="font-medium">
                                                    <span className="inline-flex items-center gap-1.5">
                                                        {posicion.nombre}
                                                    </span>
                                                </td>
                                                <td className="text-center">{posicion.victorias}</td>
                                                <td className="text-center">{posicion.derrotas}</td>
                                                <td className="text-center font-mono">{posicion.setsFavor}-{posicion.setsContra}</td>
                                                <td className="text-center font-mono">{posicion.puntosFavor}-{posicion.puntosContra}</td>
                                            </>
                                        )
                                        return onClickGrupo ? (
                                            <tr key={posicion.participante_id} className={filaClass} title={tooltip} onClick={() => onClickGrupo(grupo.grupoId)}>
                                                {contenido}
                                            </tr>
                                        ) : (
                                            <tr key={posicion.participante_id} className={filaClass} title={tooltip}>
                                                {contenido}
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            })}
        </section>
    )
}

export default function PartidosTorneoModal({ isOpen, onClose, torneo, onOpenLlaves, onNavegar }: Props) {
    const [categoriaId, setCategoriaId] = useState('')
    const [partidos, setPartidos] = useState<Partido[]>([])
    const [clasificaciones, setClasificaciones] = useState<ClasificacionGrupo[]>([])
    const [loading, setLoading] = useState(false)
    const [generando, setGenerando] = useState(false)
    const [partidoResultadoId, setPartidoResultadoId] = useState<number | null>(null)
    const [borradores, setBorradores] = useState<Record<number, { sets: { local: number; visitante: number }[] }>>({})
    /** Borradores de JUEGOS de serie (clave = detalle id), controlados aquí
     *  para que sobrevivan al cierre del modal de resultados. */
    const [borradoresJuegos, setBorradoresJuegos] = useState<Record<number, BorradorJuego>>({})
    /** Diálogo al cerrar el modal padre habiendo borradores sin enviar. */
    const [salirConBorradores, setSalirConBorradores] = useState(false)
    const [cerrandoConEnvio, setCerrandoConEnvio] = useState(false)
    /** ID del grupo cuyo modal de partidos está abierto, o null si ninguno. */
    const [grupoModalId, setGrupoModalId] = useState<number | null>(null)
    /** ID del grupo cuyo modal de resolución de empate está abierto. */
    const [grupoResolucionId, setGrupoResolucionId] = useState<number | null>(null)
    const [modalGeneracion, setModalGeneracion] = useState<{
        cruces: CruceDisponible[]
        seleccionados: Set<string>
        arbitroAsignado: Map<string, number | null>
    } | null>(null)
    const [todasCategorias, setTodasCategorias] = useState<Categoria[]>([])
    /** ID del grupo cuyo wizard de alineación está abierto, o null. */
    const [wizardPartidoId, setWizardPartidoId] = useState<number | null>(null)

    // Cargamos el catálogo completo de categorías para soportar torneos
    // "abiertos" (DOBLES, EQUIPOS o primera categoría), donde el selector
    // debe mostrar TODAS las categorías, no solo las asignadas.
    useEffect(() => {
        let cancelado = false
        fetch('/api/categorias')
            .then(r => r.ok ? r.json() : [])
            .then(data => { if (!cancelado) setTodasCategorias(Array.isArray(data) ? data : []) })
            .catch(() => { /* silencioso: si falla, solo se muestran las del torneo */ })
        return () => { cancelado = true }
    }, [])

    const categorias = categoriasParaSelector(
        torneo?.torneo_categorias,
        todasCategorias,
        torneo?.modalidad,
        torneo?.abierto,
    )
    // El torneo es "totalmente abierto" si la modalidad es DOBLES/EQUIPOS
    // o si el usuario lo marcó como abierto al crearlo (columna `abierto`).
    // En INDIVIDUAL sin marca `abierto`, el selector se mantiene.
    const esAbierto = esTorneoAbiertoTotal(torneo?.modalidad, torneo?.abierto)
    const categoriaOperativa = esAbierto
        ? (todasCategorias.find(c => c.nombre === 'primera') || categorias[0])
        : categorias.find(c => c.id.toString() === categoriaId) || categorias[0]
    const partidosPorGrupo = useMemo(() => {
        const grupos = new Map<number, { id: number; numero: number; partidos: Partido[] }>()
        partidos.forEach(partido => {
            if (!partido.torneo_grupos) return
            const actual = grupos.get(partido.torneo_grupos.id) || {
                id: partido.torneo_grupos.id,
                numero: partido.torneo_grupos.numero_grupo,
                partidos: []
            }
            actual.partidos.push(partido)
            grupos.set(partido.torneo_grupos.id, actual)
        })
        return [...grupos.values()].sort((a, b) => a.numero - b.numero)
    }, [partidos])

    // Indicador de borrador por grupo: para cada grupo, los IDs de partidos
    // que tienen un borrador en memoria. La cabecera de la tabla de
    // clasificación muestra el badge si el set no está vacío.
    const borradoresPorGrupo = useMemo(() => {
        const mapa = new Map<number, Set<number>>()
        for (const partido of partidos) {
            if (!borradores[partido.id] || !partido.torneo_grupos) continue
            const set = mapa.get(partido.torneo_grupos.id) || new Set<number>()
            set.add(partido.id)
            mapa.set(partido.torneo_grupos.id, set)
        }
        return mapa
    }, [partidos, borradores])

    useEffect(() => {
        // Al cambiar de torneo, seleccionamos la primera categoría SOLO si
        // la actual ya no es válida. No limpiamos partidos ni borradores:
        // el useEffect de [isOpen, categoriaId] recargará los datos y los
        // borradores del usuario se conservan al alternar entre categorías.
        if (!torneo) {
            setCategoriaId('')
            return
        }
        if (esAbierto) {
            const primera = todasCategorias.find(c => c.nombre === 'primera') || categorias[0]
            if (primera) setCategoriaId(String(primera.id))
            return
        }
        const categoriaValida = categorias.some(c => c.id.toString() === categoriaId)
        if (!categoriaValida) {
            setCategoriaId(categorias[0]?.id.toString() || '')
        }
    }, [torneo, esAbierto, todasCategorias])

    const urlPartidos = (catId: string) => `/api/torneos/${torneo?.id}/partidos?categoriaId=${catId}`

    const cargar = async (forzar = false) => {
        if (!torneo || !categoriaId) return
        const url = urlPartidos(categoriaId)
        // Con copia en caché pintamos al instante (y revalida por detrás):
        // cero spinner al cambiar de categoría ya visitada.
        if (!forzar && !obtenerCache(url)) setLoading(true)
        try {
            const data = await fetchCache<{ partidos?: never[]; clasificaciones?: never[] }>(url, { forzar })
            setPartidos((data.partidos || []) as never[])
            setClasificaciones((data.clasificaciones || []) as never[])
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Error de conexión')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { if (isOpen && categoriaId) cargar() }, [isOpen, categoriaId])

    /** Parche optimista tras «Deshacer resultado»: revierte el partido (y
     *  los detalles de la serie, si es por equipos) en el estado local para
     *  que el modal se actualice al instante. `cargar(true)` revalida el
     *  resto (ranking/clasificaciones) por detrás. */
    const deshacerPartidoLocal = (partidoId: number) => {
        setPartidos(prev => prev.map(p => p.id === partidoId ? {
            ...p,
            estado: 'PENDIENTE' as const,
            sets_local: 0,
            sets_visitante: 0,
            sets: [],
            detalles: p.detalles.map(d => ({
                ...d,
                estado: 'PENDIENTE' as const,
                sets_local: 0,
                sets_visitante: 0,
                sets: [],
            })),
        } : p))
    }

    /** Alineación de un detalle desde los partidos ya cargados (para enviar
     *  borradores de juegos sin re-fetch). */
    const resolverDetalleGrupos = (detalleId: number) => {
        for (const p of partidos) {
            const d = p.detalles.find(x => x.id === detalleId)
            if (!d) continue
            return {
                partidoProgramadoId: p.id,
                jugadoresLocalIds: d.jugadores.filter(j => j.lado === 'LOCAL').map(j => j.jugador_id),
                jugadoresVisitanteIds: d.jugadores.filter(j => j.lado === 'VISITANTE').map(j => j.jugador_id),
            }
        }
        return null
    }

    /** Parche optimista al enviarse juegos de serie: marca los detalles
     *  FINALIZADO con sets calculados desde los borradores. */
    const parcheJuegosEnviados = (partidoId: number, detalleIds: number[]) => {
        setPartidos(prev => prev.map(p => p.id !== partidoId ? p : {
            ...p,
            detalles: p.detalles.map(d => {
                if (!detalleIds.includes(d.id)) return d
                const sets = borradoresJuegos[d.id]?.sets ?? []
                const sl = sets.filter(s => s.local > s.visitante).length
                const sv = sets.filter(s => s.visitante > s.local).length
                return { ...d, estado: 'FINALIZADO' as const, sets_local: sl, sets_visitante: sv, sets: sets.map((s, i) => ({ numero: i + 1, puntos_local: s.local, puntos_visitante: s.visitante })) }
            }),
        }))
    }

    const numeroBorradoresJuegos = Object.keys(borradoresJuegos).length

    /** Cierre del modal padre con borradores pendientes (partidos y/o
     *  juegos): ofrece «Guardar y salir» en vez de perderlos de vista. */
    const intentarCerrarPartidos = () => {
        if (Object.keys(borradores).length > 0 || numeroBorradoresJuegos > 0) {
            setSalirConBorradores(true)
            return
        }
        onClose()
    }

    /** «Guardar y salir»: envía primero los borradores de partidos y luego
     *  los de juegos; si algún juego falla, se queda abierto para revisar
     *  (los de partidos que fallen los gestiona guardarBorradores con su
     *  propio toast y permanecen en memoria). */
    const cerrarGuardandoTodo = async () => {
        if (!torneo) return onClose()
        setCerrandoConEnvio(true)
        try {
            if (Object.keys(borradores).length > 0) await guardarBorradores()
            let fallidosJuegos: { id: number; motivo: string }[] = []
            if (numeroBorradoresJuegos > 0) {
                const r = await enviarBorradoresJuegos({
                    torneoId: torneo.id,
                    borradores: borradoresJuegos,
                    resolverDetalle: resolverDetalleGrupos,
                })
                fallidosJuegos = r.fallidos
                if (r.guardados.length > 0) {
                    setBorradoresJuegos(Object.fromEntries(
                        Object.entries(borradoresJuegos).filter(([id]) => !r.guardados.includes(Number(id)))
                    ))
                }
            }
            setSalirConBorradores(false)
            if (fallidosJuegos.length === 0) {
                onClose()
            } else {
                toast.error(`${fallidosJuegos.length} juego${fallidosJuegos.length === 1 ? '' : 's'} con error: ${fallidosJuegos[0].motivo}. Quedan en borrador.`)
            }
        } finally {
            setCerrandoConEnvio(false)
        }
    }

    // Precarga silenciosa de TODAS las categorías del torneo al abrir:
    // alternar entre ellas pinta al instante desde la caché.
    useEffect(() => {
        if (!isOpen || !torneo || categorias.length === 0) return
        const ids = esAbierto
            ? [categorias.find(c => c.nombre === 'primera')?.id ?? categorias[0]?.id]
            : categorias.map(c => c.id)
        precargar(...ids.filter(Boolean).map(id => urlPartidos(String(id))))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, torneo, categorias])

    // ── Previsualización de generación ────────────────────────────────────
    const abrirPrevisualizacionGeneracion = async () => {
        if (!torneo || !categoriaId) return
        setGenerando(true)
        try {
            const response = await fetch(`/api/torneos/${torneo.id}/partidos/previsualizar?categoriaId=${categoriaId}`)
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || 'No se pudieron previsualizar los cruces')
            const cruces: CruceDisponible[] = (data.cruces || []).map((cruce: {
                grupo_id: number
                participante_local_id: number
                participante_visitante_id: number
                arbitro_jugador_id: number | null
                local: string
                visitante: string
            }) => ({
                grupo_id: cruce.grupo_id,
                participante_local_id: cruce.participante_local_id,
                participante_visitante_id: cruce.participante_visitante_id,
                arbitro_jugador_id: cruce.arbitro_jugador_id,
                local: cruce.local,
                visitante: cruce.visitante,
            }))
            const claves = new Set(cruces.map(c => `${c.grupo_id}-${c.participante_local_id}-${c.participante_visitante_id}`))
            setModalGeneracion({
                cruces,
                seleccionados: claves,
                arbitroAsignado: new Map(cruces.map(c => [`${c.grupo_id}-${c.participante_local_id}-${c.participante_visitante_id}`, c.arbitro_jugador_id])),
            })
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Error de conexión')
        } finally {
            setGenerando(false)
        }
    }

    const toggleCruce = (clave: string) => {
        if (!modalGeneracion) return
        const nuevos = new Set(modalGeneracion.seleccionados)
        if (nuevos.has(clave)) nuevos.delete(clave)
        else nuevos.add(clave)
        setModalGeneracion({ ...modalGeneracion, seleccionados: nuevos })
    }

    const toggleTodos = (seleccionar: boolean) => {
        if (!modalGeneracion) return
        const nuevos = seleccionar
            ? new Set(modalGeneracion.cruces.map(c => `${c.grupo_id}-${c.participante_local_id}-${c.participante_visitante_id}`))
            : new Set<string>()
        setModalGeneracion({ ...modalGeneracion, seleccionados: nuevos })
    }

    const confirmarGeneracion = async () => {
        if (!torneo || !categoriaId || !modalGeneracion) return
        const seleccionados = modalGeneracion.cruces
            .filter(c => modalGeneracion.seleccionados.has(`${c.grupo_id}-${c.participante_local_id}-${c.participante_visitante_id}`))
        if (seleccionados.length === 0) {
            toast.error('Selecciona al menos un cruce para generar')
            return
        }
        setGenerando(true)
        try {
            const response = await fetch(`/api/torneos/${torneo.id}/partidos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    categoriaId: Number(categoriaId),
                    partidos: seleccionados.map((c, index) => ({
                        grupo_id: c.grupo_id,
                        participante_local_id: c.participante_local_id,
                        participante_visitante_id: c.participante_visitante_id,
                        arbitro_jugador_id: c.arbitro_jugador_id,
                        orden: index + 1,
                    })),
                }),
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || 'No se pudieron generar los partidos')
            toast.success(`${data.message} (${seleccionados.length} cruces)`)
            setModalGeneracion(null)
            cargar(true)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Error de conexión')
        } finally {
            setGenerando(false)
        }
    }

    const abrirResultado = (partidoId: number) => {
        setPartidoResultadoId(partidoId)
    }

    /**
     * Valida un set: ambos enteros 0-99, ganador a 11 con diferencia de 2,
     * o más allá de 11-10 si hay empate largo. Esto refleja lo que exige el
     * endpoint PUT y nos permite rechazar un partido inválido SIN enviarlo
     * al server (lo que rompería el batch y dejaría borradores fantasma en
     * memoria).
     */
    const validarSets = (sets: { local: number; visitante: number }[]): string | null => {
        if (sets.length < 3 || sets.length > 5) return 'Ingresa entre 3 y 5 sets'
        for (const set of sets) {
            if (!Number.isInteger(set.local) || !Number.isInteger(set.visitante)) return 'Los sets deben ser enteros'
            if (set.local < 0 || set.visitante < 0) return 'Los puntos no pueden ser negativos'
            if (set.local > 99 || set.visitante > 99) return 'Puntos fuera de rango'
            const mayor = Math.max(set.local, set.visitante)
            const menor = Math.min(set.local, set.visitante)
            if (mayor < 11 || mayor - menor < 2) return 'Cada set debe ganarse a 11 con diferencia de 2'
        }
        const setsLocal = sets.filter(s => s.local > s.visitante).length
        const setsVisitante = sets.filter(s => s.visitante > s.local).length
        if (setsLocal !== 3 && setsVisitante !== 3) return 'El ganador debe obtener exactamente 3 sets'
        return null
    }

    const guardarBorradores = async () => {
        if (!torneo || Object.keys(borradores).length === 0) return
        setGenerando(true)
        const guardados: number[] = []
        const fallidos: { id: number; motivo: string }[] = []
        // Trabajamos sobre una copia para no mutar el estado durante el loop.
        const borradoresActuales = Object.entries(borradores)
        const guardarUno = async ([partidoIdStr, resultado]: [string, { sets: { local: number; visitante: number }[] }]) => {
            const partidoId = Number(partidoIdStr)
            const errorValidacion = validarSets(resultado.sets)
            if (errorValidacion) {
                fallidos.push({ id: partidoId, motivo: errorValidacion })
                return
            }
            try {
                const response = await fetch(`/api/torneos/${torneo.id}/partidos/${partidoId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(resultado),
                })
                if (!response.ok) {
                    const data = await response.json().catch(() => ({}))
                    // 409: el partido ya está finalizado en BD (caso típico:
                    // otro operador ya lo guardó, o este mismo cliente lo
                    // guardó antes y el borrador quedó en memoria). Lo
                    // tratamos como "guardado" para limpiarlo del state.
                    if (response.status === 409) {
                        guardados.push(partidoId)
                    } else {
                        fallidos.push({ id: partidoId, motivo: data.error || data.detalles || `HTTP ${response.status}` })
                    }
                    return
                }
                guardados.push(partidoId)
            } catch (error) {
                fallidos.push({ id: partidoId, motivo: error instanceof Error ? error.message : 'Error de red' })
            }
        }

        // En paralelo por lotes pequeños: secuencial sobre un túnel lento
        // convierte cada guardado en ~10s y el total en minutos.
        const LOTE = 4
        for (let i = 0; i < borradoresActuales.length; i += LOTE) {
            await Promise.all(borradoresActuales.slice(i, i + LOTE).map(guardarUno))
        }
        // Limpiamos de `borradores` los que sí quedaron persistidos (éxito o
        // 409), conservando los que fallaron para que el usuario los revise.
        if (guardados.length > 0) {
            setBorradores(prev => {
                const siguiente = { ...prev }
                for (const id of guardados) delete siguiente[id]
                return siguiente
            })
        }
        // Refrescamos SIEMPRE para sincronizar con la BD: partidos
        // finalizados, clasificaciones recalculadas, borradores fantasma
        // eliminados de la UI.
        await cargar(true)
        if (fallidos.length === 0) {
            toast.success(`${guardados.length} resultado${guardados.length === 1 ? '' : 's'} guardados y ranking actualizado`)
        } else if (guardados.length === 0) {
            // Mostramos el primer motivo: sin esto, un lote que falla entero
            // (ej. torneo borrado → 404) no dice POR QUÉ.
            toast.error(`No se guardó ningún resultado: ${fallidos[0]?.motivo ?? 'error desconocido'}. Revisa los ${fallidos.length} borrador${fallidos.length === 1 ? '' : 'es'}`)
        } else {
            const motivo = fallidos[0].motivo
            toast.error(`${guardados.length} guardados, ${fallidos.length} con error: ${motivo}${fallidos.length > 1 ? '…' : ''}`)
        }
        setGenerando(false)
    }

    const imprimir = () => {
        if (!torneo || partidosPorGrupo.length === 0) return
        const categoria = categorias.find(item => item.id.toString() === categoriaId)?.nombre || ''
        const fecha = new Date().toLocaleDateString('es-PA', { day: '2-digit', month: 'long', year: 'numeric' })
        // Genera el alfabético A, B, C... para etiquetar cada encuentro.
        // Si la hoja tiene más de 26 partidos, sigue con AA, AB...
        const letraEncuentro = (idx: number): string => {
            let n = idx
            let s = ''
            do {
                s = String.fromCharCode(65 + (n % 26)) + s
                n = Math.floor(n / 26) - 1
            } while (n >= 0)
            return s
        }
        // Matchups estándar importados para derivar QUÉ jugadores juegan
        // cada cruce. Solo se imprimen los jugadores que efectivamente
        // juegan ese partido (no todos los del roster).
        // Ej: partido 1 = A+B vs X+Y → solo imprime A, B (locales) y X, Y (visitantes).
        const modalidadEquipos = torneo.modalidad === 'DOBLES' || torneo.modalidad === 'EQUIPOS' || torneo.modalidad === 'ATTA_TEAMS'
        const matchups = modalidadEquipos
            ? (torneo.modalidad === 'DOBLES' ? MATCHUPS_DOBLES : MATCHUPS_EQUIPOS)
            : []
        // Resolución local de letra → jugador. Busca el detalle del partido
        // cuyo matchup incluye esa letra (en el orden local/visitante) y
        // devuelve el jugador guardado en `orden` correspondiente. Como cada
        // detalle guarda SOLO los jugadores que juegan ESE cruce, el `orden`
        // dentro del detalle mapea 1-a-1 con las letras del matchup.
        //
        //   Partido 1 (DOBLES, A+B vs X+Y):
        //     detalle 1 jugadores locales = [A (orden 1), B (orden 2)]
        //   Partido 2 (INDIVIDUAL, A vs X):
        //     detalle 2 jugadores locales = [A (orden 1)]
        //
        // La LETRA de cada jugador se deriva del `orden` y del matchup de
        // ese detalle (índice del detalle dentro del partido = índice del
        // matchup en MATCHUPS_EQUIPOS/DOBLES).
        const jugadorPorSlot = (
            partido: Partido,
            lado: 'LOCAL' | 'VISITANTE',
            letra: string,
            idxPartido: number,
        ): Jugador | null => {
            const detalles = partido.detalles ?? []
            // Encontramos el matchup que contiene esta letra en el lado pedido.
            // Cada detalle del partido se mapea al matchup por su `orden` (1→matchup 0, etc.).
            const detallesOrdenados = detalles.slice().sort((a, b) => a.orden - b.orden)
            const m = matchups[idxPartido]
            if (!m) return null
            const letrasLado: string[] = Array.isArray(
                m.cruces[lado === 'LOCAL' ? 'local' : 'visitante'],
            )
                ? (m.cruces[lado === 'LOCAL' ? 'local' : 'visitante'] as string[])
                : [m.cruces[lado === 'LOCAL' ? 'local' : 'visitante'] as string]
            const posicionEnLado = letrasLado.indexOf(letra)
            if (posicionEnLado < 0) return null
            // Encontramos el detalle que corresponde al matchup `idxPartido`.
            const detalle = detallesOrdenados[idxPartido]
            if (!detalle) return null
            const jugadores = (detalle.jugadores ?? [])
                .filter(j => j.lado === lado)
                .sort((a, b) => a.orden - b.orden)
            return jugadores[posicionEnLado]?.jugadores ?? null
        }
        // Genera la lista de integrantes para un partido siguiendo el orden
        // de los matchups estándar (A, B, C → partido 1 = AB, partido 2 = A, ...).
        // Si no hay alineación guardada, fallback a la lista plana de miembros.
        const integranteLinea = (j: Jugador): string => `${j.id} — ${escaparHtml(j.nombre)}`
        const letrasEnOrden = (lado: 'LOCAL' | 'VISITANTE', idxPartido: number): string[] => {
            if (!modalidadEquipos) return []
            const m = matchups[idxPartido]
            if (!m) return []
            return Array.isArray(m.cruces[lado === 'LOCAL' ? 'local' : 'visitante'])
                ? (m.cruces[lado === 'LOCAL' ? 'local' : 'visitante'] as string[])
                : [m.cruces[lado === 'LOCAL' ? 'local' : 'visitante'] as string]
        }
        const integrantes = (
            participante: Participante,
            lado: 'LOCAL' | 'VISITANTE',
            partido: Partido,
            idxPartido: number,
        ): string[] => {
            const letras = letrasEnOrden(lado, idxPartido)
            if (letras.length > 0 && partido.detalles && partido.detalles.length > 0) {
                const lineas: string[] = []
                letras.forEach(letra => {
                    const j = jugadorPorSlot(partido, lado, letra, idxPartido)
                    if (j) lineas.push(`<b>${letra}</b> · ${integranteLinea(j)}`)
                })
                if (lineas.length > 0) return lineas
            }
            // Fallback: lista plana de miembros del equipo.
            if (participante.miembros.length > 0) {
                return participante.miembros.map(m => integranteLinea(m.jugadores))
            }
            return participante.jugadores ? [integranteLinea(participante.jugadores)] : []
        }
        const paginas = partidosPorGrupo.map(grupo => {
            // Numeramos los encuentros SOLO dentro de esta hoja (A, B, C…).
            const esIndividual = torneo.modalidad === 'INDIVIDUAL'
            const filas = grupo.partidos.map((partido, idx) => {
                const localIntegs = integrantes(partido.participante_local, 'LOCAL', partido, idx)
                const visitIntegs = integrantes(partido.participante_visitante, 'VISITANTE', partido, idx)
                // Para INDIVIDUAL el jugador también aparece con su ID
                // debajo del nombre (en vez de la lista de integrantes).
                const bloqueLocal = esIndividual
                    ? `<div class="equipo-nombre">${escaparHtml(nombreParticipante(partido.participante_local))}</div>
                       <div class="equipo-id">ID: ${partido.participante_local.jugadores?.id ?? (partido.participante_local.miembros[0]?.jugadores?.id ?? '')}</div>`
                    : `<div class="equipo-nombre">${escaparHtml(nombreParticipante(partido.participante_local))}</div>
                       <ul class="equipo-integrantes">${localIntegs.map(n => `<li>${n}</li>`).join('')}</ul>`
                const bloqueVisit = esIndividual
                    ? `<div class="equipo-nombre">${escaparHtml(nombreParticipante(partido.participante_visitante))}</div>
                       <div class="equipo-id">ID: ${partido.participante_visitante.jugadores?.id ?? (partido.participante_visitante.miembros[0]?.jugadores?.id ?? '')}</div>`
                    : `<div class="equipo-nombre">${escaparHtml(nombreParticipante(partido.participante_visitante))}</div>
                       <ul class="equipo-integrantes">${visitIntegs.map(n => `<li>${n}</li>`).join('')}</ul>`
                // Árbitro: si está asignado por la API (partidos con
                // `arbitro_jugador_id` o `arbitro.nombre`), lo
                // imprimimos; si no, queda línea en blanco para asignar a mano.
                const arbitroAsignado = partido.arbitro?.nombre?.trim() || ''
                const arbitroBloque = arbitroAsignado
                    ? `<div class="arbitro-nombre">${escaparHtml(arbitroAsignado)}</div>`
                    : `<div class="arbitro-linea"></div>`
                return `
                <tr>
                  <td class="letra">${letraEncuentro(idx)}</td>
                  <td class="equipo">${bloqueLocal}</td>
                  <td class="equipo">${bloqueVisit}</td>
                  <td class="arbitro">${arbitroBloque}</td>
                  <td class="puntos"><div class="puntos-linea"><span class="puntos-izq"></span><span class="puntos-separador">/</span><span class="puntos-der"></span></div></td>
                  <td class="puntos"><div class="puntos-linea"><span class="puntos-izq"></span><span class="puntos-separador">/</span><span class="puntos-der"></span></div></td>
                  <td class="puntos"><div class="puntos-linea"><span class="puntos-izq"></span><span class="puntos-separador">/</span><span class="puntos-der"></span></div></td>
                  <td class="puntos"><div class="puntos-linea"><span class="puntos-izq"></span><span class="puntos-separador">/</span><span class="puntos-der"></span></div></td>
                  <td class="puntos"><div class="puntos-linea"><span class="puntos-izq"></span><span class="puntos-separador">/</span><span class="puntos-der"></span></div></td>
                  <td class="total"><div class="puntos-linea"><span class="puntos-izq"></span><span class="puntos-separador">/</span><span class="puntos-der"></span></div></td>
                </tr>`
            }).join('')
            return `
            <section class="page">
              <header class="cabecera">
                <img class="logo logo-izq" src="/logo.jpg" alt="ATTA" onerror="this.style.visibility='hidden'" />
                <div class="titulo-central">
                  <div class="titulo-torneo">${escaparHtml(torneo.nombre)}</div>
                  <div class="titulo-sub">Hoja de encuentros · Grupo ${grupo.numero} · ${escaparHtml(categoria)}</div>
                </div>
                <img class="logo logo-der" src="/templates/escudo-panama.png" alt="Alcaldía de Panamá" onerror="this.style.visibility='hidden'" />
              </header>
              <table class="encuentros">
                <thead>
                  <tr>
                    <th class="th-letra" rowspan="2">Encuentro</th>
                    <th rowspan="2">${esIndividual ? 'Jugador local' : 'Nombre de equipo<br/><span class="th-sub">Integrantes</span>'}</th>
                    <th rowspan="2">${esIndividual ? 'Jugador visitante' : '&nbsp;'}</th>
                    <th rowspan="2">Árbitro</th>
                    <th colspan="5">Puntos por set · local / visitante</th>
                    <th rowspan="2">Total<br/>sets</th>
                  </tr>
                  <tr>
                    <th class="th-set">Set 1</th>
                    <th class="th-set">Set 2</th>
                    <th class="th-set">Set 3</th>
                    <th class="th-set">Set 4</th>
                    <th class="th-set">Set 5</th>
                  </tr>
                </thead>
                <tbody>${filas}</tbody>
              </table>
              <div class="pie-nota">Anotar el tanteo de cada set con formato <b>local / visitante</b>. Partido al mejor de 5 sets.</div>
              <div class="pie-espacio"></div>
            </section>`
        }).join('')
        const ventana = window.open('', '_blank', 'width=1200,height=1500')
        if (!ventana) { toast.error('El navegador bloqueó la ventana de impresión'); return }
        ventana.document.write(`<!doctype html><html><head><title>Hojas de partidos</title><style>
            /* Tamaño carta (Letter, 8.5"×11"), vertical, sin padding en
             * pantalla para que la tabla llegue de borde a borde. El
             * margen de impresión es 4mm para que la impresora no
             * recorte el contenido. Celdas altas y tipografía grande para
             * que el operador pueda escribir el tanteo a mano con
             * comodidad. */
            @page{size:letter portrait;margin:4mm}
            html,body{width:8.5in;height:11in;margin:0;padding:0;box-sizing:border-box}
            body{font-family:Arial,sans-serif;color:#0f172a;margin:0;padding:0}
            .page{page-break-after:always;padding:0}.page:last-child{page-break-after:auto}
            .cabecera{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:8px 8px 14px;border-bottom:2.5px solid #0f172a}
            .logo{height:110px;object-fit:contain}
            .titulo-central{flex:1;text-align:center}
            .titulo-torneo{font-size:44px;font-weight:bold;font-style:italic;letter-spacing:.5px;line-height:1.05}
            .titulo-sub{font-size:18px;color:#475569;margin-top:6px;letter-spacing:1px}
            table.encuentros{width:100%;border-collapse:collapse;margin-top:18px}
            table.encuentros th,table.encuentros td{border:2.5px solid #0f172a;padding:18px 12px;font-size:16px;vertical-align:middle}
            table.encuentros thead th{background:#f1f5f9;text-align:center;font-size:15px;letter-spacing:.5px}
            th.th-sub{font-weight:normal;font-style:italic;color:#475569;letter-spacing:0;font-size:12px}
            th.th-letra,td.letra{width:74px;text-align:center;font-weight:bold;font-size:28px}
            th.th-set{width:78px;background:#f8fafc}
            td.equipo{min-width:0}
            td.equipo .equipo-nombre{font-weight:bold;font-size:22px;line-height:1.1}
            td.equipo .equipo-id{font-size:14px;color:#475569;font-family:'Courier New',monospace;margin-top:3px;letter-spacing:.5px}
            td.equipo ul.equipo-integrantes{list-style:none;padding:0;margin:4px 0 0 0;font-size:14px;color:#334155;line-height:1.35}
            td.equipo ul.equipo-integrantes li{padding:1px 0}
            td.equipo ul.equipo-integrantes li:before{content:"· ";color:#94a3b8}
            td.equipo ul.equipo-integrantes li b{color:#0f172a;font-weight:bold;margin-right:2px}
            td.arbitro{width:180px;text-align:center;vertical-align:middle}
            td.arbitro .arbitro-linea{border-bottom:2px solid #94a3b8;height:90px}
            td.arbitro .arbitro-nombre{font-size:20px;font-weight:bold;line-height:1.1;padding:2px 0;height:90px;display:flex;align-items:center;justify-content:center}
            /* Celdas de puntos por set: MUY altas y anchas para escribir a mano. */
            td.puntos{width:82px}
            td.puntos .puntos-linea{display:flex;align-items:flex-end;justify-content:center;gap:4px;height:90px;padding-bottom:6px}
            td.puntos .puntos-linea .puntos-izq{flex:1;border-bottom:2.5px solid #94a3b8;min-width:18px;height:60px}
            td.puntos .puntos-linea .puntos-separador{font-weight:bold;color:#475569;font-size:18px;padding:0 3px}
            td.puntos .puntos-linea .puntos-der{flex:1;border-bottom:2.5px solid #94a3b8;min-width:18px;height:60px}
            /* Total: bordes más gruesos porque se llena con el tanteo agregado. */
            td.total{width:110px;background:#f8fafc}
            td.total .puntos-linea .puntos-izq,td.total .puntos-linea .puntos-der{border-bottom:3.5px solid #0f172a;height:60px}
            .pie-nota{font-size:14px;color:#475569;margin-top:24px;text-align:right;font-style:italic;padding:0 6px}
            .pie-nota b{color:#0f172a}
            .pie-espacio{height:1in}
            @media print{body{padding:0}}
        </style></head><body>${paginas}<script>window.onload=()=>window.print()<\/script></body></html>`)
        ventana.document.close()
    }

    // ── Agrupamos los cruces de la previsualización por grupo ──
    // Importante: este `useMemo` debe ejecutarse siempre, antes del early
    // return de más abajo, para no romper el orden de hooks entre renders.
    const crucesPorGrupo = useMemo(() => {
        if (!modalGeneracion) return [] as { grupoId: number; cruces: CruceDisponible[] }[]
        const grupos = new Map<number, CruceDisponible[]>()
        for (const cruce of modalGeneracion.cruces) {
            const arr = grupos.get(cruce.grupo_id) || []
            arr.push(cruce)
            grupos.set(cruce.grupo_id, arr)
        }
        return [...grupos.entries()].map(([grupoId, cruces]) => ({ grupoId, cruces }))
    }, [modalGeneracion])

    // Mapa jugadorId → nombre de equipo: dice DE QUÉ EQUIPO es cada árbitro
    // en la hoja de partidos. Se busca entre los miembros de todos los
    // participantes cargados.
    const equipoDeJugador = useMemo(() => {
        const mapa = new Map<number, string>()
        for (const p of partidos) {
            const registrar = (part: Participante | null) => {
                // Cruces «por definir»: aún no tienen participante asignado.
                if (!part) return
                part.miembros?.forEach(m => mapa.set(m.jugador_id, nombreParticipante(part)))
                if (part.jugadores) mapa.set(part.jugadores.id, nombreParticipante(part))
            }
            registrar(p.participante_local)
            registrar(p.participante_visitante)
        }
        return mapa
    }, [partidos])

    /** Abre el diálogo de IMPRESIÓN de la hoja de partidos de UN
     *  encuentro desde la tarjeta del grupo, sin pasar por el wizard.
     *  La alineación se lee de los detalles guardados (convención
     *  LOCAL = ABC); si no hay alineación, guía al operador a
     *  configurarla primero. */
    const imprimirHojaDePartido = (partidoId: number) => {
        const partido = partidos.find(p => p.id === partidoId)
        if (!torneo || !partido) return
        if (!(torneo.modalidad === 'DOBLES' || torneo.modalidad === 'EQUIPOS' || torneo.modalidad === 'ATTA_TEAMS')) return
        const modalidadWizard = torneo.modalidad === 'DOBLES' ? ('DOBLES' as const) : ('EQUIPOS' as const)
        const alineacion = alineacionDesdeDetalles(partido.detalles, modalidadWizard)
        if (!alineacion) {
            toast.error('Este encuentro no tiene alineación guardada — entra a «Alineación» para configurarla')
            return
        }
        const ok = imprimirHojaPartidos({
            torneoNombre: torneo.nombre,
            categoria: categorias.find(c => c.id.toString() === categoriaId)?.nombre || '',
            modalidad: modalidadWizard,
            encuentroOrden: partido.orden,
            nombreEquipoAbc: nombreParticipante(partido.participante_local),
            nombreEquipoXyz: nombreParticipante(partido.participante_visitante),
            alineacion,
            arbitro: partido.arbitro
                ? { nombre: partido.arbitro.nombre, equipo: equipoDeJugador.get(partido.arbitro.id) ?? null }
                : null,
        })
        if (ok) toast.success('Hoja enviada a impresión')
        else toast.error('El navegador bloqueó la ventana de impresión — permite las ventanas emergentes para este sitio')
    }

    if (!isOpen || !torneo) return null

    const numeroBorradores = Object.keys(borradores).length

    return (
        <>
            <Modal
                isOpen={isOpen}
                onClose={intentarCerrarPartidos}
                title="Partidos de grupos"
                description={torneo.nombre}
                size="full"
                navegacionInferior={<NavegacionModales activo="partidos" onNavegar={onNavegar} />}
            >
                <div className="-mx-5 -mt-5 mb-4 card-flush overflow-hidden">
                    <div className="flex flex-wrap items-end gap-3 p-3 bg-subtle">
                        {!esAbierto && (
                            <Select
                                label="Categoría"
                                value={categoriaId}
                                onChange={e => setCategoriaId(e.target.value)}
                                className="w-full sm:w-56"
                            >
                                {categorias.map(categoria => (
                                    <option key={categoria.id} value={categoria.id}>{categoria.nombre}</option>
                                ))}
                            </Select>
                        )}
                        {esAbierto && (
                            <div className="banner banner-info text-xs flex-1">
                                Torneo abierto: los partidos se arman en <b>primera categoría</b> mezclando a todos los inscritos.
                            </div>
                        )}
                        <Button
                            variant="success"
                            onClick={abrirPrevisualizacionGeneracion}
                            isLoading={generando}
                            leadingIcon={<PlayIcon className="h-4 w-4" />}
                        >
                            {generando ? 'Cargando…' : partidos.length ? 'Regenerar partidos' : 'Generar partidos'}
                        </Button>
                        {/* «Imprimir hojas» (cédulas de partidos) solo tiene
                            sentido en individual/dobles: en equipos la hoja
                            oficial es la de alineaciones. */}
                        {!(torneo?.modalidad === 'EQUIPOS' || torneo?.modalidad === 'ATTA_TEAMS') && (
                            <Button
                                variant="secondary"
                                onClick={imprimir}
                                disabled={partidos.length === 0}
                                leadingIcon={<PrinterIcon className="h-4 w-4" />}
                            >
                                Imprimir hojas
                            </Button>
                        )}
                        {(torneo?.modalidad === 'DOBLES' || torneo?.modalidad === 'EQUIPOS' || torneo?.modalidad === 'ATTA_TEAMS') && (
                            <Button
                                variant="secondary"
                                onClick={() => {
                                    // Hojas de alineación EN BLANCO: imprimimos
                                    // una por cada partido de la fase de grupos
                                    // (2 por partido: una para cada capitán) en
                                    // una sola ventana, para repartir a los
                                    // capitanes ANTES de empezar a jugar.
                                    if (partidos.length === 0) {
                                        toast.error('Genera primero al menos un partido para imprimir la alineación')
                                        return
                                    }
                                    const cat = categorias.find(c => c.id.toString() === categoriaId)?.nombre || ''
                                    const ok = importarEImprimirAlineacionBatch({
                                        torneo: { nombre: torneo.nombre },
                                        categoria: cat,
                                        cantidadPartidos: partidos.length,
                                        modalidad: torneo.modalidad === 'DOBLES' ? ('DOBLES' as const) : ('EQUIPOS' as const),
                                    })
                                    if (!ok) toast.error('El navegador bloqueó la ventana de impresión')
                                }}
                                leadingIcon={<PrinterIcon className="h-4 w-4" />}
                            >
                                Imprimir alineaciones (en blanco)
                            </Button>
                        )}
                        {onOpenLlaves && (
                            <Button
                                variant="primary"
                                onClick={onOpenLlaves}
                                leadingIcon={<TrophyIcon className="h-4 w-4" />}
                            >
                                Ver llaves
                            </Button>
                        )}
                        <Button
                            variant="primary"
                            onClick={guardarBorradores}
                            isLoading={generando}
                            disabled={numeroBorradores === 0}
                            leadingIcon={<CheckBadgeIcon className="h-4 w-4" />}
                        >
                            {`Guardar cambios (${numeroBorradores})`}
                        </Button>
                        {grupoModalId !== null && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setGrupoModalId(null)}
                            >
                                Cerrar partidos del grupo
                            </Button>
                        )}
                        <span className="text-xs text-fg-muted ml-auto">
                            Todos contra todos · al mejor de 5 sets
                        </span>
                    </div>
                </div>

                {/* Guía paso a paso: el flujo completo de carga es manual y
                    siempre visible para que nadie se pierda. Los pasos de
                    alineación solo aplican a modalidades de equipos. */}
                {partidos.length > 0 && (torneo.modalidad === 'DOBLES' || torneo.modalidad === 'EQUIPOS' || torneo.modalidad === 'ATTA_TEAMS') && (
                    <div className="banner banner-info mb-4 text-xs leading-relaxed">
                        <span>
                            <b>Cómo cargar los resultados:</b>{' '}
                            <b>1.</b> Toca un grupo en la tabla → <b>2.</b> Toca un partido y pulsa «Alineación» (quiénes son A, B, C vs X, Y, Z) →{' '}
                            <b>3.</b> Anota los sets → <b>4.</b> «Guardar cambios» aquí arriba →{' '}
                            <b>5.</b> Cuando todos los grupos estén listos, «Ver llaves».
                        </span>
                    </div>
                )}
                {partidos.length > 0 && torneo.modalidad !== 'DOBLES' && torneo.modalidad !== 'EQUIPOS' && torneo.modalidad !== 'ATTA_TEAMS' && (
                    <div className="banner banner-info mb-4 text-xs leading-relaxed">
                        <span>
                            <b>Cómo cargar los resultados:</b>{' '}
                            <b>1.</b> Toca un grupo en la tabla → <b>2.</b> Toca cada partido y anota los sets →{' '}
                            <b>3.</b> «Guardar cambios» aquí arriba → <b>4.</b> Cuando todos los grupos estén listos, «Ver llaves».
                        </span>
                    </div>
                )}

                <div>
                    {!loading && (
                        <TablasClasificacion
                            clasificaciones={clasificaciones}
                            onClickGrupo={(grupoId) => setGrupoModalId(grupoId)}
                            grupoFiltroId={grupoModalId}
                            borradoresPorGrupo={borradoresPorGrupo}
                            onResolverEmpate={(grupoId) => setGrupoResolucionId(grupoId)}
                            clasifican={torneo?.modalidad === 'ATTA_TEAMS' ? 3 : 2}
                        />
                    )}

                    {loading ? (
                        <CargandoPantalla titulo="Cargando partidos" mensajes={['Consultando cruces…', 'Calculando clasificaciones…', 'Casi listo…']} />
                    ) : clasificaciones.length === 0 ? (
                        <div className="text-center py-20">
                            <TrophyIcon className="h-10 w-10 mx-auto text-fg-muted opacity-40" />
                            <h3 className="mt-3 font-semibold text-fg">Aún no hay partidos</h3>
                            <p className="text-sm text-fg-muted mt-1.5">
                                Genera los cruces después de completar los grupos.
                            </p>
                        </div>
                    ) : partidos.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-sm text-fg-muted">
                                Pulsa <b>Generar partidos</b> para crear los cruces. Luego toca una
                                tabla de clasificación para registrar resultados.
                            </p>
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <p className="text-sm text-fg-muted">
                                Toca una tabla de clasificación para ver y registrar los partidos
                                de ese grupo.
                            </p>
                        </div>
                    )}
                </div>
            </Modal>

            {/* Modal por grupo: muestra los partidos de un grupo concreto y
                permite navegar entre grupos con flechas. Al tocar un partido,
                se abre el modal de resultado por encima; al cerrarlo, el
                modal del grupo reaparece automáticamente. */}
            {grupoModalId !== null && partidoResultadoId === null && (() => {
                const indiceGrupo = partidosPorGrupo.findIndex(g => g.id === grupoModalId)
                const grupo = indiceGrupo >= 0 ? partidosPorGrupo[indiceGrupo] : null
                if (!grupo) return null
                return (
                    <PartidosGrupoModal
                        isOpen
                        onClose={() => setGrupoModalId(null)}
                        grupo={grupo}
                        borradores={borradores}
                        indiceGrupo={indiceGrupo}
                        totalGrupos={partidosPorGrupo.length}
                        onPrevGrupo={() => {
                            const anterior = partidosPorGrupo[indiceGrupo - 1]
                            if (anterior) setGrupoModalId(anterior.id)
                        }}
                        onNextGrupo={() => {
                            const siguiente = partidosPorGrupo[indiceGrupo + 1]
                            if (siguiente) setGrupoModalId(siguiente.id)
                        }}
                        onSelectPartido={(partidoId) => {
                            // Abrimos el modal de resultado SIN cerrar el
                            // modal del grupo: al volver del resultado, el
                            // usuario sigue viendo los partidos del mismo
                            // grupo. Recordamos el grupo activo en un ref
                            // para no perder el contexto al remontar.
                            setPartidoResultadoId(partidoId)
                        }}
                        onConfigurarAlineacionPartido={
                            torneo?.modalidad === 'DOBLES' || torneo?.modalidad === 'EQUIPOS' || torneo?.modalidad === 'ATTA_TEAMS'
                                ? (partidoId) => setWizardPartidoId(partidoId)
                                : undefined
                        }
                        onImprimirHojaPartido={
                            torneo?.modalidad === 'DOBLES' || torneo?.modalidad === 'EQUIPOS' || torneo?.modalidad === 'ATTA_TEAMS'
                                ? imprimirHojaDePartido
                                : undefined
                        }
                        onReordenar={async (nuevoOrdenIds) => {
                            if (!torneo || !categoriaId) return false
                            try {
                                const res = await fetch(`/api/torneos/${torneo.id}/partidos/reordenar`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        categoriaId: Number(categoriaId),
                                        grupoId: grupo.id,
                                        orden: nuevoOrdenIds,
                                    }),
                                })
                                if (!res.ok) {
                                    const data = await res.json().catch(() => ({}))
                                    toast.error(data.error || 'No se pudo reordenar')
                                    return false
                                }
                                toast.success('Orden guardado')
                                // Refresca para confirmar el orden desde el backend
                                await cargar(true)
                                return true
                            } catch {
                                toast.error('Error de red al reordenar')
                                return false
                            }
                        }}
                    />
                )
            })()}

            {/* Modal "Registrar resultado" — componente separado para mantener
                el código de sets/al navegacion aislado. */}
            {partidoResultadoId !== null && (
                <PartidosResultadoModal
                    isOpen
                    onClose={() => setPartidoResultadoId(null)}
                    torneo={torneo}
                    partidos={partidos}
                    partidoInicialId={partidoResultadoId}
                    borradores={borradores}
                    onBorradoresChange={setBorradores}
                    onDeshacerLocal={deshacerPartidoLocal}
                    borradoresJuegos={borradoresJuegos}
                    onBorradoresJuegosChange={setBorradoresJuegos}
                    onJuegosEnviados={parcheJuegosEnviados}
                    onPersist={() => {
                        cargar(true)
                    }}
                />
            )}

            {/* Modal "Resolver empate" — permite reordenar manualmente los
                participantes que el sistema no puede desempatar. Solo aparece
                para el grupo con `pendientes_manual`. */}
            {grupoResolucionId !== null && (() => {
                const grupo = clasificaciones.find(g => g.grupoId === grupoResolucionId)
                if (!grupo || !torneo) return null
                return (
                    <ResolverEmpateModal
                        isOpen
                        onClose={() => setGrupoResolucionId(null)}
                        torneoId={torneo.id}
                        grupoId={grupo.grupoId}
                        grupoNumero={grupo.numero_grupo}
                        pendientesIds={grupo.pendientes_manual ?? []}
                        posiciones={grupo.posiciones}
                        onGuardado={() => cargar(true)}
                    />
                )
            })()}

            {/* Modal de previsualización de generación con checkboxes */}
            {modalGeneracion && (
                <Modal
                    isOpen
                    onClose={() => setModalGeneracion(null)}
                    title="Confirmar generación de partidos"
                    description="Desmarca los cruces que no quieras generar en este paso"
                    size="2xl"
                    footer={
                        <>
                            <Button variant="secondary" onClick={() => setModalGeneracion(null)} disabled={generando}>
                                Cancelar
                            </Button>
                            <Button
                                variant="success"
                                onClick={confirmarGeneracion}
                                isLoading={generando}
                                leadingIcon={<PlayIcon className="h-4 w-4" />}
                            >
                                {`Generar seleccionados (${modalGeneracion.seleccionados.size})`}
                            </Button>
                        </>
                    }
                >
                    <div className="mb-3 flex items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={() => toggleTodos(true)}>
                            <CheckIcon className="h-3.5 w-3.5" /> Seleccionar todos
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleTodos(false)}>
                            <ChevronUpDownIcon className="h-3.5 w-3.5" /> Deseleccionar todos
                        </Button>
                    </div>
                    <div className="space-y-4 max-h-[60vh] overflow-y-auto scrollbar-thin">
                        {crucesPorGrupo.map(grupo => (
                            <div key={grupo.grupoId} className="card-flush overflow-hidden">
                                <div className="px-3 py-2 bg-subtle border-b border-line text-xs font-bold text-fg-muted uppercase tracking-wider">
                                    Grupo {grupo.grupoId} · {grupo.cruces.length} cruce{grupo.cruces.length === 1 ? '' : 's'}
                                </div>
                                <ul className="divide-y divide-line">
                                    {grupo.cruces.map(cruce => {
                                        const clave = `${cruce.grupo_id}-${cruce.participante_local_id}-${cruce.participante_visitante_id}`
                                        const checked = modalGeneracion.seleccionados.has(clave)
                                        return (
                                            <li key={clave} className={`flex items-center gap-3 px-3 py-2 ${checked ? '' : 'opacity-60'}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggleCruce(clave)}
                                                    className="h-4 w-4 rounded border-line text-brand focus:ring-brand bg-surface"
                                                />
                                                <span className="flex-1 text-sm text-fg truncate">
                                                    <b className="font-semibold">{cruce.local}</b>
                                                    <span className="text-fg-muted mx-2">vs</span>
                                                    <b className="font-semibold">{cruce.visitante}</b>
                                                </span>
                                            </li>
                                        )
                                    })}
                                </ul>
                            </div>
                        ))}
                    </div>
                </Modal>
            )}

            {/* Wizard ABC/XYZ por GRUPO. Se monta encima del modal de
                partidos cuando el operador hace clic en "Configurar
                alineación" en la cabecera de la clasificación del grupo.
                Al cerrarlo se recarga la lista para reflejar las
                alineaciones guardadas en todos los partidos del grupo. */}
            {/* Wizard de alineación para UN partido del grupo. Cada
                encuentro (pareja) tiene su propia serie ABC/XYZ, así que
                se configura partido por partido desde la lista del grupo. */}
            {wizardPartidoId !== null && torneo && (() => {
                const partido = partidos.find(p => p.id === wizardPartidoId)
                if (!partido || !partido.participante_local || !partido.participante_visitante) return null
                return (
                    <EncuentroEquiposWizardModal
                        isOpen
                        onClose={() => {
                            setWizardPartidoId(null)
                            cargar(true)
                        }}
                        torneo={{ id: torneo.id, nombre: torneo.nombre }}
                        categoria={categorias.find(c => c.id.toString() === categoriaId)?.nombre || ''}
                        grupoId={0}
                        equipos={{
                            local: partido.participante_local as any,
                            visitante: partido.participante_visitante as any,
                        }}
                        partidos={[{
                            id: partido.id,
                            orden: partido.orden,
                            arbitro: partido.arbitro
                                ? {
                                    nombre: partido.arbitro.nombre,
                                    equipo: equipoDeJugador.get(partido.arbitro.id) ?? null,
                                }
                                : null,
                            detalles: partido.detalles.map(d => ({
                                id: d.id,
                                orden: d.orden,
                                tipo: d.tipo,
                                jugadores: d.jugadores.map(j => ({
                                    jugador_id: j.jugador_id,
                                    lado: j.lado,
                                    jugadores: j.jugadores,
                                })),
                            })) as any,
                        }]}
                        modalidad={torneo.modalidad === 'DOBLES' ? 'DOBLES' : 'EQUIPOS'}
                        onGuardado={() => cargar(true)}
                    />
                )
            })()}

            {/* Diálogo de salida con borradores sin enviar (partidos y/o
                juegos de serie). */}
            <ConfirmDialog
                isOpen={salirConBorradores}
                onClose={() => {
                    setSalirConBorradores(false)
                    // Salir sin guardar: los borradores permanecen en esta
                    // pantalla mientras la página siga abierta.
                    onClose()
                }}
                onConfirm={() => { void cerrarGuardandoTodo() }}
                titulo="Borradores sin enviar"
                descripcion={`Hay ${Object.keys(borradores).length + numeroBorradoresJuegos} resultado${(Object.keys(borradores).length + numeroBorradoresJuegos) === 1 ? '' : 's'} en borrador que NO se han guardado en la base de datos.`}
                confirmLabel="Guardar y salir"
                cancelLabel="Salir sin guardar"
                variant="primary"
                busy={cerrandoConEnvio}
            />
        </>
    )
}
