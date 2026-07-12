'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'

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
    modalidad: 'INDIVIDUAL' | 'DOBLES' | 'EQUIPOS'
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
    const [alineacionLocal, setAlineacionLocal] = useState<string[]>([])
    const [alineacionVisitante, setAlineacionVisitante] = useState<string[]>([])
    const [marcadores, setMarcadores] = useState(Array.from({ length: 5 }, () => ({ local: '', visitante: '' })))
    const [guardando, setGuardando] = useState(false)

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

    // Cada vez que se abre un partido, precargamos los marcadores con los
    // sets ya guardados (si FINALIZADO) o con el borrador en memoria.
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

    const cambiarAlineacion = (lado: 'LOCAL' | 'VISITANTE', indice: number, valor: string) => {
        const setter = lado === 'LOCAL' ? setAlineacionLocal : setAlineacionVisitante
        setter(prev => {
            const next = [...prev]
            next[indice] = valor
            return next
        })
    }

    const abrirDetalle = (detalle: DetalleEquipo) => {
        if (!seleccionado || detalle.estado === 'FINALIZADO') return
        setDetalleSeleccionado(detalle)
        const locales = detalle.jugadores.filter(jugador => jugador.lado === 'LOCAL').map(jugador => String(jugador.jugador_id))
        const visitantes = detalle.jugadores.filter(jugador => jugador.lado === 'VISITANTE').map(jugador => String(jugador.jugador_id))
        setAlineacionLocal(locales)
        setAlineacionVisitante(visitantes)
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
        setGuardando(true)
        try {
            const response = await fetch(
                `/api/torneos/${torneo.id}/partidos/${seleccionado.id}/detalles/${detalleSeleccionado.id}`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jugadoresLocalIds: alineacionLocal.map(Number),
                        jugadoresVisitanteIds: alineacionVisitante.map(Number),
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
        const sets = marcadores
            .filter(set => set.local !== '' || set.visitante !== '')
            .map(set => ({ local: Number(set.local), visitante: Number(set.visitante) }))
        if (sets.length === 0) {
            toast.error('Ingresa al menos un set antes de pasar al borrador')
            return
        }
        onBorradoresChange({ ...borradores, [seleccionado.id]: { sets } })
        toast.success('Resultado añadido al borrador')
        // Tras añadir al borrador, saltamos al siguiente partido pendiente
        // del grupo (que es lo que el usuario estaba haciendo en masa).
        if (haySiguiente) irSiguiente()
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

    const cerrar = () => {
        if (Object.keys(borradores).length > 0) {
            const cantidad = Object.keys(borradores).length
            toast(`Tienes ${cantidad} borrador${cantidad === 1 ? '' : 'es'} sin enviar`, { icon: '📝' })
        }
        onClose()
    }

    if (!isOpen || !seleccionado) return null

    const numeroBorradores = Object.keys(borradores).length

    // ── Modal para EQUIPOS: lista de partidos de la serie ──
    if (torneo.modalidad === 'EQUIPOS' && !detalleSeleccionado) {
        return (
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
                        <Button variant="secondary" onClick={cerrar}>Cerrar</Button>
                    </>
                }
            >
                <div className="space-y-2">
                    {seleccionado.detalles.map(detalle => {
                        const finalizado = detalle.estado === 'FINALIZADO'
                        return (
                            <button
                                key={detalle.id}
                                disabled={finalizado}
                                onClick={() => abrirDetalle(detalle)}
                                className="w-full flex items-center justify-between card-flush px-4 py-3 text-left hover:bg-subtle disabled:opacity-60 disabled:hover:bg-surface transition-colors"
                            >
                                <span className="font-semibold text-fg">
                                    {detalle.orden}. {detalle.tipo === 'DOBLES' ? 'Dobles' : 'Individual'}
                                </span>
                                <span className={finalizado ? 'text-success font-bold' : 'text-warning font-bold'}>
                                    {finalizado ? `${detalle.sets_local} : ${detalle.sets_visitante}` : 'Registrar'}
                                </span>
                            </button>
                        )
                    })}
                </div>
            </Modal>
        )
    }

    // ── Modal para EQUIPOS: detalle de un partido individual ──
    if (torneo.modalidad === 'EQUIPOS' && detalleSeleccionado) {
        return (
            <Modal
                isOpen
                onClose={() => setDetalleSeleccionado(null)}
                title={`${detalleSeleccionado.orden}. ${detalleSeleccionado.tipo === 'DOBLES' ? 'Dobles' : 'Individual'}`}
                description="Selecciona las alineaciones y registra los sets al mejor de 5"
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
                <div className="grid grid-cols-2 gap-4 mb-5">
                    {(['LOCAL', 'VISITANTE'] as const).map(lado => {
                        const integrantes = lado === 'LOCAL'
                            ? seleccionado.participante_local.miembros
                            : seleccionado.participante_visitante.miembros
                        const alineacion = lado === 'LOCAL' ? alineacionLocal : alineacionVisitante
                        const cantidad = detalleSeleccionado.tipo === 'DOBLES' ? 2 : 1
                        const titulo = lado === 'LOCAL'
                            ? nombreParticipante(seleccionado.participante_local)
                            : nombreParticipante(seleccionado.participante_visitante)
                        return (
                            <div key={lado}>
                                <p className="text-sm font-semibold mb-2">{titulo}</p>
                                {Array.from({ length: cantidad }, (_, indice) => (
                                    <Select
                                        key={indice}
                                        value={alineacion[indice] || ''}
                                        onChange={e => cambiarAlineacion(lado, indice, e.target.value)}
                                        className="mb-2"
                                    >
                                        <option value="">Selecciona jugador</option>
                                        {integrantes.map(miembro => (
                                            <option key={miembro.jugador_id} value={miembro.jugador_id}>
                                                {miembro.jugadores.nombre}
                                            </option>
                                        ))}
                                    </Select>
                                ))}
                            </div>
                        )
                    })}
                </div>
                <MarcadoresInput marcadores={marcadores} setMarcadores={setMarcadores} />
            </Modal>
        )
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
                        <Button variant="primary" onClick={guardarResultado}>
                            {haySiguiente ? 'Guardar y siguiente' : 'Guardar resultado'}
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
                    Hay un borrador sin enviar para este partido.
                </div>
            )}
            <MarcadoresInput
                marcadores={marcadores}
                setMarcadores={setMarcadores}
                disabled={seleccionado.estado === 'FINALIZADO'}
            />
            <p className="text-xs text-fg-muted mt-4">
                Ingresa solo los sets jugados. El ganador debe llegar a 3 sets.
            </p>
        </Modal>
    )
}

function MarcadoresInput({
    marcadores,
    setMarcadores,
    disabled = false,
}: {
    marcadores: { local: string; visitante: string }[]
    setMarcadores: React.Dispatch<React.SetStateAction<{ local: string; visitante: string }[]>>
    disabled?: boolean
}) {
    return (
        <div className="space-y-2">
            {marcadores.map((marcador, index) => (
                <div key={index} className="grid grid-cols-[1fr_64px_auto_64px_1fr] items-center gap-2">
                    <span className="text-right text-sm text-fg-muted">{index + 1}. set</span>
                    <input
                        inputMode="numeric"
                        disabled={disabled}
                        value={marcador.local}
                        onChange={e => setMarcadores(prev => prev.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, local: e.target.value.replace(/\D/g, '') } : item
                        ))}
                        className="input-base text-center"
                    />
                    <span className="text-center text-fg-muted font-bold">:</span>
                    <input
                        inputMode="numeric"
                        disabled={disabled}
                        value={marcador.visitante}
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
}
