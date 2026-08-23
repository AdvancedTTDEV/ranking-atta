'use client'

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

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
    jugadores: { jugador_id: number; lado: 'LOCAL' | 'VISITANTE'; jugadores: Jugador }[]
    sets: SetPartido[]
}
interface Partido {
    id: number
    orden: number
    sets_local: number
    sets_visitante: number
    estado: 'PENDIENTE' | 'FINALIZADO'
    grupo_id?: number | null
    torneo_grupos?: { id: number; numero_grupo: number } | null
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
}
interface Props {
    isOpen: boolean
    onClose: () => void
    torneo: Torneo
    partidos: Partido[]
    partidoInicialId: number
    /** Borradores en memoria (controlado por el padre) para que el badge
     *  "Borrador" de la lista siga reflejándose cuando el modal está cerrado. */
    borradores: Record<number, { sets: { local: number; visitante: number }[] }>
    onBorradoresChange: (siguiente: Record<number, { sets: { local: number; visitante: number }[] }>) => void
    onPersist?: () => void
}

const nombreParticipante = (participante: Participante) =>
    participante.nombre_personalizado?.trim()
    || participante.miembros.map(miembro => miembro.jugadores.nombre).join(' / ')
    || participante.jugadores?.nombre
    || 'Participante'

export default function PartidosResultadoModal({
    isOpen,
    onClose,
    torneo,
    partidos,
    partidoInicialId,
    borradores,
    onBorradoresChange,
    onPersist,
}: Props) {
    const [seleccionadoId, setSeleccionadoId] = useState<number>(partidoInicialId)
    const [detalleSeleccionado, setDetalleSeleccionado] = useState<DetalleEquipo | null>(null)
    // Las alineaciones de los detalles se configuran en el wizard del
    // grupo y se guardan en `detalle.jugadores` (source of truth). El
    // modal de resultado las lee de ahí directamente.
    const [marcadores, setMarcadores] = useState(Array.from({ length: 5 }, () => ({ local: '', visitante: '' })))
    const [guardando, setGuardando] = useState(false)
    const marcadoresRef = useRef<MarcadoresInputHandle | null>(null)

    const seleccionado = useMemo(
        () => partidos.find(p => p.id === seleccionadoId) || null,
        [partidos, seleccionadoId]
    )

    // Cuando cambia el `partidoInicialId` (el padre nos da un partido para abrir),
    // sincronizamos nuestro estado interno.
    useEffect(() => {
        if (isOpen) {
            setSeleccionadoId(partidoInicialId)
            setDetalleSeleccionado(null)
        }
    }, [partidoInicialId, isOpen])

    // Partidos del mismo grupo que el actualmente seleccionado, en orden.
    // El filtro sirve para que las flechas no salten de un grupo a otro.
    const partidosMismoGrupo = useMemo(() => {
        if (!seleccionado) return [] as Partido[]
        const grupoId = seleccionado.torneo_grupos?.id ?? null
        return partidos
            .filter(p => (p.torneo_grupos?.id ?? null) === grupoId)
            .sort((a, b) => a.orden - b.orden)
    }, [partidos, seleccionado])

    const idxActual = partidosMismoGrupo.findIndex(p => p.id === seleccionadoId)
    const hayAnterior = idxActual > 0
    const haySiguiente = idxActual >= 0 && idxActual < partidosMismoGrupo.length - 1

    /**
     * Partidos pendientes del grupo (no finalizados, sin importar si ya
     * tienen un borrador en memoria). Se usa para detectar cuándo el
     * usuario acaba de registrar el último pendiente del grupo y darle
     * feedback contextual.
     */
    const partidosPendientesGrupo = useMemo(
        () => partidosMismoGrupo.filter(p => p.estado === 'PENDIENTE'),
        [partidosMismoGrupo]
    )
    const seleccionadoEsUltimoPendiente = !!seleccionado
        && seleccionado.estado === 'PENDIENTE'
        && partidosPendientesGrupo.length === 1
        && partidosPendientesGrupo[0].id === seleccionado.id

    // Cada vez que se abre un partido, precargamos los marcadores con los
    // sets ya guardados (si FINALIZADO) o con el borrador en memoria. Al
    // terminar, devolvemos el foco al primer input para que el usuario
    // pueda seguir capturando con Enter sin tener que volver a clicar.
    useEffect(() => {
        if (!seleccionado) return
        const borrador = borradores[seleccionado.id]
        setMarcadores(Array.from({ length: 5 }, (_, index) => {
            const setBorrador = borrador?.sets[index]
            const set = seleccionado.sets[index]
            return setBorrador
                ? { local: String(setBorrador.local), visitante: String(setBorrador.visitante) }
                : set
                    ? { local: String(set.puntos_local), visitante: String(set.puntos_visitante) }
                    : { local: '', visitante: '' }
        }))
        // Pedimos el foco en el siguiente tick para que React haya aplicado
        // el `setMarcadores` anterior y los inputs existan con sus refs.
        const id = window.setTimeout(() => {
            if (seleccionado.estado !== 'FINALIZADO') {
                marcadoresRef.current?.focusPrimerInput()
            }
        }, 0)
        return () => window.clearTimeout(id)
    }, [seleccionadoId, seleccionado, borradores])

    const irAnterior = () => {
        if (hayAnterior) {
            setDetalleSeleccionado(null)
            setSeleccionadoId(partidosMismoGrupo[idxActual - 1].id)
        }
    }

    const irSiguiente = () => {
        if (haySiguiente) {
            setDetalleSeleccionado(null)
            setSeleccionadoId(partidosMismoGrupo[idxActual + 1].id)
        } else {
            // Si no hay siguiente, cerramos el modal para que el usuario sepa
            // que terminó la lista del grupo.
            cerrar()
        }
    }

    const abrirDetalle = (detalle: DetalleEquipo) => {
        if (!seleccionado || detalle.estado === 'FINALIZADO') return
        setDetalleSeleccionado(detalle)
        // Las alineaciones se leen directamente de `detalle.jugadores`
        // (fuente de verdad: las configuró el wizard del grupo).
        setMarcadores(Array.from({ length: 5 }, (_, index) => {
            const set = detalle.sets[index]
            return set ? { local: String(set.puntos_local), visitante: String(set.puntos_visitante) } : { local: '', visitante: '' }
        }))
    }

    const guardarDetalle = async () => {
        if (!seleccionado || !detalleSeleccionado) return
        const sets = marcadores
            .filter(set => set.local !== '' || set.visitante !== '')
            .map(set => ({ local: Number(set.local), visitante: Number(set.visitante) }))
        // Las alineaciones fueron configuradas en el wizard del grupo.
        // Aquí leemos directamente las IDs de jugadores ya guardadas en
        // `detalle.jugadores` (source of truth). Si no hay alineación,
        // enviamos arrays vacíos: el backend rechazará con 400 si el
        // detalle requiere jugadores.
        const jugadoresLocalIds = detalleSeleccionado.jugadores
            .filter(j => j.lado === 'LOCAL')
            .map(j => j.jugador_id)
        const jugadoresVisitanteIds = detalleSeleccionado.jugadores
            .filter(j => j.lado === 'VISITANTE')
            .map(j => j.jugador_id)
        setGuardando(true)
        try {
            const response = await fetch(
                `/api/torneos/${torneo.id}/partidos/${seleccionado.id}/detalles/${detalleSeleccionado.id}`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jugadoresLocalIds,
                        jugadoresVisitanteIds,
                        sets,
                    })
                }
            )
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || 'No se pudo guardar el partido')
            toast.success('Partido de la serie guardado')
            setDetalleSeleccionado(null)
            onPersist?.()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Error de conexión')
        } finally {
            setGuardando(false)
        }
    }

    const guardarResultado = () => {
        if (!seleccionado) return
        if (seleccionado.estado === 'FINALIZADO') {
            // No se puede añadir un borrador sobre un partido ya cerrado.
            // La vista ya deshabilita los inputs, pero cubrimos el atajo
            // de Enter por si el foco quedó en un botón.
            toast.error('Este partido ya fue guardado. Usa «Deshacer resultado» para revertirlo.')
            return
        }
        const sets = marcadores
            .filter(set => set.local !== '' || set.visitante !== '')
            .map(set => ({ local: Number(set.local), visitante: Number(set.visitante) }))
        if (sets.length === 0) {
            toast.error('Ingresa al menos un set antes de pasar al borrador')
            return
        }
        // Calculamos el total de borradores DESPUÉS de añadir este, para
        // mostrar el contador correcto en el mensaje final del grupo.
        const totalBorradores = Object.keys(borradores).length + 1
        onBorradoresChange({ ...borradores, [seleccionado.id]: { sets } })
        if (seleccionadoEsUltimoPendiente) {
            // El usuario acaba de registrar el último partido pendiente
            // del grupo. Le avisamos con un mensaje positivo en vez del
            // genérico "Resultado añadido al borrador", y NO avanzamos
            // (no hay siguiente) ni cerramos: lo dejamos en el modal
            // para que revise, edite o cierre cuando quiera.
            toast.success(
                `¡Grupo completo! ${totalBorradores} borrador${totalBorradores === 1 ? '' : 'es'} listo${totalBorradores === 1 ? '' : 's'} para enviar`,
                { duration: 4000 }
            )
        } else if (haySiguiente) {
            toast.success('Resultado añadido al borrador')
            irSiguiente()
        } else {
            // No es el último pendiente (puede que el siguiente ya esté
            // finalizado), pero tampoco hay un "siguiente" navegable
            // (ej. cuando filtras por pendientes manualmente). En este
            // caso también cerramos para no dejar al usuario atascado.
            toast.success('Resultado añadido al borrador')
            cerrar()
        }
    }

    const deshacerResultado = async () => {
        if (!seleccionado) return
        setGuardando(true)
        try {
            const response = await fetch(`/api/torneos/${torneo.id}/partidos/${seleccionado.id}`, { method: 'DELETE' })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || 'No se pudo deshacer el resultado')
            toast.success('Resultado revertido')
            onPersist?.()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Error de conexión')
        } finally {
            setGuardando(false)
        }
    }

    /** Confirmación ESTILO APP para deshacer la serie (reemplaza al
     *  window.confirm nativo). */
    const [confirmarDeshacerSerie, setConfirmarDeshacerSerie] = useState(false)

    /** Deshace la SERIE completa por equipos: revierte los sub-partidos
     *  guardados (ranking incluido) y el encuentro vuelve a pendiente. */
    const deshacerSerie = () => {
        if (!seleccionado) return
        setConfirmarDeshacerSerie(true)
    }

    const cerrar = () => {
        const cantidad = Object.keys(borradores).length
        if (cantidad > 0) {
            toast.success(
                `${cantidad} borrador${cantidad === 1 ? '' : 'es'} pendiente${cantidad === 1 ? '' : 's'}. Pulsa "Guardar cambios" en la vista principal para enviar.`,
                { duration: 4000 }
            )
        }
        onClose()
    }

    if (!isOpen || !seleccionado) return null

    const numeroBorradores = Object.keys(borradores).length

    // ── Modal para EQUIPOS/ATTA Teams: lista de partidos de la serie ──
    if ((torneo.modalidad === 'EQUIPOS' || torneo.modalidad === 'ATTA_TEAMS') && !detalleSeleccionado) {
        return (
            <>
            <Modal
                isOpen
                onClose={cerrar}
                title="Serie por equipos"
                description={`${nombreParticipante(seleccionado.participante_local)}  ${seleccionado.sets_local} : ${seleccionado.sets_visitante}  ${nombreParticipante(seleccionado.participante_visitante)}`}
                size="lg"
                footer={
                    <>
                        {numeroBorradores > 0 && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning mr-auto">
                                <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                                {numeroBorradores} borrador{numeroBorradores === 1 ? '' : 'es'} sin enviar
                            </span>
                        )}
                        {seleccionado.estado === 'FINALIZADO' && (
                            <Button
                                variant="danger"
                                onClick={deshacerSerie}
                                isLoading={guardando}
                                leadingIcon={<ArrowPathIcon className="h-4 w-4" />}
                            >
                                Deshacer serie
                            </Button>
                        )}
                        <Button variant="secondary" onClick={cerrar}>Cerrar</Button>
                    </>
                }
            >
                <div className="space-y-2">
                    {seleccionado.detalles.map(detalle => {
                        const finalizado = detalle.estado === 'FINALIZADO'
                        // Mostramos QUIÉN juega cada cruce para que el
                        // operador sepa exactamente qué partido está
                        // registrando sin abrirlo.
                        const locales = detalle.jugadores.filter(j => j.lado === 'LOCAL').map(j => j.jugadores.nombre)
                        const visitantes = detalle.jugadores.filter(j => j.lado === 'VISITANTE').map(j => j.jugadores.nombre)
                        const hayAlineacion = locales.length > 0 && visitantes.length > 0
                        return (
                            <button
                                key={detalle.id}
                                disabled={finalizado}
                                onClick={() => abrirDetalle(detalle)}
                                className="w-full flex items-center justify-between card-flush px-4 py-3 text-left hover:bg-subtle disabled:opacity-60 disabled:hover:bg-surface transition-colors"
                            >
                                <span className="min-w-0">
                                    <span className="block font-semibold text-fg">
                                        {detalle.orden}. {detalle.tipo === 'DOBLES' ? 'Dobles' : 'Individual'}
                                    </span>
                                    <span className={`block text-xs truncate ${hayAlineacion ? 'text-fg-muted' : 'text-warning font-medium'}`}>
                                        {hayAlineacion
                                            ? `${locales.join(' / ')} vs ${visitantes.join(' / ')}`
                                            : 'Sin alineación — usa «Configurar alineación» del grupo'}
                                    </span>
                                </span>
                                <span className={finalizado ? 'text-success font-bold' : 'text-warning font-bold'}>
                                    {finalizado ? `${detalle.sets_local} : ${detalle.sets_visitante}` : 'Registrar'}
                                </span>
                            </button>
                        )
                    })}
                </div>
            </Modal>
            {seleccionado.estado === 'FINALIZADO' && (
                <ConfirmDialog
                    isOpen={confirmarDeshacerSerie}
                    onClose={() => setConfirmarDeshacerSerie(false)}
                    onConfirm={() => {
                        setConfirmarDeshacerSerie(false)
                        void deshacerResultado()
                    }}
                    titulo="Deshacer serie completa"
                    descripcion={`Se revertirán ${seleccionado.detalles.filter(d => d.estado === 'FINALIZADO').length} juegos guardados y su efecto en el ranking. La alineación se conserva.`}
                    confirmLabel="Sí, deshacer"
                    variant="danger"
                    busy={guardando}
                />
            )}
        </>
        )
    }

    // ── Modal para EQUIPOS/ATTA Teams: detalle de un partido individual ──
    if ((torneo.modalidad === 'EQUIPOS' || torneo.modalidad === 'ATTA_TEAMS') && detalleSeleccionado) {
        // Las alineaciones se configuran una sola vez por GRUPO en el
        // wizard y se guardan en `detalle.jugadores`. Aquí las mostramos
        // como read-only tag list (sin dropdowns). Si la alineación no
        // está guardada, mostramos un banner informativo.
        const jugadoresLocalDetalle = detalleSeleccionado.jugadores.filter(j => j.lado === 'LOCAL')
        const jugadoresVisitDetalle = detalleSeleccionado.jugadores.filter(j => j.lado === 'VISITANTE')
        const hayAlineacion = jugadoresLocalDetalle.length > 0 && jugadoresVisitDetalle.length > 0
        return (
            <Modal
                isOpen
                onClose={() => setDetalleSeleccionado(null)}
                title={`${detalleSeleccionado.orden}. ${detalleSeleccionado.tipo === 'DOBLES' ? 'Dobles' : 'Individual'}`}
                description="Alineación preasignada por el wizard del grupo · registra los sets al mejor de 5"
                size="lg"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDetalleSeleccionado(null)} disabled={guardando}>
                            Atrás
                        </Button>
                        <Button variant="primary" onClick={guardarDetalle} isLoading={guardando}>
                            Guardar partido
                        </Button>
                    </>
                }
            >
                {!hayAlineacion && (
                    <div className="banner banner-warning mb-4 inline-flex items-center gap-1.5 text-xs">
                        <ExclamationTriangleIcon className="h-4 w-4" />
                        <span>
                            Este detalle no tiene alineación guardada. Cierra, abre el
                            <b> wizard de alineación del grupo</b> y vuelve a entrar.
                        </span>
                    </div>
                )}
                <div className="grid grid-cols-2 gap-4 mb-5">
                    {(['LOCAL', 'VISITANTE'] as const).map(lado => {
                        const integrantes = lado === 'LOCAL'
                            ? jugadoresLocalDetalle
                            : jugadoresVisitDetalle
                        const titulo = lado === 'LOCAL'
                            ? nombreParticipante(seleccionado.participante_local)
                            : nombreParticipante(seleccionado.participante_visitante)
                        return (
                            <div key={lado}>
                                <p className="text-sm font-semibold mb-2">{titulo}</p>
                                {integrantes.length === 0 ? (
                                    <div className="text-xs text-fg-muted italic">
                                        Sin jugadores asignados
                                    </div>
                                ) : (
                                    <div className="space-y-1.5">
                                        {integrantes.map((j, idx) => (
                                            <div
                                                key={`${j.jugador_id}-${idx}`}
                                                className="flex items-center gap-1.5 px-2 py-1 bg-brand-soft border border-brand rounded text-sm"
                                            >
                                                <span className="font-mono text-brand text-xs">{j.jugadores.id}</span>
                                                <span className="text-fg font-medium flex-1 truncate">{j.jugadores.nombre}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
                <MarcadoresInput marcadores={marcadores} setMarcadores={setMarcadores} />
            </Modal>
        )
    }

    const manejarEnter = () => {
        guardarResultado()
        if (seleccionadoEsUltimoPendiente) {
            window.setTimeout(() => cerrar(), 0)
        }
    }

    // ── Modal INDIVIDUAL / DOBLES: registrar resultado con navegación ──
    const tieneBorrador = !!borradores[seleccionado.id]
    return (
        <Modal
            isOpen
            onClose={cerrar}
            title={seleccionado.estado === 'FINALIZADO' ? 'Resultado registrado' : 'Registrar resultado'}
            description={`${nombreParticipante(seleccionado.participante_local)} vs ${nombreParticipante(seleccionado.participante_visitante)}`}
            size="md"
            footer={
                <>
                    {seleccionado.estado === 'FINALIZADO' && (
                        <Button
                            variant="danger"
                            onClick={deshacerResultado}
                            isLoading={guardando}
                            leadingIcon={<ArrowPathIcon className="h-4 w-4" />}
                        >
                            Deshacer resultado
                        </Button>
                    )}
                    {seleccionado.estado !== 'FINALIZADO' && (
                        <Button
                            variant="secondary"
                            onClick={irAnterior}
                            disabled={!hayAnterior}
                        >
                            ← Anterior
                        </Button>
                    )}
                    {seleccionado.estado !== 'FINALIZADO' && (
                        <Button
                            variant="primary"
                            onClick={() => {
                                guardarResultado()
                                // Si era el último pendiente, ya añadimos al
                                // borrador dentro de `guardarResultado` (que
                                // no cerró el modal por sí mismo). Cerramos
                                // aquí para que el botón "Cerrar grupo"
                                // cumpla su palabra.
                                if (seleccionadoEsUltimoPendiente) {
                                    // Usamos `setTimeout(0)` para que el
                                    // `setBorradores` se haya aplicado al
                                    // toast de cierre (que lee del state
                                    // capturado en este closure).
                                    window.setTimeout(() => cerrar(), 0)
                                }
                            }}
                        >
                            {seleccionadoEsUltimoPendiente
                                ? 'Cerrar grupo'
                                : haySiguiente ? 'Guardar y siguiente' : 'Guardar resultado'}
                            <kbd className="ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[0.65rem] font-mono font-bold rounded bg-brand-soft text-brand border border-brand/40">
                                ↵
                            </kbd>
                        </Button>
                    )}
                    {seleccionado.estado === 'FINALIZADO' && (
                        <Button
                            variant="secondary"
                            onClick={haySiguiente ? irSiguiente : cerrar}
                        >
                            {haySiguiente ? 'Siguiente →' : 'Cerrar'}
                        </Button>
                    )}
                </>
            }
        >
            {tieneBorrador && seleccionado.estado !== 'FINALIZADO' && (
                <div className="banner banner-warning mb-3 inline-flex items-center gap-1.5 text-xs">
                    <ExclamationTriangleIcon className="h-4 w-4" />
                    {seleccionadoEsUltimoPendiente
                        ? 'Último partido del grupo listo. Cierra y pulsa "Guardar cambios" en la vista principal para enviar.'
                        : 'Borrador sin enviar para este partido.'}
                </div>
            )}
            <MarcadoresInput
                ref={marcadoresRef}
                marcadores={marcadores}
                setMarcadores={setMarcadores}
                disabled={seleccionado.estado === 'FINALIZADO'}
                onEnter={manejarEnter}
            />
            <p className="text-xs text-fg-muted mt-4">
                Ingresa solo los sets jugados. El ganador debe llegar a 3 sets.
            </p>
            <p className="text-xs text-fg-muted mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1">
                    <kbd className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[0.65rem] font-mono font-bold rounded bg-surface text-fg border border-line">
                        ↑
                    </kbd>
                    <kbd className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[0.65rem] font-mono font-bold rounded bg-surface text-fg border border-line">
                        ↓
                    </kbd>
                    <kbd className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[0.65rem] font-mono font-bold rounded bg-surface text-fg border border-line">
                        ←
                    </kbd>
                    <kbd className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[0.65rem] font-mono font-bold rounded bg-surface text-fg border border-line">
                        →
                    </kbd>
                    navegar
                </span>
                <span className="inline-flex items-center gap-1">
                    <kbd className="inline-flex items-center justify-center h-5 px-1.5 text-[0.65rem] font-mono font-bold rounded bg-surface text-fg border border-line">
                        Enter
                    </kbd>
                    guardar y siguiente
                </span>
                <span className="inline-flex items-center gap-1">
                    <kbd className="inline-flex items-center justify-center h-5 px-1.5 text-[0.65rem] font-mono font-bold rounded bg-surface text-fg border border-line">
                        Esc
                    </kbd>
                    cerrar
                </span>
            </p>
        </Modal>
    )
}

interface MarcadoresInputProps {
    marcadores: { local: string; visitante: string }[]
    setMarcadores: React.Dispatch<React.SetStateAction<{ local: string; visitante: string }[]>>
    disabled?: boolean
    /** Acción al pulsar Enter en un input. Si no se provee, Enter no hace nada. */
    onEnter?: () => void
}
interface MarcadoresInputHandle {
    /** Pone el foco en el input del set 1, local, y selecciona su contenido. */
    focusPrimerInput: () => void
}

const MarcadoresInput = forwardRef<MarcadoresInputHandle, MarcadoresInputProps>(function MarcadoresInput({
    marcadores,
    setMarcadores,
    disabled = false,
    onEnter,
}, ref) {
    // Refs a los inputs para mover el foco por teclado sin re-renderizar.
    // La clave es `${lado}-${index}`.
    const refs = useRef<Record<string, HTMLInputElement | null>>({})
    const containerRef = useRef<HTMLDivElement | null>(null)

    useImperativeHandle(ref, () => ({
        focusPrimerInput: () => {
            const primerInput = refs.current['local-0']
            primerInput?.focus()
            primerInput?.select()
        },
    }), [])

    /**
     * Devuelve la celda adyacente en la dirección indicada, o `null` si no
     * hay vecino (estamos en un extremo). La rejilla es 5 filas × 2 columnas
     * (local | visitante).
     */
    const vecino = (lado: 'local' | 'visitante', index: number, dir: 'arriba' | 'abajo' | 'izquierda' | 'derecha') => {
        if (dir === 'arriba' && index > 0) return { lado, index: index - 1 }
        if (dir === 'abajo' && index < marcadores.length - 1) return { lado, index: index + 1 }
        if (dir === 'izquierda' && lado === 'visitante') return { lado: 'local', index }
        if (dir === 'derecha' && lado === 'local') return { lado: 'visitante', index }
        return null
    }

    /**
     * Devuelve `true` si el cursor está en el extremo desde el que tendría
     * sentido "salir" del input actual. Para la flecha izquierda y arriba,
     * el cursor debe estar al inicio (selectionStart === 0). Para la flecha
     * derecha y abajo, al final (selectionStart === value.length).
     */
    const enExtremo = (e: React.KeyboardEvent<HTMLInputElement>, dir: 'arriba' | 'abajo' | 'izquierda' | 'derecha') => {
        const target = e.currentTarget
        const { selectionStart, selectionEnd, value } = target
        if (selectionStart === null || selectionEnd === null) return true
        if (dir === 'arriba' || dir === 'izquierda') {
            return selectionStart === 0 && selectionEnd === 0
        }
        return selectionStart === value.length && selectionEnd === value.length
    }

    const manejarTecla = (e: React.KeyboardEvent<HTMLInputElement>, lado: 'local' | 'visitante', index: number) => {
        // Permitimos que el navegador haga su trabajo si hay una selección o
        // el cursor no está en el extremo. Solo "robamos" la flecha cuando
        // movernos dentro del input no tendría sentido.
        if (e.key === 'ArrowUp') {
            e.preventDefault()
            if (enExtremo(e, 'arriba')) {
                const dest = vecino(lado, index, 'arriba')
                if (dest) refs.current[`${dest.lado}-${dest.index}`]?.focus()
            } else {
                // Mover cursor al inicio del input.
                const target = e.currentTarget
                target.setSelectionRange(0, 0)
            }
            return
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (enExtremo(e, 'abajo')) {
                const dest = vecino(lado, index, 'abajo')
                if (dest) refs.current[`${dest.lado}-${dest.index}`]?.focus()
            } else {
                const target = e.currentTarget
                const len = target.value.length
                target.setSelectionRange(len, len)
            }
            return
        }
        if (e.key === 'ArrowLeft') {
            if (enExtremo(e, 'izquierda')) {
                const dest = vecino(lado, index, 'izquierda')
                if (dest) {
                    e.preventDefault()
                    refs.current[`${dest.lado}-${dest.index}`]?.focus()
                }
            }
            return
        }
        if (e.key === 'ArrowRight') {
            if (enExtremo(e, 'derecha')) {
                const dest = vecino(lado, index, 'derecha')
                if (dest) {
                    e.preventDefault()
                    refs.current[`${dest.lado}-${dest.index}`]?.focus()
                }
            }
            return
        }
        if (e.key === 'Enter') {
            if (onEnter) {
                e.preventDefault()
                onEnter()
            }
        }
    }

    return (
        <div className="space-y-2" ref={containerRef}>
            {marcadores.map((marcador, index) => (
                <div key={index} className="grid grid-cols-[1fr_64px_auto_64px_1fr] items-center gap-2">
                    <span className="text-right text-sm text-fg-muted">{index + 1}. set</span>
                    <input
                        ref={el => { refs.current[`local-${index}`] = el }}
                        inputMode="numeric"
                        disabled={disabled}
                        value={marcador.local}
                        data-set-idx={index}
                        data-lado="local"
                        onKeyDown={e => manejarTecla(e, 'local', index)}
                        onChange={e => setMarcadores(prev => prev.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, local: e.target.value.replace(/\D/g, '') } : item
                        ))}
                        className="input-base text-center"
                    />
                    <span className="text-center text-fg-muted font-bold">:</span>
                    <input
                        ref={el => { refs.current[`visitante-${index}`] = el }}
                        inputMode="numeric"
                        disabled={disabled}
                        value={marcador.visitante}
                        data-set-idx={index}
                        data-lado="visitante"
                        onKeyDown={e => manejarTecla(e, 'visitante', index)}
                        onChange={e => setMarcadores(prev => prev.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, visitante: e.target.value.replace(/\D/g, '') } : item
                        ))}
                        className="input-base text-center"
                    />
                    <span className="text-xs text-fg-muted">a 11</span>
                </div>
            ))}
        </div>
    )
})
