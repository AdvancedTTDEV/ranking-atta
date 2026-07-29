'use client'

import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { ChevronUpIcon, ChevronDownIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

interface Posicion {
    participante_id: number
    nombre: string
    /** Posición que el sistema ya le asignó (estable). */
    posicion: number
    /** Posición empatada con otros del bloque (opcional para compat). */
    posicion_empatada?: number
    victorias: number
    derrotas: number
    setsFavor: number
    setsContra: number
    puntosFavor: number
    puntosContra: number
}

interface Props {
    isOpen: boolean
    onClose: () => void
    torneoId: number
    grupoId: number
    grupoNumero: number
    pendientesIds: number[]
    posiciones: Posicion[]
    onGuardado: () => void
}

/**
 * Modal para que el usuario resuelva un empate de clasificación que el
 * sistema no puede desempatar (mismo W, mismo ratio de sets, mismo ratio
 * de puntos). El operador reordena con ↑/↓ y al guardar persiste
 * `torneo_grupo_participantes.posicion` en BD, lo que se usa como
 * desempate en el GET de partidos y como siembra para las llaves.
 */
export default function ResolverEmpateModal({
    isOpen,
    onClose,
    torneoId,
    grupoId,
    grupoNumero,
    pendientesIds,
    posiciones,
    onGuardado,
}: Props) {
    // El orden editable contiene SOLO los participantes empatados, en el
    // orden actual del backend. Al reordenarlos con ↑/↓ el operador decide
    // quién pasa primero, segundo, etc.
    const [orden, setOrden] = useState<Posicion[]>([])
    const [guardando, setGuardando] = useState(false)

    // Sincronizamos el orden cuando se abre el modal o cambian los pendientes.
    useEffect(() => {
        if (!isOpen) return
        const setPendientes = new Set(pendientesIds)
        setOrden(posiciones.filter(p => setPendientes.has(p.participante_id)))
    }, [isOpen, pendientesIds, posiciones])

    if (!isOpen) return null
    if (orden.length < 2) {
        // No hay nada que resolver (el operador abrió el modal por error,
        // o el backend ya asignó posiciones y limpió el empate).
        return (
            <Modal
                isOpen
                onClose={onClose}
                title={`Resolver empate · Grupo ${grupoNumero}`}
                size="sm"
                footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}
            >
                <p className="text-sm text-fg-muted">
                    No hay empates pendientes en este grupo.
                </p>
            </Modal>
        )
    }

    // Calculamos el "slot" que ocupa este bloque de empates dentro del
    // ranking total. El bloque puede estar en cualquier posición: 1°-3° si
    // es el primero del ranking, 2°-4° si hay un líder por encima, etc.
    // El primero del orden editable va a `posicionBase`, el segundo a
    // `posicionBase + 1`, etc. Se envía así al backend, que persiste cada
    // posición con un offset (1000+) para distinguir "manual" de "sembrado".
    const posicionBase = orden[0].posicion_empatada ?? orden[0].posicion

    const mover = (index: number, delta: -1 | 1) => {
        const nuevo = [...orden]
        const target = index + delta
        if (target < 0 || target >= nuevo.length) return
        ;[nuevo[index], nuevo[target]] = [nuevo[target], nuevo[index]]
        setOrden(nuevo)
    }

    const guardar = async () => {
        setGuardando(true)
        try {
            // Solo enviamos los participantes del bloque reordenado, con
            // sus nuevas posiciones. El backend persiste estas y los
            // no-pendientes mantienen su posición actual de BD.
            const posicionesFinales = orden.map((p, idx) => ({
                participante_id: p.participante_id,
                posicion: posicionBase + idx
            }))
            const response = await fetch(`/api/torneos/${torneoId}/grupos/${grupoId}/posiciones`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ posiciones: posicionesFinales })
            })
            if (!response.ok) {
                const data = await response.json().catch(() => ({}))
                throw new Error(data.error || `HTTP ${response.status}`)
            }
            toast.success('Posiciones guardadas · El empate quedó resuelto')
            onGuardado()
            onClose()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Error al guardar el orden')
        } finally {
            setGuardando(false)
        }
    }

    return (
        <Modal
            isOpen
            onClose={onClose}
            title={`Resolver empate · Grupo ${grupoNumero}`}
            description="Reordena los participantes empatados. La posición asignada se usa para sembrar las llaves."
            size="lg"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={guardando}>
                        Cancelar
                    </Button>
                    <Button variant="primary" onClick={guardar} isLoading={guardando}>
                        Guardar orden
                    </Button>
                </>
            }
        >
            <div className="mb-3 flex items-start gap-2 p-3 rounded-md bg-warning-soft/40 border border-warning">
                <ExclamationTriangleIcon className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                <div className="text-xs text-fg">
                    <p className="font-semibold mb-0.5">Empate no resuelto automáticamente</p>
                    <p className="text-fg-muted">
                        Todos estos participantes tienen las mismas victorias, el mismo
                        ratio de sets y el mismo ratio de puntos. El sistema no puede
                        decidir quién pasa primero: asigna el orden manualmente.
                    </p>
                </div>
            </div>
            <ul className="space-y-2">
                {orden.map((participante, index) => (
                    <li
                        key={participante.participante_id}
                        className="card-flush flex items-center gap-2 p-3"
                    >
                        <span className="chip w-10 text-center font-bold">
                            {posicionBase + index}°
                        </span>
                        <div className="flex-1 min-w-0">
                            <p className="font-semibold text-fg truncate">{participante.nombre}</p>
                            <p className="text-xs text-fg-muted font-mono">
                                {participante.victorias}V · {participante.derrotas}D ·{' '}
                                {participante.setsFavor}-{participante.setsContra} sets ·{' '}
                                {participante.puntosFavor}-{participante.puntosContra} pts
                            </p>
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <button
                                type="button"
                                onClick={() => mover(index, -1)}
                                disabled={index === 0}
                                aria-label="Subir"
                                className="btn btn-ghost btn-icon btn-sm"
                            >
                                <ChevronUpIcon className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => mover(index, 1)}
                                disabled={index === orden.length - 1}
                                aria-label="Bajar"
                                className="btn btn-ghost btn-icon btn-sm"
                            >
                                <ChevronDownIcon className="h-4 w-4" />
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
        </Modal>
    )
}
