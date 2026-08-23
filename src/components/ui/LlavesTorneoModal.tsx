'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
    CheckBadgeIcon,
    TrophyIcon,
    ArrowDownTrayIcon,
    PrinterIcon,
    ArrowUturnLeftIcon,
    ArrowPathIcon,
    ExclamationTriangleIcon,
    UsersIcon,
} from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EncuentroEquiposWizardModal from '@/components/ui/EncuentroEquiposWizardModal'
import PartidosResultadoModal from '@/components/ui/PartidosResultadoModal'
import NavegacionModales, { DestinoModal } from '@/components/ui/NavegacionModales'
import CargandoPantalla from '@/components/ui/CargandoPantalla'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { categoriasParaSelector, esTorneoAbiertoTotal } from '@/lib/torneo'
import { matchupsEstandar } from '@/lib/torneo/matchups'
import { abrirImpresion, construirDocLlaves, descargarPngDeDoc, prefiereModoOscuro, type RondaLlaveDoc } from '@/lib/documentos-torneo'
import { arrastrarComoTarjeta } from '@/lib/ui/arrastrar-como-tarjeta'
type Club = { id: number; nombre: string }
type Jugador = { nombre: string; clubes?: Club | null }
type Participante = {
    id: number
    nombre_personalizado?: string | null
    jugadores?: Jugador | null
    miembros: { jugadores: Jugador }[]
}
type Partido = {
    id: number
    participante_local_id: number | null
    participante_visitante_id: number | null
    ganador_participante_id: number | null
    ronda_eliminacion: string | null
    posicion_llave: number | null
    sets_local: number
    sets_visitante: number
    estado: string
    /** Avance hacia la siguiente ronda (para detectar huecos que esperan rival). */
    siguiente_partido_id?: number | null
    siguiente_lado?: 'LOCAL' | 'VISITANTE' | null
    participante_local: Participante | null
    participante_visitante: Participante | null
    /** Detalles de sub-partidos (DOBLES/EQUIPOS). Solo presente cuando
     *  se cargó la lista con `?withDetalles=true`. */
    detalles?: Array<{
        id: number
        orden: number
        tipo: 'DOBLES' | 'INDIVIDUAL'
        jugadores: { jugador_id: number; lado: 'LOCAL' | 'VISITANTE'; jugadores: Jugador }[]
    }>
}
type Torneo = {
    id: number
    nombre: string
    modalidad?: string
    abierto?: boolean
    torneo_categorias: { categorias: { id: number; nombre: string } }[]
}

/** Partido completo con sets por juego (GET /partidos/[partidoId]):
 *  es el shape que consume PartidosResultadoModal para la serie. */
type PartidoCompletoSerie = {
    id: number
    orden: number
    estado: string
    sets_local: number
    sets_visitante: number
    fase?: string
    torneo_grupos?: { id: number; numero_grupo: number } | null
    participante_local: Participante
    participante_visitante: Participante
    detalles: Array<{
        id: number
        orden: number
        tipo: 'DOBLES' | 'INDIVIDUAL'
        estado: string
        sets_local: number
        sets_visitante: number
        jugadores: { jugador_id: number; lado: string; jugadores: Jugador & { id: number } }[]
        sets: { numero: number; puntos_local: number; puntos_visitante: number }[]
    }>
}

/** Item del pool esperado. El backend lo calcula en el GET (?withPool=true). */
type PoolItem = {
    grupoId: number
    grupoNumero: number
    posicionEnGrupo: number
    participante: Participante
}

/** Slot en la siembra manual de R1. */
type SiembraSlot = { local: number | null; visitante: number | null }

/**
 * true = el cupo vacío del lado espera al ganador de un partido aún no
 * jugado (NO es pase directo). Solo es bye "real" cuando la fuente del
 * hueco no existe (R1) o ya cerró sin ganador.
 */
const esperaRivalEn = (todos: Partido[], p: Partido, lado: 'LOCAL' | 'VISITANTE') => {
    const pid = lado === 'LOCAL' ? p.participante_local_id : p.participante_visitante_id
    if (pid != null || p.estado === 'FINALIZADO') return false
    const fuente = todos.find(x => x.siguiente_partido_id === p.id && x.siguiente_lado === lado)
    return !!fuente && fuente.estado !== 'FINALIZADO'
}

/** Identifica un slot concreto de un partido de R1. */
type SlotRef = { partidoId: number; lado: 'local' | 'visitante' }

/** Origen de un drag: un slot ya colocado, o un ítem del pool. */
type DragOrigen =
    | { tipo: 'slot'; slot: SlotRef; participanteId: number }
    | { tipo: 'pool'; participanteId: number }

/**
 * Devuelve los clubes a los que pertenece un participante. Individual
 * = un único club. Dobles/Equipos = el conjunto de clubes de sus
 * integrantes (puede repetirse si dos miembros son del mismo club, lo
 * deduplicamos). Si los clubes del dobles son mixtos (más de un club
 * distinto), `clubesEfectivos` devuelve `null` por convención: un dobles
 * mixto NO se considera "del club X" para chocar con nadie (ver
 * `clubesChocan`).
 */
const clubesParticipante = (p: Participante | null | undefined): string[] => {
    if (!p) return []
    const integrantes = p.miembros.length > 0
        ? p.miembros.map(m => m.jugadores)
        : p.jugadores ? [p.jugadores] : []
    const nombres = integrantes
        .map(j => j.clubes?.nombre)
        .filter((n): n is string => !!n)
    return [...new Set(nombres)]
}

/** Para un dobles con clubes mixtos, devolvemos null = "no aplica". */
const clubesEfectivos = (p: Participante | null | undefined): Set<string> | null => {
    const cs = clubesParticipante(p)
    if (cs.length === 0) return new Set()
    if (cs.length > 1) return null // dobles mixto: no aplica
    return new Set(cs)
}

/**
 * Devuelve true si los dos participantes comparten un club efectivo.
 * Dobles mixtos siempre devuelven false (no chocan con nadie).
 */
const clubesChocan = (
    a: Participante | null | undefined,
    b: Participante | null | undefined
): boolean => {
    const ca = clubesEfectivos(a)
    const cb = clubesEfectivos(b)
    if (!ca || !cb) return false
    if (ca.size === 0 || cb.size === 0) return false
    for (const x of ca) if (cb.has(x)) return true
    return false
}

const nombre = (p: Participante | null) =>
    p?.nombre_personalizado
    || p?.miembros.map(m => m.jugadores.nombre).join(' / ')
    || p?.jugadores?.nombre
    || 'BYE'

/**
 * Todas las rondas del bracket ordenadas de la primera a la final. El
 * orden se deduce del tamaño (la primera ronda es la que MÁS partidos
 * tiene), igual que `obtenerPrimeraRonda`. Las rondas futuras vienen con
 * participantes null y se muestran como "Por definir" hasta que la ronda
 * anterior finalice y el ganador avance.
 */
const obtenerRondasOrdenadas = (lista: Partido[]): [string, Partido[]][] => {
    const map = new Map<string, Partido[]>()
    for (const p of lista) {
        const k = p.ronda_eliminacion || 'Ronda'
        if (!map.has(k)) map.set(k, [])
        map.get(k)!.push(p)
    }
    return [...map.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([nombreRonda, juegos]) => [
            nombreRonda,
            juegos.slice().sort((a, b) => (a.posicion_llave ?? 0) - (b.posicion_llave ?? 0)),
        ])
}

// Mapa de rondas con su profundidad visual (mayor = ronda más avanzada).
// Se usa para ordenar columnas y para nombrar cuando hay un único partido
// en la última ronda (Final).
const ORDEN_RONDAS: Record<string, number> = {
    '32avos': 0,
    '16avos': 1,
    Octavos: 2,
    Cuartos: 3,
    Semifinal: 4,
    'Final': 5,
}

const CARD_MIN_H = 64

export default function LlavesTorneoModal({
    isOpen,
    onClose,
    torneo,
    onNavegar,
}: {
    isOpen: boolean
    onClose: () => void
    torneo: Torneo | null
    /** Barra inferior para saltar entre modales del torneo. */
    onNavegar?: (destino: DestinoModal) => void
}) {
    const [categoriaId, setCategoriaId] = useState('')
    const [partidos, setPartidos] = useState<Partido[]>([])
    const [loading, setLoading] = useState(false)
    const [generando, setGenerando] = useState(false)
    const [arrastre, setArrastre] = useState<{ partidoId: number; participanteId: number } | null>(null)
    const [confirmando, setConfirmando] = useState(false)
    const [ganadoresBorrador, setGanadoresBorrador] = useState<Record<number, number>>({})
    const [todasCategorias, setTodasCategorias] = useState<{ id: number; nombre: string }[]>([])
    const [descargando, setDescargando] = useState(false)

    // ── Siembra manual (modo único) ───────────────────────────────────────
    /**
     * Estado único: el modo manual de siembra es EL modo. Al abrir el
     * modal, si no hay bracket todavía, se genera automáticamente con
     * todos los slots en null (vacio=true) para que el usuario solo
     * tenga que arrastrar los clasificados a las posiciones del bracket.
     */
    const [pool, setPool] = useState<PoolItem[]>([])
    // Caché de datos por "categoría-nivel" (ATTA Teams): al abrir el modal
    // se precargan las tres llaves en paralelo y el cambio de pestaña pinta
    // al instante desde esta caché sin volver a golpear la BD. Va en un ref
    // (no estado) para que invalidar + recargar sea síncrono: con useState,
    // cargar() veía la entrada aún viva y pintaba datos rancios.
    const cacheNiveles = useRef<Record<string, { partidos: Partido[]; pool: PoolItem[] }>>({})
    /** Siembra de R1: idPartido → { local, visitante }. Solo se mantiene para partidos de R1. */
    const [siembra, setSiembra] = useState<Record<number, SiembraSlot>>({})
    /** Si el usuario movió algo desde la siembra inicial. */
    const [hasChangesSiembra, setHasChangesSiembra] = useState(false)
    const [isSavingSiembra, setIsSavingSiembra] = useState(false)
    const [isDeletingLlaves, setIsDeletingLlaves] = useState(false)
    const [isRegeneratingSiembra, setIsRegeneratingSiembra] = useState(false)
    /** Drag activo: slot que se está arrastrando (origen) o participante del pool. */
    const [draggingSiembra, setDraggingSiembra] = useState<DragOrigen | null>(null)
    /** Slot sobre el que se está hovering como drop target. */
    const [dragOverSiembra, setDragOverSiembra] = useState<SlotRef | null>(null)
    /** Pool está siendo hovered como drop target. */
    const [dragOverPool, setDragOverPool] = useState(false)
    /** Menú contextual por clic (alternativa accesible al drag). */
    const [menuSiembra, setMenuSiembra] = useState<{ slot: SlotRef; participanteId: number } | null>(null)

    useEffect(() => {
        let cancelado = false
        fetch('/api/categorias')
            .then(r => r.ok ? r.json() : [])
            .then(data => { if (!cancelado) setTodasCategorias(Array.isArray(data) ? data : []) })
            .catch(() => { /* silencioso */ })
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
    // ATTA Teams: tres llaves paralelas salen de cada grupo. El usuario
    // alterna entre ellas con estas pestañas; cada una se carga, siembra
    // y confirma por separado.
    const esAttaTeams = torneo?.modalidad === 'ATTA_TEAMS'
    const [nivel, setNivel] = useState<1 | 2 | 3>(1)
    const nivelRef = useRef<1 | 2 | 3>(1)
    useEffect(() => { nivelRef.current = nivel }, [nivel])

    /** Series por equipos: los partidos de llave se alinean y juegan
     *  juego a juego (mismo flujo que la fase de grupos). */
    const esSerieEquipos = torneo?.modalidad === 'EQUIPOS' || torneo?.modalidad === 'ATTA_TEAMS'
    const [wizardAlineacionId, setWizardAlineacionId] = useState<number | null>(null)
    const [serieAbierta, setSerieAbierta] = useState<PartidoCompletoSerie | null>(null)
    const [borradoresSerie, setBorradoresSerie] = useState<Record<number, { sets: { local: number; visitante: number }[] }>>({})
    const [cargandoSerie, setCargandoSerie] = useState(false)
    /** Caché de series completas precargadas por cruce. La BD remota cobra
     *  un round-trip por consulta; traer todo al abrir el nivel y servir
     *  desde memoria hace que «Resultado» sea instantáneo. Se vacía entera
     *  en cada mutación (alineación guardada, serie cerrada/deshecha). */
    const cacheSeries = useRef<Map<number, PartidoCompletoSerie>>(new Map())
    /** Fetches en vuelo, para no duplicar pedidos del mismo cruce. */
    const seriesEnVuelo = useRef<Map<number, Promise<PartidoCompletoSerie | null>>>(new Map())

    /** Descarga (o deduplica) la serie completa de un cruce y la cachea. */
    const traerSerie = useCallback((partidoId: number): Promise<PartidoCompletoSerie | null> => {
        if (!torneo) return Promise.resolve(null)
        const existente = seriesEnVuelo.current.get(partidoId)
        if (existente) return existente
        const promesa = (async () => {
            try {
                const r = await fetch(`/api/torneos/${torneo.id}/partidos/${partidoId}`)
                const d = await r.json()
                if (!r.ok) throw new Error(d.error || 'No se pudo cargar la serie')
                cacheSeries.current.set(partidoId, d.partido)
                return d.partido as PartidoCompletoSerie
            } catch {
                return null
            } finally {
                seriesEnVuelo.current.delete(partidoId)
            }
        })()
        seriesEnVuelo.current.set(partidoId, promesa)
        return promesa
    }, [torneo])

    /** Precarga todas las series con juegos ya creados. Fire-and-forget. */
    const precargarSeries = useCallback((lista: Partido[]) => {
        for (const p of lista) {
            if ((p.detalles?.length ?? 0) > 0 && !cacheSeries.current.has(p.id)) void traerSerie(p.id)
        }
    }, [traerSerie])

    /** Vacía la caché de series: obligatorio tras cualquier escritura
     *  (alineación, sets, deshacer) para no mostrar datos viejos. */
    const invalidarSeries = () => {
        cacheSeries.current.clear()
        seriesEnVuelo.current.clear()
    }

    /** Abre el modal de serie: sirve de caché si está precargada; si no,
     *  descarga con indicador visible. */
    const abrirResultadoLlave = async (partidoId: number) => {
        const cacheada = cacheSeries.current.get(partidoId)
        if (cacheada) {
            setBorradoresSerie({})
            setSerieAbierta(cacheada)
            return
        }
        setCargandoSerie(true)
        try {
            const p = await traerSerie(partidoId)
            if (!p) throw new Error('No se pudo cargar la serie')
            setBorradoresSerie({})
            setSerieAbierta(p)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al cargar la serie')
        } finally {
            setCargandoSerie(false)
        }
    }

    /** Abre el wizard ABC/XYZ para UN partido de llave. Antes asegura
     *  (idempotente, POST /alineacion) que el cruce tenga sus 5 juegos:
     *  los brackets creados antes de las series por equipos no los tenían,
     *  y sin ellos el wizard armaría un payload vacío y no guardaría nada.
     *  La respuesta parchea el estado local para que el wizard reciba los
     *  detalles al instante, sin esperar la recarga completa. */
    const abrirAlineacionLlave = async (partidoId: number) => {
        if (!torneo) return
        try {
            const r = await fetch(`/api/torneos/${torneo.id}/partidos/${partidoId}/alineacion`, { method: 'POST' })
            const d = await r.json()
            if (!r.ok) throw new Error(d.error || 'No se pudo preparar la serie')
            // La alineación cambia los jugadores de cada juego: cualquier
            // serie cacheada de este cruce quedó vieja.
            invalidarSeries()
            const lista = partidos.map(p => p.id === partidoId ? {
                ...p,
                detalles: (d.detalles as Array<{ id: number; orden: number; tipo: string; jugadores: Array<{ jugador_id: number; lado: string; jugadores: { id: number; nombre: string } }> }>).map(det => ({
                    id: det.id,
                    orden: det.orden,
                    tipo: det.tipo as 'DOBLES' | 'INDIVIDUAL',
                    jugadores: det.jugadores.map(j => ({
                        jugador_id: j.jugador_id,
                        lado: j.lado as 'LOCAL' | 'VISITANTE',
                        jugadores: { id: j.jugadores.id, nombre: j.jugadores.nombre },
                    })),
                })),
            } : p)
            setPartidos(lista)
            espejarCachePartidos(lista)
            setWizardAlineacionId(partidoId)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al preparar la alineación')
        }
    }

    /** Clave de caché: los datos son por categoría Y por nivel de llave. */
    const claveCache = (n: number) => `${categoriaId}:${n}`

    /** Descarta la copia cacheada de un nivel (tras una mutación local). */
    const invalidarCache = (n: number) => {
        delete cacheNiveles.current[claveCache(n)]
    }

    /** Busca los datos completos de un participante en lo ya cargado. */
    const resolverParticipante = (id: number | null | undefined): Participante | null => {
        if (!id) return null
        for (const p of partidos) {
            if (p.participante_local?.id === id) return p.participante_local
            if (p.participante_visitante?.id === id) return p.participante_visitante
        }
        return pool.find(i => i.participante.id === id)?.participante ?? null
    }

    /** Espeja la lista de partidos dentro de la caché del nivel activo. */
    const espejarCachePartidos = (lista: Partido[]) => {
        const clave = claveCache(nivelRef.current)
        const c = cacheNiveles.current[clave]
        if (c) cacheNiveles.current[clave] = { ...c, partidos: lista }
    }

    /** Optimista: refleja asignaciones de R1 en estado y caché al instante. */
    const aplicarSiembraLocal = (asignaciones: { id: number; localId: number | null; visitanteId: number | null }[]) => {
        setPartidos(prev => {
            const nuevos = prev.map(p => {
                const a = asignaciones.find(x => x.id === p.id)
                if (!a) return p
                return {
                    ...p,
                    participante_local_id: a.localId,
                    participante_visitante_id: a.visitanteId,
                    participante_local: resolverParticipante(a.localId),
                    participante_visitante: resolverParticipante(a.visitanteId),
                }
            })
            espejarCachePartidos(nuevos)
            return nuevos
        })
    }

    /** Optimista: marca el ganador confirmado y lo avanza al cruce siguiente. */
    const aplicarGanadorLocal = (partidoId: number, ganadorId: number) => {
        setPartidos(prev => {
            const avances: { id: number; lado: 'LOCAL' | 'VISITANTE' }[] = []
            const nuevos = prev.map(p => {
                if (p.id === partidoId) {
                    if (p.siguiente_partido_id && p.siguiente_lado) avances.push({ id: p.siguiente_partido_id, lado: p.siguiente_lado })
                    return { ...p, ganador_participante_id: ganadorId, estado: 'FINALIZADO' as const }
                }
                return p
            })
            const conAvance = avances.length > 0 ? nuevos.map(p => {
                const av = avances.find(a => a.id === p.id)
                if (!av) return p
                const part = resolverParticipante(ganadorId)
                return av.lado === 'LOCAL'
                    ? { ...p, participante_local_id: ganadorId, participante_local: part }
                    : { ...p, participante_visitante_id: ganadorId, participante_visitante: part }
            }) : nuevos
            espejarCachePartidos(conAvance)
            return conAvance
        })
    }

    useEffect(() => {
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

    // Helper: la primera ronda es la que tiene más partidos.
    const obtenerPrimeraRonda = (lista: Partido[]): Partido[] => {
        if (lista.length === 0) return []
        const counts = new Map<string, number>()
        for (const p of lista) {
            const k = p.ronda_eliminacion || 'Ronda'
            counts.set(k, (counts.get(k) || 0) + 1)
        }
        let mejor: string | null = null
        let max = 0
        for (const [k, v] of counts.entries()) {
            if (v > max) { max = v; mejor = k }
        }
        return mejor ? lista.filter(p => (p.ronda_eliminacion || 'Ronda') === mejor) : []
    }

    const generarLlavesVacias = async (nivelObjetivo: 1 | 2 | 3, silencioso = false): Promise<boolean> => {
        if (!torneo || !categoriaId) return false
        if (!silencioso) setGenerando(true)
        try {
            const r = await fetch(`/api/torneos/${torneo.id}/llaves`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    categoriaId: Number(categoriaId),
                    clasificanPorGrupo: esAttaTeams ? 3 : 2,
                    vacio: true,
                    ...(esAttaTeams ? { nivel: nivelObjetivo } : {})
                }),
            })
            const d = await r.json()
            if (!r.ok) throw new Error(d.error)
            return true
        } catch (e) {
            if (!silencioso) toast.error(e instanceof Error ? e.message : 'Error al crear el bracket')
            return false
        } finally {
            if (!silencioso) setGenerando(false)
        }
    }

    /** Pinta los datos recibidos y deriva la siembra de la primera ronda. */
    const aplicarDatos = (datos: { partidos: Partido[]; pool: PoolItem[] }) => {
        setPartidos(datos.partidos)
        setPool(datos.pool)
        // Sembrar el state desde BD: solo los partidos de R1.
        const primeraRonda = obtenerPrimeraRonda(datos.partidos)
        const nuevaSiembra: Record<number, SiembraSlot> = {}
        for (const p of primeraRonda) {
            nuevaSiembra[p.id] = {
                local: p.participante_local_id,
                visitante: p.participante_visitante_id
            }
        }
        setSiembra(nuevaSiembra)
        setHasChangesSiembra(false)
        // Torneos por equipos: precarga en segundo plano la serie completa
        // de cada cruce que ya tenga juegos, para que «Resultado» abra al
        // instante (cada GET cuesta varios round-trips a una BD remota).
        if (esSerieEquipos) void precargarSeries(datos.partidos)
    }

    /** GET de llaves (crea el bracket vacío si aún no existe). */
    const pedirDatos = async (n: 1 | 2 | 3, silencioso: boolean): Promise<{ partidos: Partido[]; pool: PoolItem[] } | null> => {
        // Pedimos también `detalles` para poder mostrar el botón
        // "ABC/XYZ" en partidos de llave DOBLES/EQUIPOS.
        const sufijoNivel = esAttaTeams ? `&nivel=${n}` : ''
        let r = await fetch(`/api/torneos/${torneo!.id}/llaves?categoriaId=${categoriaId}&withPool=true&withDetalles=true${sufijoNivel}`)
        let d = await r.json()
        if (!r.ok) throw new Error(d.error)
        // Si todavía no hay bracket para esta categoría, lo creamos
        // vacío de forma transparente. Así el usuario abre el modal y
        // ya ve el bracket listo para sembrar, sin un paso previo
        // de "Generar llaves".
        if ((d.partidos || []).length === 0) {
            const ok = await generarLlavesVacias(n, silencioso)
            if (!ok) return null
            r = await fetch(`/api/torneos/${torneo!.id}/llaves?categoriaId=${categoriaId}&withPool=true&withDetalles=true${sufijoNivel}`)
            d = await r.json()
            if (!r.ok) throw new Error(d.error)
        }
        return { partidos: d.partidos || [], pool: d.pool || [] }
    }

    const cargar = async (destino?: 1 | 2 | 3, fondo = false) => {
        if (!torneo || !categoriaId) return
        const n = destino ?? nivel
        // Modo silencioso: precarga de niveles distintos al activo; no toca
        // spinners ni estado visible, solo llena la caché.
        const silencioso = (destino !== undefined && n !== nivelRef.current) || fondo

        // Caché lista: cambio de pestaña instantáneo, sin red. En modo fondo
        // SIEMPRE vamos a la BD (reconciliación post-guardado).
        const cacheado = !fondo && esAttaTeams ? cacheNiveles.current[claveCache(n)] : undefined
        if (cacheado) {
            if (!silencioso) aplicarDatos(cacheado)
            return
        }

        if (!silencioso) setLoading(true)
        try {
            const datos = await pedirDatos(n, silencioso)
            if (datos) {
                cacheNiveles.current[claveCache(n)] = datos
                // Si el usuario cambió de pestaña mientras volaban los
                // requests, no pintemos datos de otra llave.
                if (!silencioso || n === nivelRef.current) aplicarDatos(datos)
            } else if (!silencioso) {
                setPartidos([]); setPool([]); setSiembra({})
            }
        } catch (e) {
            if (!silencioso) toast.error(e instanceof Error ? e.message : 'No se pudieron cargar las llaves')
        } finally {
            if (!silencioso) setLoading(false)
        }
    }

    // Carga (o crea y carga) el bracket al abrir el modal o cambiar de
    // categoría. Si todavía no hay bracket, `cargar` lo genera vacío
    // internamente para que el usuario siempre vea el bracket listo
    // para sembrar, sin necesidad de un paso "Generar" previo.
    useEffect(() => {
        if (isOpen && categoriaId) cargar()
        // cargar es estable por convención; las dependencias son isOpen,
        // categoriaId y nivel (ATTA Teams). Con la caché por nivel, cambiar
        // de pestaña pinta al instante sin reconsultar.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, categoriaId, nivel])

    // Precarga en paralelo los niveles que falten (ATTA Teams) para que
    // cambiar de pestaña no espere a la BD. Se lanza al abrir o cambiar de
    // categoría; no depende de `nivel` a propósito.
    useEffect(() => {
        if (!isOpen || !categoriaId || !esAttaTeams) return
        for (const n of [1, 2, 3] as const) {
            if (!cacheNiveles.current[claveCache(n)]) cargar(n)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, categoriaId, esAttaTeams])

    // ── Lógica del modo manual de siembra ─────────────────────────────────

    /** Pool con los IDs actualmente en slots (excluye los del pool "libre"). */
    const idsEnSiembra = useMemo(() => {
        const s = new Set<number>()
        for (const slots of Object.values(siembra)) {
            if (slots.local !== null) s.add(slots.local)
            if (slots.visitante !== null) s.add(slots.visitante)
        }
        return s
    }, [siembra])

    const poolLibre = useMemo(
        () => pool.filter(item => !idsEnSiembra.has(item.participante.id)),
        [pool, idsEnSiembra]
    )

    /** Indica si el bracket tiene al menos un partido finalizado (no se puede entrar a manual). */
    const tieneFinalizados = useMemo(
        () => partidos.some(p => p.estado === 'FINALIZADO'),
        [partidos]
    )

    /** ¿Todos los slots de R1 están llenos? (BYE = null, no es "lleno"; debe haber un participante). */
    const siembraCompleta = useMemo(() => {
        if (pool.length === 0) return false
        const valores = Object.values(siembra)
        if (valores.length === 0) return false
        // Con pases directos NO exigimos llenar toda la capacidad: basta
        // con que TODOS los clasificados estén colocados. Los cupos que
        // sobran (capacidad − clasificados) quedan como byes intencionales
        // que el backend resuelve al guardar la siembra.
        const asignados = valores.reduce(
            (acc, s) => acc + (s.local !== null ? 1 : 0) + (s.visitante !== null ? 1 : 0),
            0
        )
        return asignados >= pool.length
    }, [siembra, pool])

    /** Hay partidos de R1 aún PENDIENTES con cupos vacíos: al guardar la
     * siembra esos huecos se confirman como pases directos (walkover). */
    const hayHuecosPorConfirmar = useMemo(() =>
        obtenerPrimeraRonda(partidos).some(p =>
            p.estado === 'PENDIENTE' &&
            ((siembra[p.id]?.local ?? null) === null || (siembra[p.id]?.visitante ?? null) === null)
        ),
    [partidos, siembra])

    /** Validación post-operación: ningún partido tiene al mismo participante en ambos lados. */
    const validarSinDuplicados = (estado: Record<number, SiembraSlot>): { ok: boolean; partidoId?: number } => {
        for (const [partidoIdStr, slots] of Object.entries(estado)) {
            if (slots.local !== null && slots.local === slots.visitante) {
                return { ok: false, partidoId: Number(partidoIdStr) }
            }
        }
        return { ok: true }
    }

    /**
     * Aplica un movimiento. Devuelve el nuevo estado o null si la
     * operación fue rechazada (con el motivo en `motivo`).
     */
    const aplicarMovimiento = (
        origen: DragOrigen,
        destino: SlotRef
    ): Record<number, SiembraSlot> | null => {
        // No mover al mismo slot
        if (origen.tipo === 'slot' && origen.slot.partidoId === destino.partidoId && origen.slot.lado === destino.lado) {
            return null
        }
        const participanteId = origen.participanteId
        const nuevo: Record<number, SiembraSlot> = {}
        for (const [k, v] of Object.entries(siembra)) nuevo[Number(k)] = { ...v }

        const destinoSlots = nuevo[destino.partidoId]
        if (!destinoSlots) return null

        // Si el destino está vacío: mover directo (sea desde pool o desde slot)
        if (destinoSlots[destino.lado] === null) {
            // Liberar el origen si es un slot
            if (origen.tipo === 'slot') {
                const oSlots = nuevo[origen.slot.partidoId]
                if (oSlots) oSlots[origen.slot.lado] = null
            }
            destinoSlots[destino.lado] = participanteId
        } else {
            // Destino ocupado: swap
            const idEnDestino = destinoSlots[destino.lado] as number
            if (origen.tipo === 'slot') {
                // Swap entre dos slots: el origen se vacía y el destino recibe al del origen
                const oSlots = nuevo[origen.slot.partidoId]
                if (oSlots) oSlots[origen.slot.lado] = idEnDestino
                destinoSlots[destino.lado] = participanteId
            } else {
                // Origen desde pool sobre slot ocupado: rechazamos (no pisamos).
                // El usuario debe devolver al pool primero.
                return null
            }
        }
        // Validar que ningún partido quede con el mismo participante en ambos lados
        const validacion = validarSinDuplicados(nuevo)
        if (!validacion.ok) return null
        return nuevo
    }

    const handleDropOnSlot = (destino: SlotRef) => {
        if (!draggingSiembra) return
        const nuevo = aplicarMovimiento(draggingSiembra, destino)
        if (!nuevo) {
            toast.error('Movimiento rechazado: un partido no puede tener el mismo jugador en ambos lados')
        } else {
            setSiembra(nuevo)
            setHasChangesSiembra(true)
        }
        setDraggingSiembra(null)
        setDragOverSiembra(null)
    }

    const handleDropOnPool = () => {
        if (!draggingSiembra || draggingSiembra.tipo !== 'slot') {
            setDraggingSiembra(null)
            return
        }
        // Devolver el participante del slot al pool: vaciar ese slot.
        const nuevo: Record<number, SiembraSlot> = {}
        for (const [k, v] of Object.entries(siembra)) nuevo[Number(k)] = { ...v }
        const slots = nuevo[draggingSiembra.slot.partidoId]
        if (slots) slots[draggingSiembra.slot.lado] = null
        setSiembra(nuevo)
        setHasChangesSiembra(true)
        setDraggingSiembra(null)
        setDragOverPool(false)
    }

    const handleDevolverAlPool = (slot: SlotRef) => {
        const nuevo: Record<number, SiembraSlot> = {}
        for (const [k, v] of Object.entries(siembra)) nuevo[Number(k)] = { ...v }
        const slots = nuevo[slot.partidoId]
        if (slots) slots[slot.lado] = null
        setSiembra(nuevo)
        setHasChangesSiembra(true)
        setMenuSiembra(null)
    }

    const handleSwapPorClic = (origen: SlotRef, destino: SlotRef) => {
        const participanteId = siembra[origen.partidoId]?.[origen.lado]
        if (participanteId === null || participanteId === undefined) return
        const nuevo = aplicarMovimiento(
            { tipo: 'slot', slot: origen, participanteId },
            destino
        )
        if (!nuevo) {
            toast.error('Movimiento rechazado: un partido no puede tener el mismo jugador en ambos lados')
        } else {
            setSiembra(nuevo)
            setHasChangesSiembra(true)
        }
        setMenuSiembra(null)
    }

    const handleGuardarSiembra = async () => {
        if (!torneo || !categoriaId) return
        if (!siembraCompleta) {
            toast.error('Falta por colocar clasificados: revisa el pool antes de guardar')
            return
        }
        setIsSavingSiembra(true)
        try {
            const partidosPayload = Object.entries(siembra).map(([partidoId, slots]) => ({
                id: Number(partidoId),
                participante_local_id: slots.local,
                participante_visitante_id: slots.visitante
            }))
            // Optimista: pintamos la siembra al instante; la BD reconcilia
            // en segundo plano (el túnel tarda en responder).
            aplicarSiembraLocal(partidosPayload.map(p => ({ id: p.id, localId: p.participante_local_id, visitanteId: p.participante_visitante_id })))
            const r = await fetch(`/api/torneos/${torneo.id}/llaves/reordenar`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    categoriaId: Number(categoriaId),
                    partidos: partidosPayload,
                    ...(esAttaTeams ? { nivel } : {})
                })
            })
            const d = await r.json()
            if (!r.ok) throw new Error(d.error)
            toast.success('Siembra guardada')
            cargar(undefined, true)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al guardar la siembra')
        } finally {
            setIsSavingSiembra(false)
        }
    }

    /** Confirmación ESTILO APP pendiente (reemplaza a los confirm nativos):
     *  'eliminar' = borrar bracket · 'regenerar' = resembrar R1. */
    const [confirmacion, setConfirmacion] = useState<null | 'eliminar' | 'regenerar'>(null)

    const handleEliminarLlaves = async () => {
        if (!torneo || !categoriaId) return
        setIsDeletingLlaves(true)
        try {
            const r = await fetch(`/api/torneos/${torneo.id}/llaves/reordenar?categoriaId=${categoriaId}${esAttaTeams ? `&nivel=${nivel}` : ''}`, {
                method: 'DELETE'
            })
            const d = await r.json()
            if (!r.ok) throw new Error(d.error)
            toast.success('Bracket eliminado')
            // Optimista: limpiamos al instante. SIN refetch: pedirDatos
            // recrearía el bracket vacío automáticamente.
            invalidarCache(nivel)
            setPartidos([]); setPool([]); setSiembra({}); setHasChangesSiembra(false)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al eliminar las llaves')
        } finally {
            setIsDeletingLlaves(false)
        }
    }

    // Regenera la siembra de R1 desde el orden canónico del pool
    // (mismo orden que usa POST /llaves al armar el bracket). El pool ya
    // viene ordenado por standings del grupo, así que basta con asignarlo
    // en pares: pool[0]→P0 local, pool[1]→P0 visitante, pool[2]→P1 local…
    // Si el cupo de R1 no encaja exactamente con el pool (por BYEs o
    // desbalances) se completan los huecos sobrantes con null (BYE).
    const handleRegenerarSiembra = async () => {
        if (!torneo || !categoriaId) return
        setIsRegeneratingSiembra(true)
        try {
            const primeraRonda = obtenerPrimeraRonda(partidos)
            // Reparte los pases directos UNIFORMEMENTE entre los cruces
            // (uno por partido cuando alcanza) para que ningún cruce quede
            // doblemente vacío: cada bye acompaña a un rival real.
            const capacidad = primeraRonda.length * 2
            const huecos = Math.max(0, capacidad - pool.length)
            const posicionesHueco = new Set<number>()
            for (let i = 0; i < huecos; i++) {
                posicionesHueco.add(Math.min(capacidad - 1, Math.round(((i + 0.5) * capacidad) / huecos)))
            }
            const nuevaSiembra: Record<number, SiembraSlot> = {}
            let cursor = 0
            for (let i = 0; i < primeraRonda.length; i++) {
                const idxLocal = 2 * i
                const idxVisitante = 2 * i + 1
                nuevaSiembra[primeraRonda[i].id] = {
                    local: posicionesHueco.has(idxLocal) ? null : pool[cursor++]?.participante?.id ?? null,
                    visitante: posicionesHueco.has(idxVisitante) ? null : pool[cursor++]?.participante?.id ?? null,
                }
            }
            const payloadPartidos = primeraRonda.map(p => ({
                id: p.id,
                participante_local_id: nuevaSiembra[p.id]?.local ?? null,
                participante_visitante_id: nuevaSiembra[p.id]?.visitante ?? null,
            }))
            // Optimista: pintamos la nueva siembra al instante.
            setSiembra(nuevaSiembra)
            setHasChangesSiembra(false)
            aplicarSiembraLocal(payloadPartidos.map(p => ({ id: p.id, localId: p.participante_local_id, visitanteId: p.participante_visitante_id })))
            const r = await fetch(`/api/torneos/${torneo.id}/llaves/reordenar`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    categoriaId: Number(categoriaId),
                    partidos: payloadPartidos,
                    ...(esAttaTeams ? { nivel } : {})
                }),
            })
            const d = await r.json()
            if (!r.ok) throw new Error(d.error)
            toast.success('Siembra regenerada')
            cargar(undefined, true)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al regenerar la siembra')
        } finally {
            setIsRegeneratingSiembra(false)
        }
    }

    const nombreParticipanteSiembra = (p: Participante | null | undefined) =>
        p?.nombre_personalizado
        || p?.miembros?.map(m => m.jugadores.nombre).join(' / ')
        || p?.jugadores?.nombre
        || 'Participante'

    /**
     * Clubes a mostrar bajo el nombre de cada participante en el pool y
     * en los slots. Para dobles mixtos, mostramos "Club A / Club B" para
     * no perder información. Para un único club, mostramos solo el
     * nombre.
     */
    const clubParticipanteSiembra = (p: Participante | null | undefined): string | null => {
        const cs = clubesParticipante(p)
        if (cs.length === 0) return null
        if (cs.length === 1) return cs[0]
        return cs.join(' / ')
    }

    const confirmarTodo = async () => {
        if (!torneo || Object.keys(ganadoresBorrador).length === 0) return
        setConfirmando(true)
        try {
            const pendientes = Object.entries(ganadoresBorrador).filter(([partidoId]) => {
                const p = partidos.find(x => x.id === Number(partidoId))
                return p && p.estado !== 'FINALIZADO'
            })
            for (const [partidoId, ganadorParticipanteId] of pendientes) {
                const r = await fetch(`/api/torneos/${torneo.id}/llaves/${partidoId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ganadorParticipanteId }),
                })
                const d = await r.json()
                if (!r.ok) throw new Error(d.error)
                // Optimista: ganador pintado y avanzado a la siguiente ronda
                // sin esperar el refetch completo.
                aplicarGanadorLocal(Number(partidoId), ganadorParticipanteId)
            }
            setGanadoresBorrador({})
            if (pendientes.length > 0) {
                toast.success('Llave confirmada y ranking actualizado')
            } else {
                toast.success('Nada nuevo que guardar')
            }
            cargar(undefined, true)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo confirmar la llave')
        } finally {
            setConfirmando(false)
        }
    }

    const rondas = useMemo(() => {
        const m = new Map<string, Partido[]>()
        partidos.forEach(p => {
            const k = p.ronda_eliminacion || 'Ronda'
            m.set(k, [...(m.get(k) || []), p])
        })
        return [...m.entries()].sort(([a], [b]) => (ORDEN_RONDAS[a] ?? 99) - (ORDEN_RONDAS[b] ?? 99))
    }, [partidos])

    /**
     * Mapa idParticipante → Participante. Lo usamos en el modo manual
     * para resolver el nombre de los participantes asignados a slots
     * (los slots guardan IDs, no los datos completos). Se construye a
     * partir de los partidos cargados: los `participante_local` y
     * `participante_visitante` ya vienen con el include.
     */
    const participantesById = useMemo(() => {
        const m = new Map<number, Participante>()
        for (const p of partidos) {
            if (p.participante_local) m.set(p.participante_local.id, p.participante_local)
            if (p.participante_visitante) m.set(p.participante_visitante.id, p.participante_visitante)
        }
        // También los del pool (pueden no estar en partidos si nunca se
        // jugaron pero aparecen en la clasificación de grupos).
        for (const item of pool) {
            if (!m.has(item.participante.id)) m.set(item.participante.id, item.participante)
        }
        return m
    }, [partidos, pool])

    /**
     * Mapa participanteId → true si está asignado a un partido de R1
     * donde su rival directo es del mismo club. Se muestra como una
     * advertencia visual (icono + borde warning) en el pool y en el
     * slot. NO bloquea el guardado: si el usuario prefiere ignorar la
     * sugerencia, puede hacerlo.
     */
    const conflictoPorParticipanteSiembra = useMemo(() => {
        const m = new Map<number, boolean>()
        for (const slots of Object.values(siembra)) {
            if (slots.local === null || slots.visitante === null) continue
            const a = participantesById.get(slots.local)
            const b = participantesById.get(slots.visitante)
            if (clubesChocan(a, b)) {
                m.set(slots.local, true)
                m.set(slots.visitante, true)
            }
        }
        return m
    }, [siembra, participantesById])

    /**
     * Construye las rondas del documento (impresión/PNG) desde los datos
     * de los partidos. El orden de rondas se deduce del tamaño: la primera
     * ronda es la que MÁS partidos tiene (misma convención que
     * obtenerPrimeraRonda), y de ahí hacia la final.
     */
    const construirRondasDoc = (): RondaLlaveDoc[] => {
        const rondasMap = new Map<string, typeof partidos>()
        for (const p of partidos) {
            const k = p.ronda_eliminacion || 'Ronda'
            if (!rondasMap.has(k)) rondasMap.set(k, [])
            rondasMap.get(k)!.push(p)
        }
        return [...rondasMap.entries()]
            .sort((a, b) => b[1].length - a[1].length)
            .map(([nombre, lista]) => ({
                nombre,
                partidos: lista
                    .slice()
                    .sort((a, b) => (a.posicion_llave ?? 0) - (b.posicion_llave ?? 0))
                    .map(p => ({
                        localNombre: p.participante_local ? nombreParticipanteSiembra(p.participante_local) : null,
                        localClub: p.participante_local ? clubParticipanteSiembra(p.participante_local) : null,
                        visitanteNombre: p.participante_visitante ? nombreParticipanteSiembra(p.participante_visitante) : null,
                        visitanteClub: p.participante_visitante ? clubParticipanteSiembra(p.participante_visitante) : null,
                        localEsperando: esperaRivalEn(partidos, p, 'LOCAL'),
                        visitanteEsperando: esperaRivalEn(partidos, p, 'VISITANTE'),
                        finalizado: p.estado === 'FINALIZADO',
                        ganaLocal: p.ganador_participante_id == null || !p.participante_local
                            ? null
                            : p.ganador_participante_id === p.participante_local.id,
                    })),
            }))
    }

    const construirDoc = (oscuro: boolean) => {
        if (!torneo) return null
        const cat = categorias.find(c => c.id.toString() === categoriaId)?.nombre ?? ''
        const etiquetaNivel = esAttaTeams
            ? (nivel === 1 ? 'Primera categoría (1º)' : nivel === 2 ? 'Segunda categoría (2º)' : 'Tercera categoría (3º)')
            : null
        return construirDocLlaves({
            torneoNombre: torneo.nombre,
            // En ATTA Teams la etiqueta de nivel YA es la categoría
            // (Primera/Segunda/Tercera); mostrar además "Categoría X"
            // (categoría interna del torneo abierto) solo confunde.
            categoriaNombre: esAttaTeams ? '' : cat,
            etiquetaNivel,
            rondas: construirRondasDoc(),
            oscuro,
        })
    }

    const handleDescargar = async () => {
        // El "screenshot" sale con el modo de la compu: oscuro si la app/sistema
        // está en oscuro, claro en caso contrario.
        const oscuro = prefiereModoOscuro()
        const doc = construirDoc(oscuro)
        if (!doc) return
        setDescargando(true)
        try {
            // Ancho fijo: el doc va en mitades espejadas (como la página):
            // ~255px por columna + 250px de la final al centro. Así el PNG
            // incluye TODAS las rondas aunque en pantalla el bracket se
            // desplace horizontalmente (móvil).
            const cantidadRondas = new Set(partidos.map(p => p.ronda_eliminacion || 'Ronda')).size
            const ancho = Math.max(900, cantidadRondas * 255 + 420)
            // En ATTA Teams los tres brackets comparten la categoría interna
            // ("primera"); el nombre del archivo distingue por nivel.
            const sufijoArchivo = esAttaTeams
                ? `-${nivel === 1 ? 'primera' : nivel === 2 ? 'segunda' : 'tercera'}-categoria`
                : `-${categorias.find(c => c.id.toString() === categoriaId)?.nombre ?? categoriaId}`
            await descargarPngDeDoc(doc, ancho, `llaves-${torneo?.nombre}${sufijoArchivo}.png`, oscuro ? '#0B1120' : '#ffffff')
            toast.success('Imagen descargada')
        } catch (error) {
            console.error('Error al descargar:', error)
            toast.error('Error al generar la imagen')
        } finally {
            setDescargando(false)
        }
    }

    const handleImprimir = () => {
        // Papel: siempre versión clara.
        const doc = construirDoc(false)
        if (!doc) return
        if (!abrirImpresion(doc)) toast.error('Permite ventanas emergentes para imprimir')
    }

    /** Hojas de alineación para las llaves: una página por encuentro con
     *  ambos equipos ya definidos. A diferencia de los grupos, aquí NO se
     *  configura la alineación en el sistema: se imprime la serie ATTA
     *  (1 dobles + 4 individuales, o el dobles único) en blanco y son los
     *  capitanes quienes anotan a mano qué jugador ocupa cada letra. */
    const handleImprimirHojasAlineacion = () => {
        if (!torneo) return
        const escapar = (t: unknown) => String(t)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

        const modalidadSerie = torneo.modalidad === 'DOBLES' ? 'DOBLES' : 'EQUIPOS'
        const matchups = matchupsEstandar(modalidadSerie)
        const categoriaNombre = categorias.find(c => c.id.toString() === categoriaId)?.nombre ?? ''

        const encuentros = partidos.filter(p => p.participante_local && p.participante_visitante)
        if (encuentros.length === 0) {
            toast.error('No hay encuentros con ambos equipos definidos todavía')
            return
        }

        const paginas = encuentros.map(partido => {
            const local = partido.participante_local
            const visitante = partido.participante_visitante
            if (!local || !visitante) return ''
            const miembrosLocal = (local.miembros ?? []).map(m => m.jugadores.nombre)
            const miembrosVisit = (visitante.miembros ?? []).map(m => m.jugadores.nombre)

            const filas = matchups.map((m, i) => {
                const letrasLoc = Array.isArray(m.cruces.local) ? m.cruces.local.join('+') : m.cruces.local
                const letrasVis = Array.isArray(m.cruces.visitante) ? m.cruces.visitante.join('+') : m.cruces.visitante
                const lineas = m.tipo === 'DOBLES' ? 2 : 1
                const celdaNombres = Array.from({ length: lineas }).map(() =>
                    '<div class="nombre-linea"></div>',
                ).join('')
                return `
                <tr>
                  <td class="num">${i + 1}</td>
                  <td class="tipo">${m.tipo === 'DOBLES' ? 'Dobles' : 'Individual'}</td>
                  <td class="cruce"><span class="letra-chip">${escapar(letrasLoc)}</span><span class="vs-sep">vs</span><span class="letra-chip">${escapar(letrasVis)}</span></td>
                  <td class="nombres">${celdaNombres}</td>
                  <td class="nombres">${celdaNombres}</td>
                </tr>`
            }).join('')

            const listaMiembros = (nombres: string[]) => nombres.length > 0
                ? `<ul class="equipo-integrantes">${nombres.map(n => `<li>${escapar(n)}</li>`).join('')}</ul>`
                : ''

            const rondaLabel = escapar(partido.ronda_eliminacion || 'Llaves')

            return `
            <section class="page">
              <header class="cabecera">
                <img class="logo logo-izq" src="/logo.jpg" alt="ATTA" onerror="this.style.visibility='hidden'" />
                <div class="titulo-central">
                  <div class="titulo-torneo">${escapar(torneo.nombre)}</div>
                  <div class="titulo-sub">Hoja de alineación · Llaves · ${rondaLabel} · Encuentro #${partido.posicion_llave ?? '—'}</div>
                </div>
                <img class="logo logo-der" src="/templates/escudo-panama.png" alt="Alcaldía de Panamá" onerror="this.style.visibility='hidden'" />
              </header>

              <div class="enfrentamiento">
                <div class="lado">
                  <div class="lado-tag">LOCAL · ABC</div>
                  <div class="lado-nombre">${escapar(nombreParticipanteSiembra(local))}</div>
                  ${listaMiembros(miembrosLocal)}
                </div>
                <div class="centro-vs">VS</div>
                <div class="lado lado-der">
                  <div class="lado-tag">VISITANTE · XYZ</div>
                  <div class="lado-nombre">${escapar(nombreParticipanteSiembra(visitante))}</div>
                  ${listaMiembros(miembrosVisit)}
                </div>
              </div>

              <table class="serie">
                <thead>
                  <tr>
                    <th class="th-num">N°</th>
                    <th class="th-tipo">Sub-partido</th>
                    <th class="th-cruce">Cruce</th>
                    <th>Jugador(es) del equipo local</th>
                    <th>Jugador(es) del equipo visitante</th>
                  </tr>
                </thead>
                <tbody>${filas}</tbody>
              </table>

              <div class="orden-serie">
                <span class="orden-serie-titulo">Orden de partidos:</span>
                ${matchups.map((m, i) => `<span class="orden-serie-item"><b>${i + 1}</b>${escapar(m.etiqueta)}</span>`).join('')}
              </div>
              <div class="pie-nota">
                El capitán de cada equipo anota el nombre del jugador que ocupa cada letra
                (<span class="mono">A·B·C</span> local, <span class="mono">X·Y·Z</span> visitante)
                y entrega esta hoja al operador antes del inicio del encuentro.
              </div>
              <div class="pie-espacio"></div>
            </section>`
        }).join('')

        const ventana = window.open('', '_blank', 'width=1200,height=1500')
        if (!ventana) { toast.error('El navegador bloqueó la ventana de impresión'); return }
        ventana.document.write(`<!doctype html><html><head><title>Hojas de alineación</title><style>
            @page{size:letter portrait;margin:10mm}
            html,body{width:8.5in;min-height:11in;margin:0;padding:0;box-sizing:border-box}
            body{font-family:Arial,sans-serif;color:#0f172a;margin:0;padding:0}
            .page{page-break-after:always;padding:0}.page:last-child{page-break-after:auto}
            .cabecera{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:6px 8px 12px;border-bottom:2.5px solid #0f172a}
            .logo{height:96px;object-fit:contain}
            .titulo-central{flex:1;text-align:center}
            .titulo-torneo{font-size:36px;font-weight:bold;font-style:italic;letter-spacing:.5px;line-height:1.05}
            .titulo-sub{font-size:15px;color:#475569;margin-top:5px;letter-spacing:1px}
            .enfrentamiento{display:flex;align-items:stretch;gap:14px;margin-top:16px}
            .lado{flex:1;border:2.5px solid #0f172a;border-radius:6px;padding:12px 14px}
            .lado-der{text-align:right}
            .lado-tag{font-size:11px;font-weight:bold;letter-spacing:1.5px;color:#475569}
            .lado-nombre{font-size:26px;font-weight:bold;line-height:1.1;margin-top:3px}
            ul.equipo-integrantes{list-style:none;padding:0;margin:6px 0 0 0;font-size:13px;color:#334155;line-height:1.35}
            ul.equipo-integrantes li:before{content:"· ";color:#94a3b8}
            .centro-vs{display:flex;align-items:center;font-size:30px;font-weight:bold;color:#94a3b8}
            table.serie{width:100%;border-collapse:collapse;margin-top:18px}
            table.serie th,table.serie td{border:2.5px solid #0f172a;padding:14px 12px;font-size:15px;vertical-align:middle}
            table.serie thead th{background:#f1f5f9;text-align:center;font-size:13px;letter-spacing:.5px}
            th.th-num,td.num{width:44px;text-align:center;font-weight:bold;font-size:20px}
            th.th-tipo,td.tipo{width:110px;text-align:center;font-weight:bold}
            th.th-cruce,td.cruce{width:170px;text-align:center}
            .letra-chip{display:inline-block;border:2px solid #0f172a;border-radius:4px;padding:2px 8px;font-family:'Courier New',monospace;font-weight:bold;font-size:17px;background:#f8fafc}
            .vs-sep{margin:0 7px;color:#64748b;font-size:13px;font-weight:normal}
            td.nombres{height:64px}
            td.nombres .nombre-linea{border-bottom:2.5px solid #94a3b8;height:34px;margin:2px 0}
            /* Lista VERTICAL: un renglón por juego, 1 arriba, 5 abajo. */
            .orden-serie{display:block;margin-top:12px;padding:7px 12px;border:1.5px dashed #94a3b8;border-radius:6px;font-size:11.5px;color:#334155}
            .orden-serie-titulo{display:block;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;font-size:10px;color:#0f172a;margin-bottom:2px}
            .orden-serie-item{display:flex;align-items:center;white-space:nowrap;font-weight:600;padding:1px 0}
            .orden-serie-item b{flex:0 0 auto;display:inline-block;background:#f1f5f9;border:1.5px solid #0f172a;border-radius:4px;padding:0 5px;margin-right:6px;font-size:10px;color:#0f172a;min-width:14px;text-align:center}
            .pie-nota{font-size:13px;color:#475569;margin-top:20px;line-height:1.45;padding:0 4px}
            .pie-nota .mono{font-family:'Courier New',monospace;font-weight:bold;color:#0f172a}
            .pie-espacio{height:0.6in}
            @media print{body{padding:0}}
        </style></head><body>${paginas}<script>window.onload=()=>window.print()<\/script></body></html>`)
        ventana.document.close()
    }

    if (!isOpen || !torneo) return null

    const numBorradores = Object.keys(ganadoresBorrador).length
    const hayLlaves = partidos.length > 0

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Llaves de eliminación"
            description="Arrastra ganadores como borrador y confirma una sola vez"
            size="full"
            navegacionInferior={<NavegacionModales activo="llaves" onNavegar={onNavegar} />}
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
                            {categorias.map(c => (
                                <option key={c.id} value={c.id}>{c.nombre}</option>
                            ))}
                        </Select>
                    )}
                    {esAttaTeams && (
                        <div className="flex flex-wrap items-end gap-3 flex-1">
                            <div>
                                <span className="label">Llave</span>
                                <div className="flex rounded-md border border-line overflow-hidden">
                                    {([1, 2, 3] as const).map(n => (
                                        <button
                                            key={n}
                                            type="button"
                                            onClick={() => setNivel(n)}
                                            className={`px-4 py-2 text-sm font-medium transition-colors ${
                                                nivel === n
                                                    ? 'bg-brand text-white'
                                                    : 'text-fg-muted hover:text-fg hover:bg-subtle'
                                            }`}
                                        >
                                            {n === 1 ? '1ª categoría' : n === 2 ? '2ª categoría' : '3ª categoría'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="banner banner-info text-xs flex-1 min-w-[220px]">
                                Cada llave toma una posición de cada grupo: el 1º a <b>Primera categoría</b>, el 2º a <b>Segunda</b> y el 3º a <b>Tercera</b>.
                            </div>
                        </div>
                    )}
                    {esAbierto && !esAttaTeams && (
                        <div className="banner banner-info text-xs flex-1">
                            Torneo abierto: las llaves se arman en <b>primera categoría</b> mezclando a todos los inscritos.
                        </div>
                    )}
                    <Button
                        variant="primary"
                        onClick={handleGuardarSiembra}
                        isLoading={isSavingSiembra}
                        disabled={!siembraCompleta || (!hasChangesSiembra && !hayHuecosPorConfirmar)}
                        leadingIcon={<CheckBadgeIcon className="h-4 w-4" />}
                        title={!siembraCompleta
                            ? 'Coloca a todos los clasificados en los cruces'
                            : (hayHuecosPorConfirmar ? 'Confirma la siembra: los cupos vacíos quedan como pase directo'
                                : (!hasChangesSiembra ? 'Sin cambios por guardar' : 'Guardar siembra'))}
                    >
                        {isSavingSiembra ? 'Guardando...' : 'Guardar siembra'}
                    </Button>
                    {!tieneFinalizados && hayLlaves && (
                        <>
                            <Button
                                variant="secondary"
                                onClick={() => setConfirmacion('regenerar')}
                                isLoading={isRegeneratingSiembra}
                                leadingIcon={<ArrowPathIcon className="h-4 w-4" />}
                                title="Reasignar los slots de R1 desde la clasificación de grupos"
                            >
                                {isRegeneratingSiembra ? 'Regenerando...' : 'Regenerar siembra'}
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => setConfirmacion('eliminar')}
                                isLoading={isDeletingLlaves}
                                leadingIcon={<ArrowUturnLeftIcon className="h-4 w-4" />}
                            >
                                {isDeletingLlaves ? 'Eliminando...' : 'Eliminar llaves'}
                            </Button>
                        </>
                    )}
                    <Button
                        variant="success"
                        onClick={confirmarTodo}
                        isLoading={confirmando}
                        disabled={numBorradores === 0}
                        leadingIcon={<CheckBadgeIcon className="h-4 w-4" />}
                    >
                        {confirmando ? 'Confirmando y actualizando ELO...' : `Confirmar ${numBorradores || ''} resultado(s)`}
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={handleDescargar}
                        isLoading={descargando}
                        disabled={!hayLlaves}
                        leadingIcon={<ArrowDownTrayIcon className="h-4 w-4" />}
                    >
                        {descargando ? 'Descargando...' : 'Imagen'}
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={handleImprimir}
                        disabled={!hayLlaves}
                        leadingIcon={<PrinterIcon className="h-4 w-4" />}
                    >
                        Imprimir
                    </Button>
                    {(torneo.modalidad === 'DOBLES' || torneo.modalidad === 'EQUIPOS' || torneo.modalidad === 'ATTA_TEAMS') && hayLlaves && (
                        <Button
                            variant="secondary"
                            onClick={handleImprimirHojasAlineacion}
                            disabled={!hayLlaves}
                            leadingIcon={<UsersIcon className="h-4 w-4" />}
                            title="Una hoja por encuentro: la serie ATTA en blanco para que los capitanes anoten quién juega cada letra"
                        >
                            Hojas de alineación
                        </Button>
                    )}
                </div>

                {/* Guía de la etapa de llaves: siempre visible. */}
                {hayLlaves && (
                    <div className="banner banner-info text-xs leading-relaxed">
                        <span>
                            <b>Llaves paso a paso:</b>{' '}
                            <b>1.</b> Arrastra los clasificados a los cruces de primera ronda → <b>2.</b> «Guardar siembra» →{' '}
                            <b>3.</b> Imprime las <b>«Hojas de alineación»</b> y entrégalas a los capitanes de cada encuentro →{' '}
                            <b>4.</b> Para cada partido, arrastra al ganador sobre su propia tarjeta → <b>5.</b> «Confirmar resultados»:
                            el ganador avanza solo a la ronda siguiente. Las rondas futuras se llenan solas cuando les toca.
                        </span>
                    </div>
                )}
            </div>

            {confirmando && (
                <div className="banner banner-info mb-4 inline-flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    Guardando partidos, aplicando bonos y avanzando ganadores…
                </div>
            )}

            {cargandoSerie && (
                <div className="banner banner-info mb-4 inline-flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    Abriendo la serie del cruce…
                </div>
            )}

            {loading ? (
                <CargandoPantalla titulo="Preparando bracket" mensajes={['Consultando llaves…', 'Cargando clasificados…', 'Armando los cruces…']} />
            ) : !hayLlaves ? (
                <div className="py-12 text-center text-fg-muted">
                    {generando
                        ? 'Creando bracket vacío...'
                        : 'No se pudo crear el bracket. Verifica que los grupos estén finalizados.'}
                </div>
            ) : (
                <div className="bg-canvas rounded-xl p-6 overflow-x-auto">
                    <ManualSiembraView
                        partidosR1={obtenerPrimeraRonda(partidos)}
                        siembra={siembra}
                        setSiembra={setSiembra}
                        setHasChangesSiembra={setHasChangesSiembra}
                        pool={pool}
                        idsEnSiembra={idsEnSiembra}
                        draggingSiembra={draggingSiembra}
                        setDraggingSiembra={setDraggingSiembra}
                        dragOverSiembra={dragOverSiembra}
                        setDragOverSiembra={setDragOverSiembra}
                        dragOverPool={dragOverPool}
                        setDragOverPool={setDragOverPool}
                        handleDropOnSlot={handleDropOnSlot}
                        handleDropOnPool={handleDropOnPool}
                        handleDevolverAlPool={handleDevolverAlPool}
                        menuSiembra={menuSiembra}
                        setMenuSiembra={setMenuSiembra}
                        handleSwapPorClic={handleSwapPorClic}
                        nombreParticipante={nombreParticipanteSiembra}
                        clubParticipante={clubParticipanteSiembra}
                        conflictoPorParticipante={conflictoPorParticipanteSiembra}
                        participantesById={participantesById}
                        siembraCompleta={siembraCompleta}
                        rondas={obtenerRondasOrdenadas(partidos)}
                        hasChangesSiembra={hasChangesSiembra}
                        arrastre={arrastre}
                        setArrastre={setArrastre}
                        ganadoresBorrador={ganadoresBorrador}
                        setGanadoresBorrador={setGanadoresBorrador}
                        tieneFinalizados={tieneFinalizados}
                        esSerieEquipos={esSerieEquipos}
                        onAlinearPartido={abrirAlineacionLlave}
                        onResultadoPartido={abrirResultadoLlave}
                        onEditarSiembra={() => setHasChangesSiembra(true)}
                    />
                </div>
            )}
            <ConfirmDialog
                isOpen={confirmacion !== null}
                onClose={() => setConfirmacion(null)}
                onConfirm={() => {
                    const accion = confirmacion
                    setConfirmacion(null)
                    if (accion === 'eliminar') void handleEliminarLlaves()
                    if (accion === 'regenerar') void handleRegenerarSiembra()
                }}
                titulo={confirmacion === 'eliminar' ? 'Eliminar bracket completo' : 'Regenerar siembra'}
                descripcion={confirmacion === 'eliminar'
                    ? 'Se borrará el bracket completo de esta categoría. Esta acción no se puede deshacer.'
                    : 'Se reasignarán los cruces de primera ronda desde la clasificación de grupos. Los cambios manuales se perderán.'}
                confirmLabel={confirmacion === 'eliminar' ? 'Sí, eliminar' : 'Sí, regenerar'}
                variant="danger"
            />
            {/* Wizard ABC/XYZ para UN partido de llave por equipos */}
            {wizardAlineacionId !== null && torneo && (() => {
                const partido = partidos.find(p => p.id === wizardAlineacionId)
                if (!partido || !partido.participante_local || !partido.participante_visitante) return null
                return (
                    <EncuentroEquiposWizardModal
                        isOpen
                        // El refresco lo hace onGuardado (se dispara en todo
                        // camino donde algo cambió); aquí solo cerramos para
                        // no lanzar dos cargas paralelas que saturen red.
                        onClose={() => setWizardAlineacionId(null)}
                        torneo={{ id: torneo.id, nombre: torneo.nombre }}
                        categoria={torneo.torneo_categorias.find(tc => tc.categorias.id === Number(categoriaId))?.categorias.nombre || ''}
                        grupoId={0}
                        equipos={{
                            local: partido.participante_local as never,
                            visitante: partido.participante_visitante as never,
                        }}
                        partidos={[{
                            id: partido.id,
                            orden: 1,
                            arbitro: null,
                            detalles: (partido.detalles || []).map(d => ({
                                id: d.id,
                                orden: d.orden,
                                tipo: d.tipo,
                                jugadores: d.jugadores.map(j => ({
                                    jugador_id: j.jugador_id,
                                    lado: j.lado as 'LOCAL' | 'VISITANTE',
                                    jugadores: { id: 0, nombre: j.jugadores.nombre },
                                })),
                            })) as never,
                        }]}
                        modalidad="EQUIPOS"
                        imprimirAlGuardar={false}
                        onGuardado={() => {
                            invalidarSeries()
                            cargar(undefined, true)
                        }}
                    />
                )
            })()}
            {/* Modal de serie por equipos para UN partido de llave: mismo
                flujo que la fase de grupos (juego a juego hasta 3). */}
            {serieAbierta && torneo && (
                <PartidosResultadoModal
                    isOpen
                    onClose={() => {
                        setSerieAbierta(null)
                        invalidarCache(nivelRef.current)
                        invalidarSeries()
                        cargar(undefined, true)
                    }}
                    torneo={{ id: torneo.id, nombre: torneo.nombre, modalidad: torneo.modalidad === 'EQUIPOS' ? 'EQUIPOS' : 'ATTA_TEAMS' }}
                    partidos={[serieAbierta] as never}
                    partidoInicialId={serieAbierta.id}
                    borradores={borradoresSerie}
                    onBorradoresChange={setBorradoresSerie}
                    onPersist={() => {
                        invalidarCache(nivelRef.current)
                        invalidarSeries()
                        cargar(undefined, true)
                    }}
                />
            )}
        </Modal>
    )
}

// ──────────────────────────────────────────────────────────────────────────────
//  ManualSiembraView
//
//  Vista del modo manual: arriba el pool de clasificados pendientes de
//  asignar, abajo la primera ronda como tarjetas con dos slots arrastrables.
//  El usuario puede:
//   - arrastrar desde el pool a un slot vacío
//   - arrastrar un slot ocupado a otro slot (swap) o al pool (devolver)
//   - clic derecho / clic en un slot ocupado para abrir menú con "Devolver al pool"
//     y lista de otros slots para swap
// ──────────────────────────────────────────────────────────────────────────────

function ManualSiembraView({
    partidosR1,
    siembra,
    setSiembra,
    setHasChangesSiembra,
    pool,
    idsEnSiembra,
    draggingSiembra,
    setDraggingSiembra,
    dragOverSiembra,
    setDragOverSiembra,
    dragOverPool,
    setDragOverPool,
    handleDropOnSlot,
    handleDropOnPool,
    handleDevolverAlPool,
    menuSiembra,
    setMenuSiembra,
    handleSwapPorClic,
    nombreParticipante,
    clubParticipante,
    conflictoPorParticipante,
    participantesById,
    siembraCompleta,
    rondas,
    hasChangesSiembra,
    arrastre,
    setArrastre,
    ganadoresBorrador,
    setGanadoresBorrador,
    tieneFinalizados,
    esSerieEquipos,
    onAlinearPartido,
    onResultadoPartido,
    onEditarSiembra,
}: {
    partidosR1: Partido[]
    siembra: Record<number, SiembraSlot>
    setSiembra: (s: Record<number, SiembraSlot>) => void
    setHasChangesSiembra: (b: boolean) => void
    pool: PoolItem[]
    idsEnSiembra: Set<number>
    draggingSiembra: DragOrigen | null
    setDraggingSiembra: (d: DragOrigen | null) => void
    dragOverSiembra: SlotRef | null
    setDragOverSiembra: (s: SlotRef | null) => void
    dragOverPool: boolean
    setDragOverPool: (b: boolean) => void
    handleDropOnSlot: (destino: SlotRef) => void
    handleDropOnPool: () => void
    handleDevolverAlPool: (slot: SlotRef) => void
    menuSiembra: { slot: SlotRef; participanteId: number } | null
    setMenuSiembra: (m: { slot: SlotRef; participanteId: number } | null) => void
    handleSwapPorClic: (origen: SlotRef, destino: SlotRef) => void
    nombreParticipante: (p: Participante | null | undefined) => string
    clubParticipante: (p: Participante | null | undefined) => string | null
    conflictoPorParticipante: Map<number, boolean>
    participantesById: Map<number, Participante>
    siembraCompleta: boolean
    /** TODAS las rondas del bracket, de la primera a la final. */
    rondas: [string, Partido[]][]
    hasChangesSiembra: boolean
    arrastre: { partidoId: number; participanteId: number } | null
    setArrastre: (a: { partidoId: number; participanteId: number } | null) => void
    ganadoresBorrador: Record<number, number>
    setGanadoresBorrador: React.Dispatch<React.SetStateAction<Record<number, number>>>
    tieneFinalizados: boolean
    /** Torneo por equipos: cada cruce es una serie de 5 juegos. */
    esSerieEquipos?: boolean
    onAlinearPartido?: (partidoId: number) => void
    onResultadoPartido?: (partidoId: number) => void
    onEditarSiembra: () => void
}) {
    // Modo ARMAR: pool + editor de R1 (mientras falten slots o haya cambios
    // sin guardar). Modo JUGAR: bracket completo con todas las rondas — las
    // futuras se ven vacías ("Por definir") y solo se llenan cuando la
    // ronda anterior finaliza y su ganador avanza.
    // Si hay partidos de R1 pendientes con cupos vacíos, seguimos en modo
    // armar: guardar la siembra es lo que confirma esos huecos como byes.
    const hayHuecosPendientes = partidosR1.some(p =>
        p.estado === 'PENDIENTE' &&
        ((siembra[p.id]?.local ?? null) === null || (siembra[p.id]?.visitante ?? null) === null)
    )
    const modoArmado = !siembraCompleta || hasChangesSiembra || hayHuecosPendientes

    if (!modoArmado && rondas.length > 0) {
        return (
            <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-success text-sm font-medium">
                        <CheckBadgeIcon className="h-4 w-4" />
                        Cruces listos · para registrar un resultado, arrastra el ganador sobre su propio partido y pulsa «Confirmar»
                    </span>
                    {!tieneFinalizados && (
                        <button
                            type="button"
                            onClick={onEditarSiembra}
                            className="text-xs font-medium text-brand hover:underline shrink-0"
                        >
                            Editar cruce de primera ronda
                        </button>
                    )}
                </div>
                <BracketLayout
                    rondas={rondas}
                    arrastre={arrastre}
                    setArrastre={setArrastre}
                    ganadoresBorrador={ganadoresBorrador}
                    setGanadoresBorrador={setGanadoresBorrador}
                    esSerieEquipos={esSerieEquipos}
                    onAlinearPartido={onAlinearPartido}
                    onResultadoPartido={onResultadoPartido}
                />
            </div>
        )
    }

    if (partidosR1.length === 0) {
        return <div className="py-12 text-center text-fg-muted">No hay partidos de primera ronda</div>
    }
    const rondaNombre = partidosR1[0].ronda_eliminacion || 'R1'
    const slotsVacios = partidosR1.reduce((acc, p) => {
        const s = siembra[p.id]
        if (!s) return acc + 2
        return acc + (s.local === null ? 1 : 0) + (s.visitante === null ? 1 : 0)
    }, 0)

    // Pool agrupado por grupo: cada grupo es una tarjeta con dos filas
    // (1° y 2° seed). Cada fila es un participante arrastrable. Si el
    // participante ya está sembrado en un slot, la fila sale atenuada
    // indicando que ya está en uso (no se puede arrastrar dos veces).
    const poolPorGrupo = useMemo(() => {
        const m = new Map<number, { grupoNumero: number; items: PoolItem[] }>()
        for (const item of pool) {
            if (!m.has(item.grupoId)) m.set(item.grupoId, { grupoNumero: item.grupoNumero, items: [] })
            m.get(item.grupoId)!.items.push(item)
        }
        // Orden interno por posición (1° antes que 2°)
        for (const v of m.values()) v.items.sort((a, b) => a.posicionEnGrupo - b.posicionEnGrupo)
        return [...m.entries()].sort(([, a], [, b]) => a.grupoNumero - b.grupoNumero)
    }, [pool])

    /**
     * `conflictoPorParticipante` lo recibimos como prop desde el
     * componente padre, que es el dueño de la siembra y de los
     * participantes. Aquí lo reusamos sin recalcular.
     */

    return (
        <div className="flex flex-col gap-4">
            {/* Banner de estado */}
            <div className="flex flex-wrap items-center gap-2 text-sm">
                {siembraCompleta ? (
                    <span className="inline-flex items-center gap-1.5 text-success">
                        <CheckBadgeIcon className="h-4 w-4" />
                        Siembra completa{slotsVacios > 0 ? ` · ${slotsVacios} cupo(s) quedarán como pase directo al guardar` : ''}
                    </span>
                ) : (
                    <span className="banner banner-warning text-xs inline-flex items-center gap-1.5">
                        <ExclamationTriangleIcon className="h-4 w-4" />
                        Faltan {slotsVacios} participante(s) por asignar en {rondaNombre}
                    </span>
                )}
            </div>
            {/* Pool de clasificados agrupado por grupo */}
            <div
                onDragOver={e => { e.preventDefault(); setDragOverPool(true) }}
                onDragLeave={() => setDragOverPool(false)}
                onDrop={e => { e.preventDefault(); handleDropOnPool() }}
                className={`border-2 border-dashed rounded-xl p-4 transition-colors ${dragOverPool ? 'border-brand bg-brand-soft' : 'border-line bg-surface'}`}
            >
                <div className="text-xs font-bold text-fg-muted uppercase tracking-wider mb-2">
                    Clasificados por grupo ({pool.length - idsEnSiembra.size} libres de {pool.length})
                </div>
                {poolPorGrupo.length === 0 ? (
                    <div className="text-sm text-fg-muted py-2">Aún no hay grupos finalizados</div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {poolPorGrupo.map(([grupoId, { grupoNumero, items }]) => (
                            <GrupoPoolCard
                                key={grupoId}
                                grupoNumero={grupoNumero}
                                items={items}
                                idsEnSiembra={idsEnSiembra}
                                participantesById={participantesById}
                                nombreParticipante={nombreParticipante}
                                clubParticipante={clubParticipante}
                                conflictoPorParticipante={conflictoPorParticipante}
                                draggingSiembra={draggingSiembra}
                                setDraggingSiembra={setDraggingSiembra}
                                setDragOverPool={setDragOverPool}
                                setDragOverSiembra={setDragOverSiembra}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Bracket de R1 al estilo del modo auto, pero editable */}
            <div>
                <div className="text-xs font-bold text-fg-muted uppercase tracking-wider mb-2">
                    Primera ronda · {rondaNombre}
                </div>
                <ManualBracketR1
                    partidosR1={partidosR1}
                    siembra={siembra}
                    setSiembra={setSiembra}
                    setHasChangesSiembra={setHasChangesSiembra}
                    participantesById={participantesById}
                    nombreParticipante={nombreParticipante}
                    clubParticipante={clubParticipante}
                    conflictoPorParticipante={conflictoPorParticipante}
                    draggingSiembra={draggingSiembra}
                    setDraggingSiembra={setDraggingSiembra}
                    dragOverSiembra={dragOverSiembra}
                    setDragOverSiembra={setDragOverSiembra}
                    handleDropOnSlot={handleDropOnSlot}
                    menuSiembra={menuSiembra}
                    setMenuSiembra={setMenuSiembra}
                />
            </div>

            {/* Vista completa del bracket: TODAS las rondas visibles desde
                ya. Las futuras se ven vacías ("Por definir") y solo se
                llenan cuando la ronda anterior finalice. Mientras se arma
                la siembra es solo lectura. */}
            {rondas.length > 1 && (
                <div className="border-t border-line pt-4">
                    <div className="text-xs font-bold text-fg-muted uppercase tracking-wider mb-2">
                        Vista completa · todas las rondas (se desbloquean en orden)
                    </div>
                    <BracketLayout
                        rondas={rondas}
                        arrastre={null}
                        setArrastre={() => {}}
                        ganadoresBorrador={{}}
                        setGanadoresBorrador={() => {}}
                        soloLectura
                    />
                </div>
            )}

            {/* Menú contextual por clic en un slot ocupado */}
            {menuSiembra && (() => {
                // Listado de slots disponibles para swap: todos los demás slots
                // ocupados (excluyendo el origen y excluyendo el slot opuesto
                // del mismo partido, para evitar el caso "swap consigo mismo").
                const otrosSlots: SlotRef[] = []
                for (const [partidoIdStr, slots] of Object.entries(siembra)) {
                    const pid = Number(partidoIdStr)
                    if (pid === menuSiembra.slot.partidoId) continue
                    if (slots.local !== null) otrosSlots.push({ partidoId: pid, lado: 'local' })
                    if (slots.visitante !== null) otrosSlots.push({ partidoId: pid, lado: 'visitante' })
                }
                const participante = participantesById.get(menuSiembra.participanteId)
                return (
                    <div
                        className="fixed inset-0 z-50"
                        onClick={() => setMenuSiembra(null)}
                    >
                        <div
                            className="absolute bg-surface border border-line-strong rounded-lg shadow-lg p-2 min-w-[240px] max-w-[320px]"
                            style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="text-xs font-bold text-fg-muted uppercase tracking-wider mb-2 px-2">
                                {participante ? nombreParticipante(participante) : 'Participante'}
                            </div>
                            <button
                                type="button"
                                onClick={() => handleDevolverAlPool(menuSiembra.slot)}
                                className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-subtle flex items-center gap-2"
                            >
                                <ArrowUturnLeftIcon className="h-4 w-4" />
                                Devolver al pool
                            </button>
                            {otrosSlots.length > 0 && (
                                <>
                                    <div className="text-xs font-bold text-fg-muted uppercase tracking-wider mt-2 mb-1 px-2">
                                        Intercambiar con…
                                    </div>
                                    <div className="max-h-48 overflow-y-auto">
                                        {otrosSlots.map(s => {
                                            const p = participantesById.get(
                                                s.partidoId === menuSiembra.slot.partidoId
                                                    ? 0 // nunca llega aquí por el filter de arriba
                                                    : (siembra[s.partidoId]?.[s.lado] ?? 0)
                                            )
                                            return (
                                                <button
                                                    key={`${s.partidoId}-${s.lado}`}
                                                    type="button"
                                                    onClick={() => handleSwapPorClic(menuSiembra.slot, s)}
                                                    className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-subtle flex items-center gap-2"
                                                >
                                                    <span className="text-xs font-mono text-fg-muted">
                                                        P{(() => {
                                                            const pp = partidosR1.find(x => x.id === s.partidoId)
                                                            return pp?.posicion_llave ?? s.partidoId
                                                        })()} · {s.lado}
                                                    </span>
                                                    <span className="truncate">{p ? nombreParticipante(p) : '—'}</span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )
            })()}
        </div>
    )
}

// Tarjeta de grupo en el pool. Muestra los N clasificados del grupo
// (1° y 2° seed) como filas arrastrables. Si un clasificado ya está
// sembrado en un slot, la fila sale atenuada y no es draggable. Si su
// `conflictoClub` es true, se marca con un ícono de advertencia (otro
// integrante del mismo club está en el mismo partido de R1). Esto es
// informativo, NO bloquea el guardado.
function GrupoPoolCard({
    grupoNumero,
    items,
    idsEnSiembra,
    nombreParticipante,
    clubParticipante,
    conflictoPorParticipante,
    setDraggingSiembra,
    setDragOverPool,
    setDragOverSiembra,
}: {
    grupoNumero: number
    items: PoolItem[]
    idsEnSiembra: Set<number>
    participantesById: Map<number, Participante>
    nombreParticipante: (p: Participante | null | undefined) => string
    clubParticipante: (p: Participante | null | undefined) => string | null
    conflictoPorParticipante: Map<number, boolean>
    draggingSiembra: DragOrigen | null
    setDraggingSiembra: (d: DragOrigen | null) => void
    setDragOverPool: (b: boolean) => void
    setDragOverSiembra: (s: SlotRef | null) => void
}) {
    return (
        <div className="bg-surface border border-line rounded-lg overflow-hidden">
            <div className="px-2 py-1.5 bg-subtle text-[10px] font-bold text-fg-muted uppercase tracking-wider text-center">
                Grupo {grupoNumero}
            </div>
            <div className="flex flex-col">
                {items.map(item => {
                    const sembrado = idsEnSiembra.has(item.participante.id)
                    const conflicto = conflictoPorParticipante.get(item.participante.id) === true
                    const club = clubParticipante(item.participante)
                    return (
                        <div
                            key={item.participante.id}
                            draggable={!sembrado}
                            onDragStart={sembrado ? undefined : (e) => { arrastrarComoTarjeta(e); setDraggingSiembra({ tipo: 'pool', participanteId: item.participante.id }) }}
                            onDragEnd={() => { setDraggingSiembra(null); setDragOverPool(false); setDragOverSiembra(null) }}
                            className={`flex items-center gap-2 px-2.5 py-1.5 text-xs border-t border-line first:border-t-0 ${
                                sembrado
                                    ? 'text-fg-muted italic cursor-not-allowed'
                                    : 'text-fg cursor-grab active:cursor-grabbing'
                            }`}
                            title={sembrado
                                ? 'Ya está sembrado en un slot'
                                : (conflicto
                                    ? 'Mismo club que el rival de su partido (preferencia, no error)'
                                    : 'Arrastra a un slot de la llave')}
                        >
                            <span className="text-[10px] font-mono text-fg-muted shrink-0 w-6 text-center">
                                {item.posicionEnGrupo}°
                            </span>
                            <TrophyIcon className={`h-3 w-3 shrink-0 ${item.posicionEnGrupo === 1 ? 'text-warning' : 'text-fg-muted'}`} />
                            <div className="flex flex-col min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="truncate">{nombreParticipante(item.participante)}</span>
                                    {conflicto && (
                                        <ExclamationTriangleIcon
                                            className="h-3.5 w-3.5 text-warning shrink-0"
                                            title="Mismo club que el rival de su partido"
                                        />
                                    )}
                                </div>
                                {club && (
                                    <span className="text-[10px] text-fg-muted truncate">{club}</span>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// Layout del bracket de R1 con la misma estética que el modo auto
// (split upper/lower) pero con slots vacíos que aceptan drop desde el
// pool o swap entre sí. La siembra se hace por `siembra[idPartido]`
// en lugar de leer de los partidos.
function ManualBracketR1({
    partidosR1,
    siembra,
    setSiembra,
    setHasChangesSiembra,
    participantesById,
    nombreParticipante,
    clubParticipante,
    conflictoPorParticipante,
    draggingSiembra,
    setDraggingSiembra,
    dragOverSiembra,
    setDragOverSiembra,
    handleDropOnSlot,
    menuSiembra,
    setMenuSiembra,
}: {
    partidosR1: Partido[]
    siembra: Record<number, SiembraSlot>
    setSiembra: (s: Record<number, SiembraSlot>) => void
    setHasChangesSiembra: (b: boolean) => void
    participantesById: Map<number, Participante>
    nombreParticipante: (p: Participante | null | undefined) => string
    clubParticipante: (p: Participante | null | undefined) => string | null
    conflictoPorParticipante: Map<number, boolean>
    draggingSiembra: DragOrigen | null
    setDraggingSiembra: (d: DragOrigen | null) => void
    dragOverSiembra: SlotRef | null
    setDragOverSiembra: (s: SlotRef | null) => void
    handleDropOnSlot: (destino: SlotRef) => void
    menuSiembra: { slot: SlotRef; participanteId: number } | null
    setMenuSiembra: (m: { slot: SlotRef; participanteId: number } | null) => void
}) {
    const cupo = partidosR1.length * 2
    const limiteUpper = cupo / 4
    const partidosUpper = partidosR1.filter(p => (p.posicion_llave ?? 0) <= limiteUpper)
    const partidosLower = partidosR1.filter(p => (p.posicion_llave ?? 0) > limiteUpper)

    if (cupo <= 2) {
        // Sin split: una sola columna centrada.
        return (
            <div className="flex justify-center">
                <div className="flex flex-col gap-2 min-w-[220px]">
                    {partidosR1.map(p => (
                        <LlaveCardEditable
                            key={p.id}
                            partido={p}
                            slots={siembra[p.id] || { local: null, visitante: null }}
                            participantesById={participantesById}
                            nombreParticipante={nombreParticipante}
                            clubParticipante={clubParticipante}
                            conflictoPorParticipante={conflictoPorParticipante}
                            draggingSiembra={draggingSiembra}
                            setDraggingSiembra={setDraggingSiembra}
                            dragOverSiembra={dragOverSiembra}
                            setDragOverSiembra={setDragOverSiembra}
                            handleDropOnSlot={handleDropOnSlot}
                            menuSiembra={menuSiembra}
                            setMenuSiembra={setMenuSiembra}
                        />
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div className="flex items-stretch justify-center gap-0">
            <div className="flex flex-col justify-around min-w-[220px] px-2">
                {partidosUpper.map(p => (
                    <LlaveCardEditable
                        key={p.id}
                        partido={p}
                        slots={siembra[p.id] || { local: null, visitante: null }}
                        participantesById={participantesById}
                        nombreParticipante={nombreParticipante}
                        clubParticipante={clubParticipante}
                        conflictoPorParticipante={conflictoPorParticipante}
                        draggingSiembra={draggingSiembra}
                        setDraggingSiembra={setDraggingSiembra}
                        dragOverSiembra={dragOverSiembra}
                        setDragOverSiembra={setDragOverSiembra}
                        handleDropOnSlot={handleDropOnSlot}
                        menuSiembra={menuSiembra}
                        setMenuSiembra={setMenuSiembra}
                    />
                ))}
            </div>
            <div className="flex flex-col items-center justify-center min-w-[220px] px-3">
                <h3 className="text-center text-xs font-bold text-fg-muted uppercase tracking-wider mb-3 inline-flex items-center gap-1.5">
                    <TrophyIcon className="h-4 w-4 text-warning" />
                    Final
                </h3>
                <div className="w-full rounded-md border border-dashed border-line bg-subtle/30 h-20 flex items-center justify-center text-[10px] text-fg-muted italic">
                    Se llena automáticamente
                </div>
            </div>
            <div className="flex flex-col justify-around min-w-[220px] px-2">
                {partidosLower.map(p => (
                    <LlaveCardEditable
                        key={p.id}
                        partido={p}
                        slots={siembra[p.id] || { local: null, visitante: null }}
                        participantesById={participantesById}
                        nombreParticipante={nombreParticipante}
                        clubParticipante={clubParticipante}
                        conflictoPorParticipante={conflictoPorParticipante}
                        draggingSiembra={draggingSiembra}
                        setDraggingSiembra={setDraggingSiembra}
                        dragOverSiembra={dragOverSiembra}
                        setDragOverSiembra={setDragOverSiembra}
                        handleDropOnSlot={handleDropOnSlot}
                        menuSiembra={menuSiembra}
                        setMenuSiembra={setMenuSiembra}
                    />
                ))}
            </div>
        </div>
    )
}

// Tarjeta de partido en modo edición. Mismo aspecto que LlaveCard pero
// con dos slots vacíos (placeholder) que aceptan drop. Los slots
// ocupados se pueden arrastrar (swap) o clic para abrir el menú.
function LlaveCardEditable({
    partido,
    slots,
    participantesById,
    nombreParticipante,
    clubParticipante,
    conflictoPorParticipante,
    draggingSiembra,
    setDraggingSiembra,
    dragOverSiembra,
    setDragOverSiembra,
    handleDropOnSlot,
    menuSiembra,
    setMenuSiembra,
}: {
    partido: Partido
    slots: SiembraSlot
    participantesById: Map<number, Participante>
    nombreParticipante: (p: Participante | null | undefined) => string
    clubParticipante: (p: Participante | null | undefined) => string | null
    conflictoPorParticipante: Map<number, boolean>
    draggingSiembra: DragOrigen | null
    setDraggingSiembra: (d: DragOrigen | null) => void
    dragOverSiembra: SlotRef | null
    setDragOverSiembra: (s: SlotRef | null) => void
    handleDropOnSlot: (destino: SlotRef) => void
    menuSiembra: { slot: SlotRef; participanteId: number } | null
    setMenuSiembra: (m: { slot: SlotRef; participanteId: number } | null) => void
}) {
    const slotLocal: SlotRef = { partidoId: partido.id, lado: 'local' }
    const slotVisitante: SlotRef = { partidoId: partido.id, lado: 'visitante' }
    const participanteLocal = slots.local !== null ? participantesById.get(slots.local) : null
    const participanteVisitante = slots.visitante !== null ? participantesById.get(slots.visitante) : null
    const hayConflicto = (slots.local !== null && conflictoPorParticipante.get(slots.local) === true)
        || (slots.visitante !== null && conflictoPorParticipante.get(slots.visitante) === true)

    return (
        <div className={`relative rounded-md border bg-surface shadow-sm min-h-16 ${hayConflicto ? 'border-warning' : 'border-line'}`}>
            <span className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-md ${hayConflicto ? 'bg-warning' : 'bg-line'}`} />
            <div className="flex flex-col justify-center min-h-16 pl-3 pr-2 py-1.5">
                <SlotFila
                    slot={slotLocal}
                    participanteId={slots.local}
                    participante={participanteLocal}
                    nombreParticipante={nombreParticipante}
                    clubParticipante={clubParticipante}
                    conflicto={slots.local !== null && conflictoPorParticipante.get(slots.local) === true}
                    draggingSiembra={draggingSiembra}
                    setDraggingSiembra={setDraggingSiembra}
                    dragOverSiembra={dragOverSiembra}
                    setDragOverSiembra={setDragOverSiembra}
                    handleDropOnSlot={handleDropOnSlot}
                    menuSiembra={menuSiembra}
                    setMenuSiembra={setMenuSiembra}
                />
                <SlotFila
                    slot={slotVisitante}
                    participanteId={slots.visitante}
                    participante={participanteVisitante}
                    nombreParticipante={nombreParticipante}
                    clubParticipante={clubParticipante}
                    conflicto={slots.visitante !== null && conflictoPorParticipante.get(slots.visitante) === true}
                    draggingSiembra={draggingSiembra}
                    setDraggingSiembra={setDraggingSiembra}
                    dragOverSiembra={dragOverSiembra}
                    setDragOverSiembra={setDragOverSiembra}
                    handleDropOnSlot={handleDropOnSlot}
                    menuSiembra={menuSiembra}
                    setMenuSiembra={setMenuSiembra}
                />
            </div>
            <div className="absolute top-0.5 right-1.5 text-[9px] text-fg-muted font-mono">
                #{partido.posicion_llave}
            </div>
        </div>
    )
}

function SlotFila({
    slot,
    participanteId,
    participante,
    nombreParticipante,
    clubParticipante,
    conflicto,
    draggingSiembra,
    setDraggingSiembra,
    dragOverSiembra,
    setDragOverSiembra,
    handleDropOnSlot,
    menuSiembra,
    setMenuSiembra,
}: {
    slot: SlotRef
    participanteId: number | null
    participante: Participante | null | undefined
    nombreParticipante: (p: Participante | null | undefined) => string
    clubParticipante: (p: Participante | null | undefined) => string | null
    conflicto: boolean
    draggingSiembra: DragOrigen | null
    setDraggingSiembra: (d: DragOrigen | null) => void
    dragOverSiembra: SlotRef | null
    setDragOverSiembra: (s: SlotRef | null) => void
    handleDropOnSlot: (destino: SlotRef) => void
    menuSiembra: { slot: SlotRef; participanteId: number } | null
    setMenuSiembra: (m: { slot: SlotRef; participanteId: number } | null) => void
}) {
    const ocupado = participanteId !== null
    const isDragOver = dragOverSiembra?.partidoId === slot.partidoId && dragOverSiembra?.lado === slot.lado
    const club = ocupado ? clubParticipante(participante) : null
    return (
        <div
            onDragOver={e => { e.preventDefault(); setDragOverSiembra(slot) }}
            onDragLeave={() => setDragOverSiembra(null)}
            onDrop={e => { e.preventDefault(); handleDropOnSlot(slot) }}
            onClick={() => {
                if (ocupado) setMenuSiembra({ slot, participanteId: participanteId! })
            }}
            draggable={ocupado}
            onDragStart={ocupado ? (e) => { arrastrarComoTarjeta(e); setDraggingSiembra({ tipo: 'slot', slot, participanteId: participanteId! }) } : undefined}
            onDragEnd={() => { setDraggingSiembra(null); setDragOverSiembra(null) }}
            className={`flex flex-col text-xs leading-tight py-0.5 rounded-sm transition-colors ${
                ocupado
                    ? 'cursor-grab active:cursor-grabbing text-fg'
                    : isDragOver
                        ? 'bg-brand-soft text-fg-muted'
                        : 'text-fg-muted italic'
            } ${isDragOver ? 'bg-brand-soft' : ''}`}
            title={ocupado ? 'Click para más opciones · arrastra para mover' : 'Arrastra un participante del pool aquí'}
        >
            {ocupado ? (
                <>
                    <div className="flex items-center gap-1.5 min-w-0">
                        {conflicto && (
                            <ExclamationTriangleIcon
                                className="h-3.5 w-3.5 text-warning shrink-0"
                                title="Mismo club que el rival de su partido (preferencia, no error)"
                            />
                        )}
                        <span className="truncate">{nombreParticipante(participante)}</span>
                    </div>
                    {club && (
                        <span className="text-[10px] text-fg-muted truncate pl-5">{club}</span>
                    )}
                </>
            ) : (
                <span className="truncate">—</span>
            )}
        </div>
    )
}

// ──────────────────────────────────────────────────────────────────────────────
//  BracketLayout
//
//  Estructura visual del bracket al estilo torneo de tenis:
//
//    ┌──────────┐ ┌──────────┐ ┌──────────┐
//    │  UPPER   │ │  FINAL   │ │  LOWER   │
//    │ (R1..Rn) │ │  (al     │ │ (R1..Rn) │
//    │ izq      │ │  medio)  │ │ der      │
//    └──────────┘ └──────────┘ └──────────┘
//
//  Regla de split: para un bracket con `cupo` participantes (potencia de
//  2), los partidos de la primera ronda con `posicion_llave <= cupo/4`
//  van al upper; el resto al lower. La ronda final (1 partido) se extrae
//  y se renderiza al medio.
//
//  Con cupo=8: R1[1,2] upper · R1[3,4] lower · R2[1,2] mitad c/u · R3[1]
//  y final al medio.
//  Con cupo=4: R1[1] upper · R1[2] lower · final al medio.
//  Con cupo=2: solo final al medio, sin split.
// ──────────────────────────────────────────────────────────────────────────────

function BracketLayout({
    rondas,
    arrastre,
    setArrastre,
    ganadoresBorrador,
    setGanadoresBorrador,
    soloLectura = false,
    esSerieEquipos = false,
    onAlinearPartido,
    onResultadoPartido,
}: {
    rondas: [string, Partido[]][]
    arrastre: { partidoId: number; participanteId: number } | null
    setArrastre: (a: { partidoId: number; participanteId: number } | null) => void
    ganadoresBorrador: Record<number, number>
    setGanadoresBorrador: React.Dispatch<React.SetStateAction<Record<number, number>>>
    /** Preview de solo lectura (mientras se arma la siembra). */
    soloLectura?: boolean
    /** Torneo por equipos: cada cruce es una serie de 5 juegos. */
    esSerieEquipos?: boolean
    onAlinearPartido?: (partidoId: number) => void
    onResultadoPartido?: (partidoId: number) => void
}) {
    if (rondas.length === 0) return null

    // Partidos de la primera ronda y la final (si la última ronda es de 1
    // partido, esa es la final; si no, no hay split posible).
    const primeraRonda = rondas[0]?.[1] ?? []
    const ultimaRonda = rondas[rondas.length - 1]?.[1] ?? []
    const hayFinalSeparada = ultimaRonda.length === 1 && rondas.length > 1
    const finalPartido = hayFinalSeparada ? ultimaRonda[0] : null
    const rondasSinFinal = hayFinalSeparada ? rondas.slice(0, -1) : rondas

    // Todos los partidos del bracket: para detectar cupos vacíos que aún
    // esperan al ganador de otro partido (no son pases directos).
    const partidosTodos = useMemo(() => rondas.flatMap(([, js]) => js), [rondas])

    // Cupo = 2 * (partidos en R1) = total de participantes en el bracket.
    const cupo = primeraRonda.length * 2
    const limiteUpper = cupo / 4 // cantidad de partidos de R1 que van al upper

    // Split: cada partido va al upper si su `posicion_llave <= limiteUpper`,
    // si no al lower. Como la siembra es 0↔1, 2↔3, ..., 4↔5, etc., la
    // condición `posicion_llave <= cupo/4` (1-indexed) es la correcta.
    const upperR1Ids = new Set<number>()
    const lowerR1Ids = new Set<number>()
    primeraRonda.forEach(p => {
        if ((p.posicion_llave ?? 0) <= limiteUpper) upperR1Ids.add(p.id)
        else lowerR1Ids.add(p.id)
    })

    // Las rondas intermedias (R2, R3, ...) se filtran siguiendo la
    // jerarquía del backend: `rondas[r+1][Math.floor(i/2)]`. Para saber a
    // qué mitad pertenece un partido de la ronda r+1, miramos los partidos
    // de la ronda r (R1 ya está) que lo alimentan.
    const mitadPorPartido = useMemo(() => {
        const out = new Map<number, 'upper' | 'lower'>()
        upperR1Ids.forEach(id => out.set(id, 'upper'))
        lowerR1Ids.forEach(id => out.set(id, 'lower'))
        for (let r = 0; r < rondasSinFinal.length - 1; r++) {
            const juegos = rondasSinFinal[r][1]
            for (let i = 0; i < juegos.length; i++) {
                const src = juegos[i]
                const dst = rondasSinFinal[r + 1][1][Math.floor(i / 2)]
                if (!dst) continue
                // Si src está en upper, dst va a upper; si no, a lower.
                if (out.get(src.id) === 'upper') out.set(dst.id, 'upper')
                else if (out.get(src.id) === 'lower') out.set(dst.id, 'lower')
            }
        }
        return out
    }, [upperR1Ids, lowerR1Ids, rondasSinFinal])

    const upperRondas: [string, Partido[]][] = []
    const lowerRondas: [string, Partido[]][] = []
    rondasSinFinal.forEach(([nombre, juegos]) => {
        const u = juegos.filter(p => mitadPorPartido.get(p.id) === 'upper')
        const l = juegos.filter(p => mitadPorPartido.get(p.id) === 'lower')
        if (u.length > 0) upperRondas.push([nombre, u])
        if (l.length > 0) lowerRondas.push([nombre, l])
    })

    // Edge case: cupo = 2 (solo final). No hay split que mostrar; la final
    // ocupa todo el ancho centrada.
    if (cupo <= 2) {
        return (
            <div className="flex justify-center">
                <FinalColumn
                    final={ultimaRonda[0] ?? null}
                    partidosTodos={partidosTodos}
                    arrastre={arrastre}
                    setArrastre={setArrastre}
                    ganadoresBorrador={ganadoresBorrador}
                    setGanadoresBorrador={setGanadoresBorrador}
                    soloLectura={soloLectura}
                    esSerieEquipos={esSerieEquipos}
                    onAlinearPartido={onAlinearPartido}
                    onResultadoPartido={onResultadoPartido}
                />
            </div>
        )
    }

    return (
        <div className="flex items-stretch justify-center gap-0">
            <HalfBracket
                lado="upper"
                rondas={upperRondas}
                partidosTodos={partidosTodos}
                arrastre={arrastre}
                setArrastre={setArrastre}
                ganadoresBorrador={ganadoresBorrador}
                setGanadoresBorrador={setGanadoresBorrador}
                soloLectura={soloLectura}
                esSerieEquipos={esSerieEquipos}
                onAlinearPartido={onAlinearPartido}
                onResultadoPartido={onResultadoPartido}
            />
            <FinalColumn
                final={finalPartido}
                partidosTodos={partidosTodos}
                arrastre={arrastre}
                setArrastre={setArrastre}
                ganadoresBorrador={ganadoresBorrador}
                setGanadoresBorrador={setGanadoresBorrador}
                soloLectura={soloLectura}
                esSerieEquipos={esSerieEquipos}
                onAlinearPartido={onAlinearPartido}
                onResultadoPartido={onResultadoPartido}
            />
            <HalfBracket
                lado="lower"
                rondas={lowerRondas}
                partidosTodos={partidosTodos}
                arrastre={arrastre}
                setArrastre={setArrastre}
                ganadoresBorrador={ganadoresBorrador}
                setGanadoresBorrador={setGanadoresBorrador}
                soloLectura={soloLectura}
                esSerieEquipos={esSerieEquipos}
                onAlinearPartido={onAlinearPartido}
                onResultadoPartido={onResultadoPartido}
            />
        </div>
    )
}

// Una mitad del bracket (upper o lower): se renderiza con las rondas de
// izquierda a derecha, los partidos de la última ronda quedan alineados
// con el centro vertical del contenedor (que coincide con la final).
function HalfBracket({
    lado,
    rondas,
    partidosTodos,
    arrastre,
    setArrastre,
    ganadoresBorrador,
    setGanadoresBorrador,
    soloLectura = false,
    esSerieEquipos = false,
    onAlinearPartido,
    onResultadoPartido,
}: {
    lado: 'upper' | 'lower'
    rondas: [string, Partido[]][]
    /** Lista completa de partidos del bracket (para detectar esperas de rival). */
    partidosTodos: Partido[]
    arrastre: { partidoId: number; participanteId: number } | null
    setArrastre: (a: { partidoId: number; participanteId: number } | null) => void
    ganadoresBorrador: Record<number, number>
    setGanadoresBorrador: React.Dispatch<React.SetStateAction<Record<number, number>>>
    soloLectura?: boolean
    /** Torneo por equipos: cada cruce es una serie de 5 juegos. */
    esSerieEquipos?: boolean
    onAlinearPartido?: (partidoId: number) => void
    onResultadoPartido?: (partidoId: number) => void
}) {
    if (rondas.length === 0) return null
    return (
        <div className={`flex items-stretch ${lado === 'upper' ? 'flex-row' : 'flex-row-reverse'}`}>
            {rondas.map(([ronda, juegos], i) => {
                const esRondaInicial = i === 0
                return (
                    <div key={ronda} className="flex flex-col justify-around min-w-[200px] px-2 py-1">
                        <h3 className="text-center text-[10px] font-bold text-fg-muted uppercase tracking-wider mb-2">
                            {ronda}
                        </h3>
                        <div className="flex flex-col justify-around flex-1 gap-3">
                            {juegos.map(p => (
                                <LlaveCard
                                    key={p.id}
                                    partido={p}
                                    esperaLocal={esperaRivalEn(partidosTodos, p, 'LOCAL')}
                                    esperaVisita={esperaRivalEn(partidosTodos, p, 'VISITANTE')}
                                    arrastre={arrastre}
                                    setArrastre={setArrastre}
                                    ganadorBorrador={ganadoresBorrador[p.id]}
                                    onDropGanador={() => {
                                        if (arrastre?.partidoId === p.id) {
                                            setGanadoresBorrador(prev => ({ ...prev, [p.id]: arrastre.participanteId }))
                                        }
                                        setArrastre(null)
                                    }}
                                    soloLectura={soloLectura}
                                    esSerieEquipos={esSerieEquipos}
                                    onAlinear={onAlinearPartido}
                                    onResultado={onResultadoPartido}
                                />
                            ))}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

// Columna central con la final. Se renderiza con `justify-center` para que
// la tarjeta de la final quede alineada con el centro vertical del
// contenedor padre (que a su vez es la mitad de la altura entre upper y
// lower).
function FinalColumn({
    final,
    partidosTodos,
    arrastre,
    setArrastre,
    ganadoresBorrador,
    setGanadoresBorrador,
    soloLectura = false,
    esSerieEquipos = false,
    onAlinearPartido,
    onResultadoPartido,
}: {
    final: Partido | null
    partidosTodos: Partido[]
    arrastre: { partidoId: number; participanteId: number } | null
    setArrastre: (a: { partidoId: number; participanteId: number } | null) => void
    ganadoresBorrador: Record<number, number>
    setGanadoresBorrador: React.Dispatch<React.SetStateAction<Record<number, number>>>
    soloLectura?: boolean
    /** Torneo por equipos: cada cruce es una serie de 5 juegos. */
    esSerieEquipos?: boolean
    onAlinearPartido?: (partidoId: number) => void
    onResultadoPartido?: (partidoId: number) => void
}) {
    return (
        <div className="flex flex-col items-center justify-center min-w-[220px] px-3">
            <h3 className="text-center text-xs font-bold text-warning uppercase tracking-wider mb-3 inline-flex items-center gap-1.5">
                <TrophyIcon className="h-4 w-4" />
                Final
            </h3>
            {final && (
                <div className="w-full">
                    <LlaveCard
                        partido={final}
                        arrastre={arrastre}
                        setArrastre={setArrastre}
                        ganadorBorrador={ganadoresBorrador[final.id]}
                        destacado
                        esperaLocal={esperaRivalEn(partidosTodos, final, 'LOCAL')}
                        esperaVisita={esperaRivalEn(partidosTodos, final, 'VISITANTE')}
                        onDropGanador={() => {
                            if (arrastre?.partidoId === final.id) {
                                setGanadoresBorrador(prev => ({ ...prev, [final.id]: arrastre.participanteId }))
                            }
                            setArrastre(null)
                        }}
                        soloLectura={soloLectura}
                        esSerieEquipos={esSerieEquipos}
                        onAlinear={onAlinearPartido}
                        onResultado={onResultadoPartido}
                    />
                </div>
            )}
        </div>
    )
}

function LlaveCard({
    partido,
    arrastre,
    setArrastre,
    ganadorBorrador,
    onDropGanador,
    destacado = false,
    soloLectura = false,
    esperaLocal = false,
    esperaVisita = false,
    esSerieEquipos = false,
    onAlinear,
    onResultado,
}: {
    partido: Partido
    arrastre: { partidoId: number; participanteId: number } | null
    setArrastre: (a: { partidoId: number; participanteId: number } | null) => void
    ganadorBorrador?: number
    onDropGanador: () => void
    destacado?: boolean
    /** Preview de solo lectura: sin arrastre ni zona de soltar. */
    soloLectura?: boolean
    /** El cupo vacío de ese lado espera al ganador de otro partido: no se
     *  puede confirmar nada aquí todavía. */
    esperaLocal?: boolean
    esperaVisita?: boolean
    /** Torneo por equipos: el cruce es una serie; se juega juego a juego
     *  con sus propios botones, sin arrastrar ganador. */
    esSerieEquipos?: boolean
    onAlinear?: (partidoId: number) => void
    onResultado?: (partidoId: number) => void
}) {
    // Partido fantasma: ambos lados null. Se finalizó sin ganador durante
    // la propagación de BYE (p.ej. 5 clasificados → cupo 8 deja huecos).
    // No se muestra como partido a jugar.
    const fantasma = !partido.participante_local_id && !partido.participante_visitante_id
    const finalizado = partido.estado === 'FINALIZADO'
    const ganadorId = partido.ganador_participante_id ?? ganadorBorrador
    const campeon = finalizado && ganadorId
        ? (ganadorId === partido.participante_local_id ? partido.participante_local : partido.participante_visitante)
        : null

    if (fantasma) {
        return (
            <div className="rounded-md border border-dashed border-line bg-subtle/30 h-16 flex items-center justify-center text-[10px] text-fg-muted italic">
                Partido {partido.posicion_llave} · sin cruce
            </div>
        )
    }

    const hayLocal = partido.participante_local_id != null
    const hayVisita = partido.participante_visitante_id != null
    // Mientras un hueco espera rival no se puede confirmar ganador: el
    // partido de la ronda previa aún está vivo.
    const bloqueadoPorEspera = esperaLocal || esperaVisita
    // En series por equipos el ganador NO se arrastra: sale de jugar los
    // 5 juegos. Solo se ofrecen los botones Alineación / Resultado.
    const cruceCompleto = hayLocal && hayVisita
    const mostrarAccionesSerie = esSerieEquipos && cruceCompleto && !finalizado && !soloLectura
    // ¿Ya se guardó una alineación para esta serie? Con que un juego tenga
    // jugadores basta: se asignan los 5 juntos.
    const alineacionHecha = (partido.detalles ?? []).some(d => d.jugadores.length > 0)

    return (
        <div
            onDragOver={e => { if (!soloLectura && !bloqueadoPorEspera && !mostrarAccionesSerie) e.preventDefault() }}
            onDrop={() => { if (!soloLectura && !bloqueadoPorEspera && !mostrarAccionesSerie) onDropGanador() }}
            className={`relative rounded-md border bg-surface shadow-sm transition-all min-h-16 ${
                destacado ? 'border-warning shadow-warning/20' :
                finalizado ? 'border-success' :
                ganadorBorrador ? 'border-warning' : 'border-line'
            }`}
        >
            <span
                className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-md ${
                    finalizado ? 'bg-success' : ganadorBorrador ? 'bg-warning' : 'bg-line'
                }`}
            />
            <div className="flex flex-col justify-center min-h-16 pl-3 pr-2 py-1.5">
                {[partido.participante_local, partido.participante_visitante].map((p, i) => {
                    const pid = i === 0 ? partido.participante_local_id : partido.participante_visitante_id
                    const esGanador = ganadorId === pid && pid != null
                    const espera = i === 0 ? esperaLocal : esperaVisita
                    // Cupo vacío: si aún puede llegar alguien es "Por definir";
                    // si su fuente ya cerró (o no existe) es pase directo.
                    const etiquetaVacio = espera ? 'Por definir' : 'BYE'
                    return (
                        <div
                            key={i}
                            draggable={!finalizado && !!pid && !soloLectura && !bloqueadoPorEspera && !mostrarAccionesSerie}
                            onDragStart={(e) => { if (!soloLectura && !bloqueadoPorEspera && !mostrarAccionesSerie && pid) { arrastrarComoTarjeta(e); setArrastre({ partidoId: partido.id, participanteId: pid }) } }}
                            className={`flex items-center gap-1.5 text-xs leading-tight truncate py-0.5 ${
                                !soloLectura && !mostrarAccionesSerie ? 'cursor-grab' : ''
                            } ${esGanador ? 'font-bold text-success' : 'text-fg'}`}
                            title={nombre(p)}
                        >
                            {esGanador && (
                                <CheckBadgeIcon className="h-3.5 w-3.5 text-success shrink-0" />
                            )}
                            {pid == null
                                ? <span className="italic text-fg-muted font-semibold tracking-wide">{etiquetaVacio}</span>
                                : <span className="truncate">{nombre(p)}</span>}
                        </div>
                    )
                })}
            </div>
            <div className="absolute top-0.5 right-1.5 text-[9px] text-fg-muted font-mono">
                #{partido.posicion_llave}
            </div>
            {!finalizado && !soloLectura && bloqueadoPorEspera && (
                <div className="mx-2 mb-2 p-1 text-center text-[10px] italic text-fg-muted">
                    Esperando rival…
                </div>
            )}
            {!finalizado && !soloLectura && !bloqueadoPorEspera && !mostrarAccionesSerie && (
                <div className={`mx-2 mb-2 p-1 text-center text-[10px] font-bold rounded border border-dashed ${
                    ganadorBorrador
                        ? 'text-warning border-warning bg-warning-soft/40'
                        : 'text-fg-muted border-line-strong'
                }`}>
                    {ganadorBorrador ? 'Borrador' : 'Suelta ganador aquí'}
                </div>
            )}
            {mostrarAccionesSerie && (
                <div className="mx-2 mb-2 flex gap-1">
                    <button
                        type="button"
                        onClick={() => onAlinear?.(partido.id)}
                        title="Configurar quién juega cada posición (ABC vs XYZ)"
                        className={`flex-1 px-1 py-1 text-[10px] font-bold rounded border transition-colors ${
                            alineacionHecha
                                ? 'border-success/50 text-success bg-success-soft/40 hover:bg-success-soft'
                                : 'border-line-strong text-fg-muted hover:text-fg hover:bg-subtle'
                        }`}
                    >
                        {alineacionHecha ? 'Alineado ✓' : 'Alineación'}
                    </button>
                    <button
                        type="button"
                        onClick={() => onResultado?.(partido.id)}
                        disabled={partido.detalles?.length === 0}
                        title={partido.detalles?.length === 0
                            ? 'Guarda la alineación primero para crear los juegos de la serie'
                            : 'Registrar los juegos de la serie (al mejor de 5)'}
                        className="flex-1 px-1 py-1 text-[10px] font-bold rounded border border-brand/40 text-brand hover:bg-brand/10 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                        Resultado
                    </button>
                </div>
            )}
            {campeon && (
                <div className="px-2 py-1.5 bg-warning-soft text-warning text-center text-[11px] font-bold inline-flex items-center justify-center gap-1 w-full rounded-b-md">
                    <TrophyIcon className="h-3.5 w-3.5" />
                    {nombre(campeon)}
                </div>
            )}
        </div>
    )
}
