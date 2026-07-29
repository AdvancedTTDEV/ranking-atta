'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
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
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { categoriasParaSelector, esTorneoAbiertoTotal } from '@/lib/torneo'
import EncuentroEquiposWizardModal from '@/components/ui/EncuentroEquiposWizardModal'

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

/** Item del pool esperado. El backend lo calcula en el GET (?withPool=true). */
type PoolItem = {
    grupoId: number
    grupoNumero: number
    posicionEnGrupo: number
    participante: Participante
}

/** Slot en la siembra manual de R1. */
type SiembraSlot = { local: number | null; visitante: number | null }

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
}: {
    isOpen: boolean
    onClose: () => void
    torneo: Torneo | null
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
    const llavesRef = useRef<HTMLDivElement | null>(null)

    // ── Siembra manual (modo único) ───────────────────────────────────────
    /**
     * Estado único: el modo manual de siembra es EL modo. Al abrir el
     * modal, si no hay bracket todavía, se genera automáticamente con
     * todos los slots en null (vacio=true) para que el usuario solo
     * tenga que arrastrar los clasificados a las posiciones del bracket.
     */
    const [pool, setPool] = useState<PoolItem[]>([])
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
    /** Wizard de alineación abierto para un partido de llave (DOBLES/EQUIPOS). */
    const [wizardPartidoId, setWizardPartidoId] = useState<number | null>(null)

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

    const generarLlavesVacias = async (): Promise<boolean> => {
        if (!torneo || !categoriaId) return false
        setGenerando(true)
        try {
            const r = await fetch(`/api/torneos/${torneo.id}/llaves`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoriaId: Number(categoriaId), clasificanPorGrupo: 2, vacio: true }),
            })
            const d = await r.json()
            if (!r.ok) throw new Error(d.error)
            return true
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al crear el bracket')
            return false
        } finally {
            setGenerando(false)
        }
    }

    const cargar = async () => {
        if (!torneo || !categoriaId) return
        setLoading(true)
        try {
            // Pedimos también `detalles` para poder mostrar el botón
            // "ABC/XYZ" en partidos de llave DOBLES/EQUIPOS.
            let r = await fetch(`/api/torneos/${torneo.id}/llaves?categoriaId=${categoriaId}&withPool=true&withDetalles=true`)
            let d = await r.json()
            if (!r.ok) throw new Error(d.error)
            // Si todavía no hay bracket para esta categoría, lo creamos
            // vacío de forma transparente. Así el usuario abre el modal y
            // ya ve el bracket listo para sembrar, sin un paso previo
            // de "Generar llaves".
            if ((d.partidos || []).length === 0) {
                const ok = await generarLlavesVacias()
                if (!ok) {
                    setPartidos([]); setPool([]); setSiembra({}); return
                }
                r = await fetch(`/api/torneos/${torneo.id}/llaves?categoriaId=${categoriaId}&withPool=true&withDetalles=true`)
                d = await r.json()
                if (!r.ok) throw new Error(d.error)
            }
            setPartidos(d.partidos || [])
            setPool(d.pool || [])
            // Sembrar el state desde BD: solo los partidos de R1.
            const primeraRonda = obtenerPrimeraRonda(d.partidos || [])
            const nuevaSiembra: Record<number, SiembraSlot> = {}
            for (const p of primeraRonda) {
                nuevaSiembra[p.id] = {
                    local: p.participante_local_id,
                    visitante: p.participante_visitante_id
                }
            }
            setSiembra(nuevaSiembra)
            setHasChangesSiembra(false)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudieron cargar las llaves')
        } finally {
            setLoading(false)
        }
    }

    // Carga (o crea y carga) el bracket al abrir el modal o cambiar de
    // categoría. Si todavía no hay bracket, `cargar` lo genera vacío
    // internamente para que el usuario siempre vea el bracket listo
    // para sembrar, sin necesidad de un paso "Generar" previo.
    useEffect(() => {
        if (isOpen && categoriaId) cargar()
        // cargar es estable por convención; las dependencias son isOpen y
        // categoriaId. Recargar en cada cambio de categoría es la forma
        // más simple de mantener pool + siembra sincronizados.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, categoriaId])

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
    // Partido seleccionado por el wizard. Construye el "pseudo-grupo" de un
    // solo partido para `EncuentroEquiposWizardModal`, que internamente hace
    // un PUT por partido (en este caso, un único PUT).
    // Debe ir ANTES de cualquier early return para cumplir las Rules of Hooks.
    const partidoDelWizard = useMemo(() => {
        if (wizardPartidoId == null) return null
        return partidos.find(p => p.id === wizardPartidoId) ?? null
    }, [wizardPartidoId, partidos])

    const siembraCompleta = useMemo(() => {
        const slotsR1 = Object.values(siembra)
        if (slotsR1.length === 0) return false
        return slotsR1.every(s => s.local !== null && s.visitante !== null)
    }, [siembra])

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
            toast.error('Completa todos los slots de la primera ronda antes de guardar')
            return
        }
        setIsSavingSiembra(true)
        try {
            const partidosPayload = Object.entries(siembra).map(([partidoId, slots]) => ({
                id: Number(partidoId),
                participante_local_id: slots.local,
                participante_visitante_id: slots.visitante
            }))
            const r = await fetch(`/api/torneos/${torneo.id}/llaves/reordenar`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoriaId: Number(categoriaId), partidos: partidosPayload })
            })
            const d = await r.json()
            if (!r.ok) throw new Error(d.error)
            toast.success('Siembra guardada')
            cargar()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al guardar la siembra')
        } finally {
            setIsSavingSiembra(false)
        }
    }

    const handleEliminarLlaves = async () => {
        if (!torneo || !categoriaId) return
        if (!confirm('¿Eliminar el bracket completo? Esta acción no se puede deshacer.')) return
        setIsDeletingLlaves(true)
        try {
            const r = await fetch(`/api/torneos/${torneo.id}/llaves/reordenar?categoriaId=${categoriaId}`, {
                method: 'DELETE'
            })
            const d = await r.json()
            if (!r.ok) throw new Error(d.error)
            toast.success('Bracket eliminado')
            cargar()
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
        if (!confirm('¿Regenerar la siembra desde la clasificación de grupos? Se perderán los cambios manuales.')) return
        setIsRegeneratingSiembra(true)
        try {
            const primeraRonda = obtenerPrimeraRonda(partidos)
            const nuevaSiembra: Record<number, SiembraSlot> = {}
            for (let i = 0; i < primeraRonda.length; i++) {
                const localId = pool[2 * i]?.participante?.id ?? null
                const visitanteId = pool[2 * i + 1]?.participante?.id ?? null
                nuevaSiembra[primeraRonda[i].id] = { local: localId, visitante: visitanteId }
            }
            const payloadPartidos = primeraRonda.map(p => ({
                id: p.id,
                participante_local_id: nuevaSiembra[p.id]?.local ?? null,
                participante_visitante_id: nuevaSiembra[p.id]?.visitante ?? null,
            }))
            const r = await fetch(`/api/torneos/${torneo.id}/llaves/reordenar`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoriaId: Number(categoriaId), partidos: payloadPartidos }),
            })
            const d = await r.json()
            if (!r.ok) throw new Error(d.error)
            toast.success('Siembra regenerada')
            cargar()
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
            }
            setGanadoresBorrador({})
            if (pendientes.length > 0) {
                toast.success('Llave confirmada y ranking actualizado')
            } else {
                toast.success('Nada nuevo que guardar')
            }
            cargar()
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

    const handleDescargar = async () => {
        if (!llavesRef.current) return
        setDescargando(true)
        try {
            const { toPng } = await import('html-to-image')
            const originalError = console.error
            console.error = (...args) => {
                if (String(args[0]).includes('cssRules')) return
                originalError(...args)
            }
            // La app usa dark mode forzado (clase `dark` en <html>), por lo
            // que el bracket en pantalla sale oscuro. Para que el screenshot
            // quede con fondo claro y legible, en el clon (que se crea
            // dentro de un <iframe> propio) sobrescribimos las variables
            // CSS con los valores del tema light. El clon es independiente
            // de la página, así que no se ve afectado en pantalla.
            // `onClone` existe en html-to-image en runtime aunque no esté
            // declarado en sus tipos; lo definimos con tipo `any` para
            // silenciar TS sin perder tipado en el resto de las opciones.
            const onClone = (clonedDoc: Document) => {
                // Inyectamos un <style> en el clon que sobrescribe los
                // tokens de color del tema dark a los del tema light.
                // El clon se serializa en el PNG, no afecta la página.
                const style = clonedDoc.createElement('style')
                style.textContent = `
                    :root, :host, html.dark, .dark, * {
                        --color-canvas: #F8FAFC !important;
                        --color-surface: #FFFFFF !important;
                        --color-surface-2: #F8FAFC !important;
                        --color-subtle: #F1F5F9 !important;
                        --color-line: #E2E8F0 !important;
                        --color-line-strong: #CBD5E1 !important;
                        --color-muted: #94A3B8 !important;
                        --color-fg: #0F172A !important;
                        --color-fg-muted: #475569 !important;
                        --color-brand: #2563EB !important;
                        --color-brand-strong: #1D4ED8 !important;
                        --color-brand-soft: #EFF6FF !important;
                        --color-success: #059669 !important;
                        --color-success-soft: #ECFDF5 !important;
                        --color-danger: #E11D48 !important;
                        --color-danger-soft: #FFF1F2 !important;
                        --color-warning: #D97706 !important;
                        --color-warning-soft: #FFFBEB !important;
                        --color-info: #0EA5E9 !important;
                        --color-info-soft: #F0F9FF !important;
                        color-scheme: light !important;
                    }
                    body, html { background: #F8FAFC !important; color: #0F172A !important; }
                `
                clonedDoc.head.appendChild(style)
            }
            const dataUrl = await toPng(llavesRef.current, {
                backgroundColor: '#F8FAFC',
                pixelRatio: 2,
                skipFonts: true,
                filter: (node: Element) => !(node instanceof HTMLLinkElement && node.rel === 'stylesheet'),
                onClone,
            } as any)
            console.error = originalError
            const link = document.createElement('a')
            const cat = categorias.find(c => c.id.toString() === categoriaId)?.nombre ?? categoriaId
            link.download = `llaves-${torneo?.nombre}-${cat}.png`
            link.href = dataUrl
            link.click()
            toast.success('Imagen descargada')
        } catch (error) {
            console.error('Error al descargar:', error)
            toast.error('Error al generar la imagen')
        } finally {
            setDescargando(false)
        }
    }

    const handleImprimir = () => {
        if (!llavesRef.current) return
        const printWindow = window.open('', '_blank', 'width=1400,height=900')
        if (!printWindow) {
            toast.error('Permite ventanas emergentes para imprimir')
            return
        }
        const clone = llavesRef.current.cloneNode(true) as HTMLElement
        // Forzamos el tema light en el documento de impresión con un <style>
        // propio, ya que la ventana nueva no comparte los tokens de la app.
        printWindow.document.write(`
            <!DOCTYPE html><html><head><meta charset="utf-8"/>
            <title>Llaves - ${torneo?.nombre}</title>
            <style>
                * { box-sizing: border-box; }
                :root {
                    --color-canvas: #F8FAFC;
                    --color-surface: #FFFFFF;
                    --color-surface-2: #F8FAFC;
                    --color-subtle: #F1F5F9;
                    --color-line: #E2E8F0;
                    --color-line-strong: #CBD5E1;
                    --color-muted: #94A3B8;
                    --color-fg: #0F172A;
                    --color-fg-muted: #475569;
                    --color-brand: #2563EB;
                    --color-brand-strong: #1D4ED8;
                    --color-brand-soft: #EFF6FF;
                    --color-success: #059669;
                    --color-success-soft: #ECFDF5;
                    --color-warning: #D97706;
                    --color-warning-soft: #FFFBEB;
                    --color-info: #0EA5E9;
                    --color-info-soft: #F0F9FF;
                }
                body { margin: 0; padding: 24px; background: #F8FAFC; color: #0F172A; font-family: system-ui, -apple-system, sans-serif; }
                h1 { margin: 0 0 4px; font-size: 18px; }
                p { margin: 0 0 16px; color: #475569; font-size: 12px; }
                @page { size: A3 landscape; margin: 12mm; }
                @media print {
                    body { padding: 0; }
                    .no-print { display: none !important; }
                }
            </style></head><body>
                <h1>${torneo?.nombre}</h1>
                <p>Llaves de eliminación${esAbierto ? ' · abierto' : ''}</p>
                ${clone.outerHTML}
                <script>setTimeout(() => { window.print(); }, 250);</script>
            </body></html>
        `)
        printWindow.document.close()
    }

    if (!isOpen || !torneo) return null

    const numBorradores = Object.keys(ganadoresBorrador).length
    const hayLlaves = partidos.length > 0
    // DOBLES y EQUIPOS usan sub-detalles; solo en esos torneos el wizard
    // de alineación aplica. Para INDIVIDUAL no se renderiza el botón ABC/XYZ.
    const permiteAlineacion = torneo?.modalidad === 'DOBLES' || torneo?.modalidad === 'EQUIPOS'
    const onConfigurarAlineacion = (partidoId: number) => setWizardPartidoId(partidoId)

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Llaves de eliminación"
            description="Arrastra ganadores como borrador y confirma una sola vez"
            size="full"
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
                    {esAbierto && (
                        <div className="banner banner-info text-xs flex-1">
                            Torneo abierto: las llaves se arman en <b>primera categoría</b> mezclando a todos los inscritos.
                        </div>
                    )}
                    <Button
                        variant="primary"
                        onClick={handleGuardarSiembra}
                        isLoading={isSavingSiembra}
                        disabled={!hasChangesSiembra || !siembraCompleta}
                        leadingIcon={<CheckBadgeIcon className="h-4 w-4" />}
                        title={!siembraCompleta ? 'Completa todos los slots de la primera ronda' : (!hasChangesSiembra ? 'Sin cambios por guardar' : 'Guardar siembra')}
                    >
                        {isSavingSiembra ? 'Guardando...' : 'Guardar siembra'}
                    </Button>
                    {!tieneFinalizados && hayLlaves && (
                        <>
                            <Button
                                variant="secondary"
                                onClick={handleRegenerarSiembra}
                                isLoading={isRegeneratingSiembra}
                                leadingIcon={<ArrowPathIcon className="h-4 w-4" />}
                                title="Reasignar los slots de R1 desde la clasificación de grupos"
                            >
                                {isRegeneratingSiembra ? 'Regenerando...' : 'Regenerar siembra'}
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={handleEliminarLlaves}
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
                </div>
            </div>

            {confirmando && (
                <div className="banner banner-info mb-4 inline-flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    Guardando partidos, aplicando bonos y avanzando ganadores…
                </div>
            )}

            {loading ? (
                <div className="py-16 text-center text-fg-muted">
                    <div className="inline-block h-4 w-4 mr-2 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    Preparando bracket...
                </div>
            ) : !hayLlaves ? (
                <div className="py-12 text-center text-fg-muted">
                    {generando
                        ? 'Creando bracket vacío...'
                        : 'No se pudo crear el bracket. Verifica que los grupos estén finalizados.'}
                </div>
            ) : (
                // Este nodo es el que capturamos al imprimir/descargar.
                <div
                    ref={llavesRef}
                    className="bg-canvas rounded-xl p-6 overflow-x-auto"
                >
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
                        permiteAlineacion={permiteAlineacion}
                        onConfigurarAlineacion={onConfigurarAlineacion}
                    />
                </div>
            )}
            {partidoDelWizard && partidoDelWizard.participante_local && partidoDelWizard.participante_visitante && (
                <EncuentroEquiposWizardModal
                    isOpen={wizardPartidoId != null}
                    onClose={() => setWizardPartidoId(null)}
                    torneo={torneo ? { id: torneo.id, nombre: torneo.nombre } : { id: 0, nombre: '' }}
                    categoria={categorias.find(c => c.id.toString() === categoriaId)?.nombre ?? ''}
                    grupoId={0}
                    equipos={{
                        local: partidoDelWizard.participante_local as any,
                        visitante: partidoDelWizard.participante_visitante as any,
                    }}
                    partidos={[{
                        id: partidoDelWizard.id,
                        orden: partidoDelWizard.posicion_llave ?? 0,
                        detalles: (partidoDelWizard.detalles ?? []) as any,
                    }]}
                    modalidad={(torneo?.modalidad === 'DOBLES' || torneo?.modalidad === 'EQUIPOS') ? torneo.modalidad : 'EQUIPOS'}
                    onGuardado={() => { setWizardPartidoId(null); cargar() }}
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
    permiteAlineacion,
    onConfigurarAlineacion,
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
    permiteAlineacion: boolean
    onConfigurarAlineacion: (partidoId: number) => void
}) {
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
                        <CheckBadgeIcon className="h-4 w-4" /> Siembra completa
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
                    permiteAlineacion={permiteAlineacion}
                    onConfigurarAlineacion={onConfigurarAlineacion}
                />
            </div>

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
                            onDragStart={sembrado ? undefined : () => setDraggingSiembra({ tipo: 'pool', participanteId: item.participante.id })}
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
    permiteAlineacion,
    onConfigurarAlineacion,
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
    permiteAlineacion: boolean
    onConfigurarAlineacion: (partidoId: number) => void
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
                            permiteAlineacion={permiteAlineacion}
                            onConfigurarAlineacion={onConfigurarAlineacion}
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
                        permiteAlineacion={permiteAlineacion}
                        onConfigurarAlineacion={onConfigurarAlineacion}
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
                        permiteAlineacion={permiteAlineacion}
                        onConfigurarAlineacion={onConfigurarAlineacion}
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
    permiteAlineacion,
    onConfigurarAlineacion,
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
    /** DOBLES/EQUIPOS: el partido tiene sub-detalles y se puede configurar alineación. */
    permiteAlineacion?: boolean
    onConfigurarAlineacion?: (partidoId: number) => void
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
            {permiteAlineacion && onConfigurarAlineacion && (
                <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onConfigurarAlineacion(partido.id) }}
                    title="Configurar alineación (ABC / XYZ)"
                    className="absolute bottom-1 right-1 inline-flex items-center justify-center h-5 w-5 rounded text-fg-muted hover:text-brand hover:bg-subtle transition-colors"
                >
                    <UsersIcon className="h-3.5 w-3.5" />
                </button>
            )}
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
            onDragStart={ocupado ? () => setDraggingSiembra({ tipo: 'slot', slot, participanteId: participanteId! }) : undefined}
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
    permiteAlineacion,
    onConfigurarAlineacion,
}: {
    rondas: [string, Partido[]][]
    arrastre: { partidoId: number; participanteId: number } | null
    setArrastre: (a: { partidoId: number; participanteId: number } | null) => void
    ganadoresBorrador: Record<number, number>
    setGanadoresBorrador: React.Dispatch<React.SetStateAction<Record<number, number>>>
    permiteAlineacion: boolean
    onConfigurarAlineacion: (partidoId: number) => void
}) {
    if (rondas.length === 0) return null

    // Partidos de la primera ronda y la final (si la última ronda es de 1
    // partido, esa es la final; si no, no hay split posible).
    const primeraRonda = rondas[0]?.[1] ?? []
    const ultimaRonda = rondas[rondas.length - 1]?.[1] ?? []
    const hayFinalSeparada = ultimaRonda.length === 1 && rondas.length > 1
    const finalPartido = hayFinalSeparada ? ultimaRonda[0] : null
    const rondasSinFinal = hayFinalSeparada ? rondas.slice(0, -1) : rondas

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
                    arrastre={arrastre}
                    setArrastre={setArrastre}
                    ganadoresBorrador={ganadoresBorrador}
                    setGanadoresBorrador={setGanadoresBorrador}
                    permiteAlineacion={permiteAlineacion}
                    onConfigurarAlineacion={onConfigurarAlineacion}
                />
            </div>
        )
    }

    return (
        <div className="flex items-stretch justify-center gap-0">
            <HalfBracket
                lado="upper"
                rondas={upperRondas}
                arrastre={arrastre}
                setArrastre={setArrastre}
                ganadoresBorrador={ganadoresBorrador}
                setGanadoresBorrador={setGanadoresBorrador}
                permiteAlineacion={permiteAlineacion}
                onConfigurarAlineacion={onConfigurarAlineacion}
            />
            <FinalColumn
                final={finalPartido}
                arrastre={arrastre}
                setArrastre={setArrastre}
                ganadoresBorrador={ganadoresBorrador}
                setGanadoresBorrador={setGanadoresBorrador}
                permiteAlineacion={permiteAlineacion}
                onConfigurarAlineacion={onConfigurarAlineacion}
            />
            <HalfBracket
                lado="lower"
                rondas={lowerRondas}
                arrastre={arrastre}
                setArrastre={setArrastre}
                ganadoresBorrador={ganadoresBorrador}
                setGanadoresBorrador={setGanadoresBorrador}
                permiteAlineacion={permiteAlineacion}
                onConfigurarAlineacion={onConfigurarAlineacion}
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
    arrastre,
    setArrastre,
    ganadoresBorrador,
    setGanadoresBorrador,
    permiteAlineacion,
    onConfigurarAlineacion,
}: {
    lado: 'upper' | 'lower'
    rondas: [string, Partido[]][]
    arrastre: { partidoId: number; participanteId: number } | null
    setArrastre: (a: { partidoId: number; participanteId: number } | null) => void
    ganadoresBorrador: Record<number, number>
    setGanadoresBorrador: React.Dispatch<React.SetStateAction<Record<number, number>>>
    permiteAlineacion: boolean
    onConfigurarAlineacion: (partidoId: number) => void
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
                                    arrastre={arrastre}
                                    setArrastre={setArrastre}
                                    ganadorBorrador={ganadoresBorrador[p.id]}
                                    onDropGanador={() => {
                                        if (arrastre?.partidoId === p.id) {
                                            setGanadoresBorrador(prev => ({ ...prev, [p.id]: arrastre.participanteId }))
                                        }
                                        setArrastre(null)
                                    }}
                                    permiteAlineacion={permiteAlineacion}
                                    onConfigurarAlineacion={onConfigurarAlineacion}
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
    arrastre,
    setArrastre,
    ganadoresBorrador,
    setGanadoresBorrador,
    permiteAlineacion,
    onConfigurarAlineacion,
}: {
    final: Partido | null
    arrastre: { partidoId: number; participanteId: number } | null
    setArrastre: (a: { partidoId: number; participanteId: number } | null) => void
    ganadoresBorrador: Record<number, number>
    setGanadoresBorrador: React.Dispatch<React.SetStateAction<Record<number, number>>>
    permiteAlineacion: boolean
    onConfigurarAlineacion: (partidoId: number) => void
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
                        onDropGanador={() => {
                            if (arrastre?.partidoId === final.id) {
                                setGanadoresBorrador(prev => ({ ...prev, [final.id]: arrastre.participanteId }))
                            }
                            setArrastre(null)
                        }}
                        permiteAlineacion={permiteAlineacion}
                        onConfigurarAlineacion={onConfigurarAlineacion}
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
    permiteAlineacion = false,
    onConfigurarAlineacion,
}: {
    partido: Partido
    arrastre: { partidoId: number; participanteId: number } | null
    setArrastre: (a: { partidoId: number; participanteId: number } | null) => void
    ganadorBorrador?: number
    onDropGanador: () => void
    destacado?: boolean
    /** DOBLES/EQUIPOS: el partido tiene sub-detalles y se puede configurar alineación. */
    permiteAlineacion?: boolean
    onConfigurarAlineacion?: (partidoId: number) => void
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

    return (
        <div
            onDragOver={e => e.preventDefault()}
            onDrop={onDropGanador}
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
                    return (
                        <div
                            key={i}
                            draggable={!finalizado && !!pid}
                            onDragStart={() => pid && setArrastre({ partidoId: partido.id, participanteId: pid })}
                            className={`flex items-center gap-1.5 text-xs leading-tight cursor-grab truncate py-0.5 ${
                                esGanador ? 'font-bold text-success' : 'text-fg'
                            }`}
                            title={nombre(p)}
                        >
                            {esGanador && (
                                <CheckBadgeIcon className="h-3.5 w-3.5 text-success shrink-0" />
                            )}
                            <span className="truncate">{nombre(p)}</span>
                        </div>
                    )
                })}
            </div>
            <div className="absolute top-0.5 right-1.5 text-[9px] text-fg-muted font-mono">
                #{partido.posicion_llave}
            </div>
            {!finalizado && (
                <div className={`mx-2 mb-2 p-1 text-center text-[10px] font-bold rounded border border-dashed ${
                    ganadorBorrador
                        ? 'text-warning border-warning bg-warning-soft/40'
                        : 'text-fg-muted border-line-strong'
                }`}>
                    {ganadorBorrador ? 'Borrador' : 'Suelta ganador aquí'}
                </div>
            )}
            {!finalizado && permiteAlineacion && onConfigurarAlineacion && (
                <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onConfigurarAlineacion(partido.id) }}
                    title="Configurar alineación (ABC / XYZ)"
                    className="absolute bottom-1 right-1 inline-flex items-center justify-center h-5 w-5 rounded text-fg-muted hover:text-brand hover:bg-subtle transition-colors"
                >
                    <UsersIcon className="h-3.5 w-3.5" />
                </button>
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
