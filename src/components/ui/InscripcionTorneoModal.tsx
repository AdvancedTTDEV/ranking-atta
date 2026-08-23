'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { ExclamationTriangleIcon, CheckCircleIcon, UserGroupIcon } from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import NavegacionModales, { DestinoModal } from '@/components/ui/NavegacionModales'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import PlayerSelector from '@/components/ui/PlayerSelector'
import { categoriasParaSelector } from '@/lib/torneo'

interface Jugador {
    id: number
    nombre: string
    categoria_id?: number
    categorias?: { id: number; nombre: string }
}
interface Categoria { id: number; nombre: string }
interface Inscripcion { id?: number; nombrePersonalizado: string; jugadores: Jugador[]; categoriaId?: number }
interface Torneo {
    id: number
    nombre: string
    modalidad: 'INDIVIDUAL' | 'DOBLES' | 'EQUIPOS' | 'ATTA_TEAMS'
    abierto?: boolean
    torneo_categorias: { categorias?: Categoria }[]
}

interface Props { isOpen: boolean; onClose: () => void; torneo: Torneo | null; onNavegar?: (destino: DestinoModal) => void }

const etiquetasModalidad = {
    INDIVIDUAL: 'Individual',
    DOBLES: 'Dobles',
    EQUIPOS: 'Por equipos',
    ATTA_TEAMS: 'ATTA Teams'
}

export default function InscripcionTorneoModal({ isOpen, onClose, torneo, onNavegar }: Props) {
    const [categoriaId, setCategoriaId] = useState('')
    const [jugadoresDisponibles, setJugadoresDisponibles] = useState<Jugador[]>([])
    const [inscripciones, setInscripciones] = useState<Inscripcion[]>([])
    const [inscripcionesIniciales, setInscripcionesIniciales] = useState<Inscripcion[]>([])
    const [jugadoresEnEdicion, setJugadoresEnEdicion] = useState<Jugador[]>([])
    const [nombrePersonalizado, setNombrePersonalizado] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [todasCategorias, setTodasCategorias] = useState<Categoria[]>([])

    // Catálogo completo de categorías, necesario para detectar torneos
    // "abiertos" (DOBLES, EQUIPOS o primera categoría) y mostrar todas las
    // opciones en el selector.
    useEffect(() => {
        let cancelado = false
        fetch('/api/categorias')
            .then(r => r.ok ? r.json() : [])
            .then(data => { if (!cancelado) setTodasCategorias(Array.isArray(data) ? data : []) })
            .catch(() => { /* silencioso */ })
        return () => { cancelado = true }
    }, [])

    const categorias = useMemo(
        () => categoriasParaSelector(
            torneo?.torneo_categorias as { categorias: Categoria }[] | undefined,
            todasCategorias,
            torneo?.modalidad,
            torneo?.abierto,
        ),
        [torneo, todasCategorias]
    )
    const modalidad = torneo?.modalidad || 'INDIVIDUAL'
    // Torneos abiertos: primera, DOBLES, EQUIPOS, ATTA_TEAMS. En estos
    // casos el selector de categoría NO se muestra en el modal y la
    // categoría se infiere al guardar.
    const esAbierto = Boolean(
        torneo?.abierto ||
        modalidad === 'DOBLES' ||
        modalidad === 'EQUIPOS' ||
        modalidad === 'ATTA_TEAMS' ||
        categorias.some(c => c.nombre === 'primera')
    )
    // ATTA Teams: todos los equipos se guardan bajo la categoría ancla
    // ("primera") para que grupos y llaves mezclen a todos los clubes.
    const esAttaTeams = modalidad === 'ATTA_TEAMS'
    const categoriaAnclaId = useMemo(() => {
        if (!esAttaTeams) return undefined
        return todasCategorias.find(c => c.nombre === 'primera')?.id ?? todasCategorias[0]?.id
    }, [esAttaTeams, todasCategorias])

    // IDs de jugadores que ya forman parte de inscripciones confirmadas en
    // el panel derecho. Se usan para ocultarlos del selector y para validar
    // que no se vuelvan a seleccionar.
    const jugadoresInscritosIds = useMemo(
        () => new Set(inscripciones.flatMap(inscripcion => inscripcion.jugadores.map(j => j.id))),
        [inscripciones]
    )

    // Lista que se muestra en el PlayerSelector: oculta a los que ya están
    // confirmados en el panel de inscritos.
    const jugadoresParaSeleccionar = useMemo(
        () => jugadoresDisponibles.filter(j => !jugadoresInscritosIds.has(j.id)),
        [jugadoresDisponibles, jugadoresInscritosIds]
    )

    // Firma estable de las inscripciones para detectar cambios sin guardar.
    // Usamos los IDs persistidos (o nombres de jugadores nuevos) y los nombres
    // personalizados; así el orden y la equivalencia de sets no afectan.
    // En torneos abiertos incluimos la categoría en la firma porque dos
    // inscripciones con los mismos jugadores pero distinta categoría se
    // tratan como entidades distintas.
    const firmaInscripciones = useMemo(
        () => inscripciones
            .map(inscripcion => ({
                key: inscripcion.id != null
                    ? `id-${inscripcion.id}-${inscripcion.categoriaId ?? ''}`
                    : `tmp-${inscripcion.categoriaId ?? ''}-${inscripcion.jugadores.map(j => j.id).sort().join('-')}`,
                nombre: inscripcion.nombrePersonalizado.trim(),
                jugadores: inscripcion.jugadores.map(j => j.id).sort().join(',')
            }))
            .sort((a, b) => a.key.localeCompare(b.key)),
        [inscripciones]
    )

    const firmaInicial = useMemo(
        () => inscripcionesIniciales
            .map(inscripcion => ({
                key: inscripcion.id != null
                    ? `id-${inscripcion.id}-${inscripcion.categoriaId ?? ''}`
                    : `tmp-${inscripcion.categoriaId ?? ''}-${inscripcion.jugadores.map(j => j.id).sort().join('-')}`,
                nombre: inscripcion.nombrePersonalizado.trim(),
                jugadores: inscripcion.jugadores.map(j => j.id).sort().join(',')
            }))
            .sort((a, b) => a.key.localeCompare(b.key)),
        [inscripcionesIniciales]
    )

    const hayCambiosSinGuardar = useMemo(
        () => JSON.stringify(firmaInscripciones) !== JSON.stringify(firmaInicial),
        [firmaInscripciones, firmaInicial]
    )

    useEffect(() => {
        const primerId = categorias[0]?.id ? String(categorias[0].id) : ''
        setCategoriaId(prev => (prev === primerId ? prev : primerId))
    }, [categorias])

    useEffect(() => {
        setInscripciones([])
        setInscripcionesIniciales([])
        setJugadoresEnEdicion([])
        setNombrePersonalizado('')
    }, [torneo?.id])

    useEffect(() => {
        if (!torneo || !isOpen) return
        // En torneos abiertos no hay un único categoriaId; cada jugador
        // conserva su categoría original y la guardamos con él. En
        // torneos no abiertos sí exigimos una categoría.
        if (!esAbierto && !categoriaId) return

        const cargar = async () => {
            try {
                const jugadoresUrl = esAbierto
                    ? '/api/jugadores?all=true'
                    : `/api/jugadores?all=true&categoriaId=${categoriaId}`
                const participantesUrl = esAbierto
                    ? `/api/torneos/${torneo.id}/participantes`
                    : `/api/torneos/${torneo.id}/participantes?categoriaId=${categoriaId}`
                const [resJugadores, resInscritos] = await Promise.all([
                    fetch(jugadoresUrl),
                    fetch(participantesUrl)
                ])
                const dataJugadores = await resJugadores.json()
                const dataInscritos = await resInscritos.json()
                const cargadas: Inscripcion[] = (dataInscritos.participantes || []).map((participante: any) => {
                    // OJO: un `miembros: []` vacío es truthy, así que no vale
                    // el truco `miembros?.map(...) || fallback` (devolvería un
                    // array sin nombres). Elegimos según si hay miembros reales.
                    const jugadoresMiembros = (participante.miembros ?? [])
                        .map((miembro: any) => miembro.jugadores)
                        .filter(Boolean)
                    return {
                        id: participante.id,
                        nombrePersonalizado: participante.nombre_personalizado || '',
                        jugadores: jugadoresMiembros.length > 0
                            ? jugadoresMiembros
                            : (participante.jugadores ? [participante.jugadores] : []),
                        categoriaId: participante.categoria_id,
                    }
                })
                setJugadoresDisponibles(dataJugadores.jugadores || [])
                setInscripciones(cargadas)
                setInscripcionesIniciales(cargadas)
            } catch {
                toast.error('No se pudieron cargar las inscripciones')
            }
        }
        cargar()
    }, [categoriaId, isOpen, torneo?.id, esAbierto])

    const cambiarJugador = (jugador: Jugador) => {
        setJugadoresEnEdicion(prev => prev.some(item => item.id === jugador.id)
            ? prev.filter(item => item.id !== jugador.id)
            : [...prev, jugador])
    }

    const agregarInscripcion = () => {
        if (jugadoresEnEdicion.length === 0) {
            toast.error('Selecciona al menos un jugador')
            return
        }

        if (modalidad === 'INDIVIDUAL') {
            // En INDIVIDUAL cada jugador es su propia inscripción; agregamos
            // una entrada por cada jugador seleccionado en un solo paso.
            // En torneos abiertos, cada inscripción se etiqueta con la
            // categoría original del jugador para que el modelo relacional
            // (que exige categoria_id) siga siendo válido.
            setInscripciones(prev => [
                ...prev,
                ...jugadoresEnEdicion.map(jugador => ({
                    nombrePersonalizado: '',
                    jugadores: [jugador],
                    categoriaId: esAbierto ? jugador.categoria_id : Number(categoriaId) || undefined,
                }))
            ])
        } else {
            const esEquipo = modalidad === 'EQUIPOS' || modalidad === 'ATTA_TEAMS'
            const cantidadValida = esEquipo
                ? jugadoresEnEdicion.length >= 3
                : jugadoresEnEdicion.length === 2

            if (!cantidadValida) {
                toast.error(esEquipo
                    ? 'Un equipo debe tener al menos 3 jugadores'
                    : 'Una pareja debe tener exactamente 2 jugadores')
                return
            }

            // ATTA Teams: validamos la composición en el cliente para dar
            // feedback inmediato (el backend la revalida igual).
            if (modalidad === 'ATTA_TEAMS') {
                const series = jugadoresEnEdicion.map(j => j.categorias?.nombre)
                if (series.some(s => !s)) {
                    toast.error('Hay jugadores sin categoría asignada')
                    return
                }
                const nPrimera = series.filter(s => s === 'primera').length
                const nSegunda = series.filter(s => s === 'segunda').length
                const valida = (nPrimera <= 2 && nSegunda <= 1) || (nPrimera === 0 && nSegunda <= 2)
                if (!valida) {
                    toast.error('Composición inválida: máx. 2 de primera y 1 de segunda, o sin primera y máx. 2 de segunda (resto de tercera/cuarta)')
                    return
                }
            }

            setInscripciones(prev => [...prev, {
                nombrePersonalizado: nombrePersonalizado.trim(),
                jugadores: jugadoresEnEdicion,
                categoriaId: modalidad === 'ATTA_TEAMS'
                    ? categoriaAnclaId
                    : esAbierto ? jugadoresEnEdicion[0].categoria_id : Number(categoriaId) || undefined,
            }])
        }

        setJugadoresEnEdicion([])
        setNombrePersonalizado('')
    }

    const guardar = async () => {
        if (!torneo) return
        if (!esAbierto && !categoriaId) return
        setIsSaving(true)
        try {
            // En torneos abiertos, las inscripciones pueden estar repartidas
            // entre varias categorías (la de origen de cada jugador). Las
            // agrupamos por categoriaId y hacemos una llamada por categoría
            // porque el endpoint actual hace `deleteMany` por categoría.
            // En torneos no abiertos, una sola llamada con la categoría del
            // selector.
            if (esAbierto) {
                const grupos = new Map<number, Inscripcion[]>()
                for (const insc of inscripciones) {
                    const cat = insc.categoriaId
                    if (!cat) {
                        toast.error('Una inscripción no tiene categoría asignada')
                        setIsSaving(false)
                        return
                    }
                    if (!grupos.has(cat)) grupos.set(cat, [])
                    grupos.get(cat)!.push(insc)
                }
                for (const [cat, lista] of grupos.entries()) {
                    const response = await fetch(`/api/torneos/${torneo.id}/participantes`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            categoriaId: cat,
                            participantes: lista.map(inscripcion => ({
                                nombrePersonalizado: inscripcion.nombrePersonalizado,
                                jugadoresIds: inscripcion.jugadores.map(jugador => jugador.id)
                            }))
                        })
                    })
                    if (!response.ok) {
                        const data = await response.json().catch(() => ({}))
                        throw new Error(data.error || 'No se pudieron guardar las inscripciones')
                    }
                }
            } else {
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
            }
            toast.success('Inscripciones actualizadas')
            setInscripcionesIniciales(inscripciones)
            onClose()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Error de conexión')
        } finally {
            setIsSaving(false)
        }
    }

    if (!isOpen || !torneo) return null

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Inscripciones · ${etiquetasModalidad[modalidad]}`}
            description={torneo.nombre}
            size="2xl"
            navegacionInferior={<NavegacionModales activo="inscripcion" onNavegar={onNavegar} />}
            footer={
                <>
                    <div className="flex items-center mr-auto">
                        {hayCambiosSinGuardar ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning">
                                <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                                Cambios sin guardar
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                                <CheckCircleIcon className="h-3.5 w-3.5" />
                                Todo guardado
                            </span>
                        )}
                    </div>
                    <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                        Cancelar
                    </Button>
                    <Button
                        variant="primary"
                        onClick={guardar}
                        isLoading={isSaving}
                        disabled={!hayCambiosSinGuardar}
                    >
                        Guardar inscripciones
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                {hayCambiosSinGuardar && (
                    <div className="banner banner-warning flex items-center gap-2">
                        <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
                        <span>
                            Tienes cambios sin guardar. Pulsa <b>Guardar inscripciones</b> para aplicarlos.
                        </span>
                    </div>
                )}

                {!esAbierto && (
                    <div className="card-flush p-3 flex items-end gap-3">
                        <Select
                            label="Categoría"
                            value={categoriaId}
                            onChange={e => setCategoriaId(e.target.value)}
                            className="w-full sm:w-72"
                        >
                            {categorias.map(categoria => (
                                <option key={categoria.id} value={categoria.id}>{categoria.nombre}</option>
                            ))}
                        </Select>
                    </div>
                )}

                {esAbierto && (
                    <div className="banner banner-info text-xs">
                        {modalidad === 'ATTA_TEAMS' ? (
                            <>
                                <b>ATTA Teams:</b> arma equipos mezclando jugadores de todos los clubes.
                                Composición: máx. 2 de primera y máx. 1 de segunda, o sin primera y
                                máx. 2 de segunda; el resto debe ser de tercera o cuarta.
                            </>
                        ) : (
                            <>Torneo abierto: puedes inscribir jugadores de cualquier categoría.
                            Cada jugador se inscribe en su categoría de origen.</>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-3 md:gap-4">
                    <div className="card-flush p-4">
                        <div className="mb-3">
                            <h3 className="card-title">
                                Crear {modalidad === 'EQUIPOS' || modalidad === 'ATTA_TEAMS' ? 'equipo' : modalidad === 'DOBLES' ? 'pareja' : 'participante'}
                            </h3>
                            {modalidad === 'INDIVIDUAL' && (
                                <p className="card-subtitle mt-1">
                                    Selecciona uno o varios jugadores y pulsa <b>Añadir</b> para inscribirlos a la vez.
                                </p>
                            )}
                        </div>
                        {modalidad !== 'INDIVIDUAL' && (
                            <div className="mb-4">
                                <Input
                                    value={nombrePersonalizado}
                                    onChange={e => setNombrePersonalizado(e.target.value)}
                                    placeholder="Nombre personalizado (opcional)"
                                />
                            </div>
                        )}
                        <PlayerSelector
                            jugadores={jugadoresParaSeleccionar}
                            selectedJugadores={jugadoresEnEdicion}
                            onJugadorChange={cambiarJugador}
                            onRemoveJugador={id => setJugadoresEnEdicion(prev => prev.filter(jugador => jugador.id !== id))}
                        />
                        <div className="mt-4">
                            <Button
                                variant="primary"
                                onClick={agregarInscripcion}
                                className="w-full"
                            >
                                {modalidad === 'INDIVIDUAL'
                                    ? (jugadoresEnEdicion.length > 1
                                        ? `Añadir ${jugadoresEnEdicion.length} participantes`
                                        : 'Añadir participante')
                                    : `Añadir ${modalidad === 'EQUIPOS' || modalidad === 'ATTA_TEAMS' ? 'equipo' : 'pareja'}`}
                            </Button>
                        </div>
                    </div>

                    <div className="card-flush p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="card-title inline-flex items-center gap-2">
                                <UserGroupIcon className="h-4 w-4 text-fg-muted" />
                                Inscritos
                            </h3>
                            <Badge variant="brand">{inscripciones.length}</Badge>
                        </div>
                        {inscripciones.length === 0 ? (
                            <p className="text-sm text-fg-muted py-6 text-center">
                                Aún no hay inscritos.
                            </p>
                        ) : (
                            <ul className="space-y-2">
                                {inscripciones.map((inscripcion, index) => {
                                    const catNombre = inscripcion.categoriaId
                                        ? (todasCategorias.find(c => c.id === inscripcion.categoriaId)?.nombre
                                            || inscripcion.jugadores[0]?.categorias?.nombre
                                            || null)
                                        : null
                                    return (
                                        <li key={`${inscripcion.id ?? 'nuevo'}-${index}`} className="card-flush p-3">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-semibold text-fg truncate">
                                                        {inscripcion.nombrePersonalizado
                                                            || inscripcion.jugadores.map(jugador => jugador.nombre).join(' / ')}
                                                    </p>
                                                    {inscripcion.nombrePersonalizado && (
                                                        <p className="text-xs text-fg-muted mt-0.5">
                                                            {inscripcion.jugadores.map(jugador => `${jugador.id} ${jugador.nombre}`).join(' / ')}
                                                        </p>
                                                    )}
                                                    {esAbierto && catNombre && (
                                                        <Badge variant="neutral" className="mt-1.5 text-[10px]">{catNombre}</Badge>
                                                    )}
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setInscripciones(prev => prev.filter((_, itemIndex) => itemIndex !== index))}
                                                    className="text-danger hover:text-danger"
                                                >
                                                    Quitar
                                                </Button>
                                            </div>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    )
}
