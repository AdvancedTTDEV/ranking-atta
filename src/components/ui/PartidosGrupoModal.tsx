'use client'

import { useEffect, useState } from 'react'
import {
    ChevronLeftIcon,
    ChevronRightIcon,
    ExclamationTriangleIcon,
    UsersIcon,
    Bars3Icon,
} from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

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
    torneo_grupos: { id: number; numero_grupo: number } | null
    participante_local: Participante
    participante_visitante: Participante
    arbitro: Jugador | null
    sets: SetPartido[]
    detalles: DetalleEquipo[]
}
export interface GrupoLite {
    id: number
    numero: number
    partidos: Partido[]
}

const nombreParticipante = (participante: Participante) =>
    participante.nombre_personalizado?.trim()
    || participante.miembros.map(miembro => miembro.jugadores.nombre).join(' / ')
    || participante.jugadores?.nombre
    || 'Participante'

interface Props {
    isOpen: boolean
    onClose: () => void
    grupo: GrupoLite | null
    /** Borradores en memoria: si un partido.id está aquí, se marca como borrador. */
    borradores: Record<number, { sets: { local: number; visitante: number }[] }>
    onSelectPartido: (partidoId: number) => void
    /** Abre el wizard de alineación para UN partido (modalidades por equipos). */
    onConfigurarAlineacionPartido?: (partidoId: number) => void
    indiceGrupo: number
    totalGrupos: number
    onPrevGrupo: () => void
    onNextGrupo: () => void
    /** Persiste un nuevo orden de cruces del grupo. Devuelve `true` si
     *  tuvo éxito; `false` (o throw) hace rollback del UI optimista. */
    onReordenar?: (nuevoOrdenIds: number[]) => Promise<boolean>
}

export default function PartidosGrupoModal({
    isOpen,
    onClose,
    grupo,
    borradores,
    onSelectPartido,
    onConfigurarAlineacionPartido,
    indiceGrupo,
    totalGrupos,
    onPrevGrupo,
    onNextGrupo,
    onReordenar,
}: Props) {
    // Estado local de reorden: empezamos con el orden del grupo y lo
    // mutamos optimistamente; si el backend rechaza, hacemos rollback.
    const [ordenLocal, setOrdenLocal] = useState<number[]>([])
    const [draggingId, setDraggingId] = useState<number | null>(null)
    const [dragOverId, setDragOverId] = useState<number | null>(null)
    const [guardando, setGuardando] = useState(false)

    // Sincronizar ordenLocal con el orden del grupo cada vez que cambia
    // el grupo (o el orden remoto) — clave para cuando navegas entre
    // grupos o cuando el backend reordena y nos devuelve datos nuevos.
    useEffect(() => {
        if (!grupo) return
        const ids = grupo.partidos.map(p => p.id)
        // Si la cantidad o el orden difiere, adoptamos el del grupo.
        const mismo =
            ordenLocal.length === ids.length &&
            ordenLocal.every((id, i) => id === ids[i])
        if (!mismo) setOrdenLocal(ids)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [grupo?.id, grupo?.partidos.map(p => p.id).join(',')])

    if (!grupo) return null

    const partidosVisibles: Partido[] = (() => {
        if (ordenLocal.length === grupo.partidos.length) {
            const byId = new Map(grupo.partidos.map(p => [p.id, p]))
            return ordenLocal.map(id => byId.get(id)).filter(Boolean) as Partido[]
        }
        return grupo.partidos
    })()

    const hayAnterior = indiceGrupo > 0
    const haySiguiente = indiceGrupo < totalGrupos - 1
    const finalizados = grupo.partidos.filter(p => p.estado === 'FINALIZADO').length
    const conBorrador = grupo.partidos.filter(p => !!borradores[p.id]).length
    const permiteReordenar = !!onReordenar && grupo.partidos.some(p => p.estado !== 'FINALIZADO')

    const handleDragStart = (e: React.DragEvent, partidoId: number) => {
        if (!permiteReordenar) {
            e.preventDefault()
            return
        }
        setDraggingId(partidoId)
        e.dataTransfer.effectAllowed = 'move'
        // Necesario para Firefox: dataTransfer.setData con cualquier string.
        try { e.dataTransfer.setData('text/plain', String(partidoId)) } catch {}
    }

    const handleDragOver = (e: React.DragEvent, partidoId: number) => {
        if (!permiteReordenar || draggingId === null) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (partidoId !== dragOverId) setDragOverId(partidoId)
    }

    const handleDragEnd = () => {
        setDraggingId(null)
        setDragOverId(null)
    }

    const handleDrop = async (e: React.DragEvent, targetId: number) => {
        e.preventDefault()
        if (!permiteReordenar || draggingId === null || draggingId === targetId) {
            handleDragEnd()
            return
        }
        const fromIdx = ordenLocal.indexOf(draggingId)
        const toIdx = ordenLocal.indexOf(targetId)
        if (fromIdx === -1 || toIdx === -1) {
            handleDragEnd()
            return
        }
        const siguiente = [...ordenLocal]
        const [moved] = siguiente.splice(fromIdx, 1)
        siguiente.splice(toIdx, 0, moved)
        const previo = ordenLocal
        setOrdenLocal(siguiente)
        setDraggingId(null)
        setDragOverId(null)
        if (!onReordenar) return
        setGuardando(true)
        try {
            const ok = await onReordenar(siguiente)
            if (!ok) setOrdenLocal(previo)
        } catch {
            setOrdenLocal(previo)
        } finally {
            setGuardando(false)
        }
    }

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Grupo ${grupo.numero} · ${grupo.partidos.length} cruce${grupo.partidos.length === 1 ? '' : 's'}`}
            description={`${finalizados} finalizado${finalizados === 1 ? '' : 's'} · ${grupo.partidos.length - finalizados} pendiente${grupo.partidos.length - finalizados === 1 ? '' : 's'}${conBorrador > 0 ? ` · ${conBorrador} borrador${conBorrador === 1 ? '' : 'es'}` : ''}${permiteReordenar ? ' · arrastra el ≡ para reordenar' : ''}`}
            size="lg"
            footer={
                <>
                    <div className="flex items-center gap-2 mr-auto">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={onPrevGrupo}
                            disabled={!hayAnterior}
                            leadingIcon={<ChevronLeftIcon className="h-4 w-4" />}
                        >
                            Grupo anterior
                        </Button>
                        <span className="text-xs text-fg-muted font-mono">
                            {indiceGrupo + 1} / {totalGrupos}
                        </span>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={onNextGrupo}
                            disabled={!haySiguiente}
                            trailingIcon={<ChevronRightIcon className="h-4 w-4" />}
                        >
                            Grupo siguiente
                        </Button>
                    </div>
                    <Button variant="secondary" onClick={onClose}>Cerrar</Button>
                </>
            }
        >
            <div className="space-y-2" aria-busy={guardando}>
                {partidosVisibles.map(partido => {
                    const finalizado = partido.estado === 'FINALIZADO'
                    const tieneBorrador = !!borradores[partido.id]
                    const esArrastrable = permiteReordenar && !finalizado
                    const esDragOver = dragOverId === partido.id && draggingId !== null && draggingId !== partido.id
                    // Estado de alineación: todos los sub-partidos tienen
                    // jugadores en ambos lados.
                    const alineado = (partido.detalles ?? []).length > 0
                        && (partido.detalles ?? []).every(d =>
                            d.jugadores?.some(j => j.lado === 'LOCAL')
                            && d.jugadores?.some(j => j.lado === 'VISITANTE'),
                        )
                    return (
                        <div
                            key={partido.id}
                            className={`w-full p-3 text-left card-flush overflow-hidden transition-colors flex flex-col sm:flex-row sm:items-center gap-2 ${
                                esDragOver
                                    ? 'ring-2 ring-brand bg-brand/5'
                                    : 'hover:bg-subtle'
                            } ${esArrastrable ? 'cursor-pointer' : ''}`}
                        >
                            {/* Handle de arrastre + número de orden */}
                            <span
                                draggable={esArrastrable}
                                onDragStart={(e) => handleDragStart(e, partido.id)}
                                onDragOver={(e) => handleDragOver(e, partido.id)}
                                onDragEnd={handleDragEnd}
                                onDrop={(e) => handleDrop(e, partido.id)}
                                onClick={(e) => e.stopPropagation()}
                                className={`flex items-center gap-1 shrink-0 ${
                                    esArrastrable ? 'cursor-grab active:cursor-grabbing touch-none' : 'cursor-default'
                                }`}
                                aria-label={esArrastrable ? `Arrastrar para reordener cruce ${partido.orden}` : undefined}
                                title={esArrastrable ? 'Arrastra para reordenar' : undefined}
                            >
                                {esArrastrable && (
                                    <Bars3Icon className="h-4 w-4 text-fg-muted" aria-hidden="true" />
                                )}
                                <span className="chip w-7 text-center">#{partido.orden}</span>
                            </span>
                            {/* Contenido clickable */}
                            <button
                                type="button"
                                onClick={() => onSelectPartido(partido.id)}
                                className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-2 text-left"
                            >
                                <span className="flex-1 min-w-0">
                                    <span className="block font-semibold text-fg truncate">
                                        {nombreParticipante(partido.participante_local)}
                                    </span>
                                    {partido.participante_local.miembros.length > 0 && (
                                        <span className="block text-[11px] text-fg-muted truncate">
                                            {partido.participante_local.miembros.map(miembro => miembro.jugadores.nombre).join(' · ')}
                                        </span>
                                    )}
                                </span>
                                <span className="font-mono font-bold text-fg text-sm">
                                    {finalizado
                                        ? `${partido.sets_local} : ${partido.sets_visitante}`
                                        : <span className="text-fg-muted font-normal">vs</span>}
                                </span>
                                <span className="flex-1 min-w-0">
                                    <span className="block font-semibold text-fg truncate">
                                        {nombreParticipante(partido.participante_visitante)}
                                    </span>
                                    {partido.participante_visitante.miembros.length > 0 && (
                                        <span className="block text-[11px] text-fg-muted truncate">
                                            {partido.participante_visitante.miembros.map(miembro => miembro.jugadores.nombre).join(' · ')}
                                        </span>
                                    )}
                                </span>
                            </button>
                            <span className="text-xs text-fg-muted hidden md:inline shrink-0">
                                Árbitro: <b className="text-fg">{partido.arbitro?.nombre || 'Asignar'}</b>
                            </span>
                            {tieneBorrador && (
                                <Badge variant="warning">
                                    <span className="inline-flex items-center gap-1">
                                        <ExclamationTriangleIcon className="h-3 w-3" />
                                        Borrador
                                    </span>
                                </Badge>
                            )}
                            {!finalizado && (
                                <Badge variant={alineado ? 'success' : 'warning'}>
                                    {alineado ? 'Alineado' : 'Sin alinear'}
                                </Badge>
                            )}
                            {finalizado ? (
                                <Badge variant={tieneBorrador ? 'warning' : 'success'}>
                                    {tieneBorrador ? 'Borrador' : 'Finalizado'}
                                </Badge>
                            ) : null}
                            {onConfigurarAlineacionPartido && !finalizado && (
                                <button
                                    type="button"
                                    title={alineado
                                        ? 'Cambiar la alineación (A, B, C vs X, Y, Z) de este encuentro'
                                        : 'Configurar alineación (A, B, C vs X, Y, Z) de este encuentro'}
                                    onClick={e => {
                                        e.stopPropagation()
                                        onConfigurarAlineacionPartido(partido.id)
                                    }}
                                    className={`shrink-0 text-[0.65rem] hover:underline inline-flex items-center gap-1 ${alineado ? 'text-fg-muted' : 'text-brand'}`}
                                >
                                    <UsersIcon className="h-3 w-3" />
                                    {alineado ? 'Cambiar alineación' : 'Alineación'}
                                </button>
                            )}
                        </div>
                    )
                })}
            </div>
        </Modal>
    )
}
