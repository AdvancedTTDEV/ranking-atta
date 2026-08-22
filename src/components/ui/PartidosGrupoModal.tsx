'use client'

import { useEffect, useState } from 'react'
import {
    ArrowDownTrayIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ExclamationTriangleIcon,
    UsersIcon,
    Bars3Icon,
} from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { arrastrarComoTarjeta } from '@/lib/ui/arrastrar-como-tarjeta'

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

/** Bloque de un equipo apilado verticalmente: nombre + integrantes,
 *  ambos truncados. Los cards son más altos para que nombres largos no
 *  se peleen el ancho con el árbitro ni colapsen a una letra. */
function BloqueEquipo({ participante }: { participante: Participante }) {
    return (
        <span className="min-w-0">
            <span className="block text-sm font-semibold text-fg truncate leading-tight">
                {nombreParticipante(participante)}
            </span>
            {participante.miembros.length > 0 && (
                <span className="block text-[11px] text-fg-muted truncate leading-tight mt-0.5">
                    {participante.miembros.map(miembro => miembro.jugadores.nombre).join(' · ')}
                </span>
            )}
        </span>
    )
}

interface Props {
    isOpen: boolean
    onClose: () => void
    grupo: GrupoLite | null
    /** Borradores en memoria: si un partido.id está aquí, se marca como borrador. */
    borradores: Record<number, { sets: { local: number; visitante: number }[] }>
    onSelectPartido: (partidoId: number) => void
    /** Abre el wizard de alineación para UN partido (modalidades por equipos). */
    onConfigurarAlineacionPartido?: (partidoId: number) => void
    /** Descarga la hoja de partidos (PNG) del encuentro SIN abrir el wizard. */
    onDescargarHojaPartido?: (partidoId: number) => void
    /** ID del partido cuya hoja se está generando (estado de carga en su botón). */
    descargandoHojaId?: number | null
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
    onDescargarHojaPartido,
    descargandoHojaId,
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
        try {
            e.dataTransfer.setData('text/plain', String(partidoId))
        } catch {
            // Algunos navegadores móviles no exponen setData; seguimos sin él.
        }
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
                    const arrastrandoEste = draggingId === partido.id
                    const descargandoEstaHoja = descargandoHojaId === partido.id
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
                            data-arraastre
                            className={`w-full p-3 text-left card-flush overflow-hidden transition-all flex flex-col gap-2 ${
                                esDragOver
                                    ? 'ring-2 ring-brand bg-brand/5'
                                    : 'hover:bg-subtle'
                            } ${arrastrandoEste ? 'opacity-40 scale-[0.99]' : ''}`}
                        >
                            <div className="flex items-stretch gap-2">
                                {/* Handle de arrastre + número de orden */}
                                <span
                                    draggable={esArrastrable}
                                    onDragStart={(e) => {
                                        // Ghost kanban: tarjeta completa elevada,
                                        // no el screenshot plano del navegador.
                                        if (esArrastrable) arrastrarComoTarjeta(e)
                                        handleDragStart(e, partido.id)
                                    }}
                                    onDragOver={(e) => handleDragOver(e, partido.id)}
                                    onDragEnd={handleDragEnd}
                                    onDrop={(e) => handleDrop(e, partido.id)}
                                    onClick={(e) => e.stopPropagation()}
                                    className={`flex items-center gap-1 shrink-0 self-start ${
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
                                {/* Contenido clickable: equipos apilados uno arriba del otro */}
                                <button
                                    type="button"
                                    onClick={() => onSelectPartido(partido.id)}
                                    className="flex-1 min-w-0 flex items-center gap-3 text-left"
                                >
                                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                        <BloqueEquipo participante={partido.participante_local} />
                                        {finalizado ? (
                                            <span className="my-0.5 font-mono text-sm font-bold text-brand leading-none">
                                                {partido.sets_local} : {partido.sets_visitante}
                                            </span>
                                        ) : (
                                            <span className="my-0.5 text-[10px] font-bold uppercase tracking-[0.25em] text-fg-muted leading-none">vs</span>
                                        )}
                                        <BloqueEquipo participante={partido.participante_visitante} />
                                    </div>
                                </button>
                                {/* Descargar hoja de partidos sin abrir el wizard */}
                                {onDescargarHojaPartido && (
                                    <button
                                        type="button"
                                        title="Descargar hoja de partidos (PNG)"
                                        aria-label={`Descargar hoja de partidos del encuentro #${partido.orden}`}
                                        disabled={descargandoEstaHoja}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            onDescargarHojaPartido(partido.id)
                                        }}
                                        className={`self-center shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                                            descargandoEstaHoja
                                                ? 'border-brand bg-brand-soft text-brand animate-pulse'
                                                : 'border-line text-fg-muted hover:text-brand hover:bg-brand-soft'
                                        }`}
                                    >
                                        <ArrowDownTrayIcon className="h-5 w-5" aria-hidden="true" />
                                    </button>
                                )}
                            </div>
                            {/* Meta: árbitro, estado y acceso a alineación */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-10 text-xs text-fg-muted">
                                <span>
                                    Árbitro: <b className="text-fg">{partido.arbitro?.nombre || 'Asignar'}</b>
                                </span>
                                {!finalizado && (
                                    <Badge variant={alineado ? 'success' : 'warning'}>
                                        {alineado ? 'Alineado' : 'Sin alinear'}
                                    </Badge>
                                )}
                                {tieneBorrador && (
                                    <Badge variant="warning">
                                        <span className="inline-flex items-center gap-1">
                                            <ExclamationTriangleIcon className="h-3 w-3" />
                                            Borrador
                                        </span>
                                    </Badge>
                                )}
                                {finalizado && !tieneBorrador && (
                                    <Badge variant="success">Finalizado</Badge>
                                )}
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
                                        className={`ml-auto shrink-0 text-[0.65rem] hover:underline inline-flex items-center gap-1 ${alineado ? 'text-fg-muted' : 'text-brand'}`}
                                    >
                                        <UsersIcon className="h-3 w-3" />
                                        {alineado ? 'Cambiar alineación' : 'Alineación'}
                                    </button>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </Modal>
    )
}
