'use client'

import { ChevronLeftIcon, ChevronRightIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
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
    indiceGrupo: number
    totalGrupos: number
    onPrevGrupo: () => void
    onNextGrupo: () => void
}

export default function PartidosGrupoModal({
    isOpen,
    onClose,
    grupo,
    borradores,
    onSelectPartido,
    indiceGrupo,
    totalGrupos,
    onPrevGrupo,
    onNextGrupo,
}: Props) {
    if (!grupo) return null
    const hayAnterior = indiceGrupo > 0
    const haySiguiente = indiceGrupo < totalGrupos - 1
    const finalizados = grupo.partidos.filter(p => p.estado === 'FINALIZADO').length
    const conBorrador = grupo.partidos.filter(p => !!borradores[p.id]).length

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Grupo ${grupo.numero} · ${grupo.partidos.length} cruce${grupo.partidos.length === 1 ? '' : 's'}`}
            description={`${finalizados} finalizado${finalizados === 1 ? '' : 's'} · ${grupo.partidos.length - finalizados} pendiente${grupo.partidos.length - finalizados === 1 ? '' : 's'}${conBorrador > 0 ? ` · ${conBorrador} borrador${conBorrador === 1 ? '' : 'es'}` : ''}`}
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
            <div className="space-y-2">
                {grupo.partidos.map(partido => {
                    const finalizado = partido.estado === 'FINALIZADO'
                    const tieneBorrador = !!borradores[partido.id]
                    return (
                        <div
                            key={partido.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => onSelectPartido(partido.id)}
                            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelectPartido(partido.id)}
                            className="w-full p-3 text-left card-flush overflow-hidden hover:bg-subtle transition-colors flex flex-col sm:flex-row sm:items-center gap-2 cursor-pointer"
                        >
                            <span className="chip w-7 text-center shrink-0">#{partido.orden}</span>
                            <span className="flex-1 font-semibold text-fg truncate">
                                {nombreParticipante(partido.participante_local)}
                            </span>
                            <span className="font-mono font-bold text-fg text-sm">
                                {finalizado
                                    ? `${partido.sets_local} : ${partido.sets_visitante}`
                                    : <span className="text-fg-muted font-normal">vs</span>}
                            </span>
                            <span className="flex-1 font-semibold text-fg truncate">
                                {nombreParticipante(partido.participante_visitante)}
                            </span>
                            <span className="text-xs text-fg-muted hidden md:inline shrink-0">
                                Árbitro: <b className="text-fg">{partido.arbitro?.nombre || 'Asignar'}</b>
                            </span>
                            {tieneBorrador ? (
                                <Badge variant="warning">
                                    <span className="inline-flex items-center gap-1">
                                        <ExclamationTriangleIcon className="h-3 w-3" />
                                        Borrador
                                    </span>
                                </Badge>
                            ) : (
                                <Badge variant={finalizado ? 'success' : 'warning'}>
                                    {finalizado ? 'Finalizado' : 'Registrar'}
                                </Badge>
                            )}
                        </div>
                    )
                })}
            </div>
        </Modal>
    )
}
