'use client'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { PlayIcon, CheckBadgeIcon, TrophyIcon } from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

type Jugador = { nombre: string }
type Participante = { nombre_personalizado?: string | null; jugadores?: Jugador | null; miembros: { jugadores: Jugador }[] }
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
}
type Torneo = {
    id: number
    nombre: string
    torneo_categorias: { categorias: { id: number; nombre: string } }[]
}

const nombre = (p: Participante | null) =>
    p?.nombre_personalizado
    || p?.miembros.map(m => m.jugadores.nombre).join(' / ')
    || p?.jugadores?.nombre
    || 'BYE'

const ORDEN_RONDAS: Record<string, number> = {
    '32avos': 0,
    '16avos': 1,
    Octavos: 2,
    Cuartos: 3,
    Semifinal: 4,
    'Campeón': 5,
    'Final': 5,
}

export default function LlavesTorneoModal({
    isOpen,
    onClose,
    torneo,
}: {
    isOpen: boolean
    onClose: () => void
    torneo: Torneo | null
}) {
    const categorias = torneo?.torneo_categorias.map(t => t.categorias) || []
    const [categoriaId, setCategoriaId] = useState('')
    const [partidos, setPartidos] = useState<Partido[]>([])
    const [loading, setLoading] = useState(false)
    const [generando, setGenerando] = useState(false)
    const [arrastre, setArrastre] = useState<{ partidoId: number; participanteId: number } | null>(null)
    const [confirmando, setConfirmando] = useState(false)
    const [ganadoresBorrador, setGanadoresBorrador] = useState<Record<number, number>>({})

    useEffect(() => {
        setCategoriaId(categorias[0]?.id.toString() || '')
        setPartidos([])
    }, [torneo])

    const cargar = async () => {
        if (!torneo || !categoriaId) return
        setLoading(true)
        try {
            const r = await fetch(`/api/torneos/${torneo.id}/llaves?categoriaId=${categoriaId}`)
            const d = await r.json()
            if (!r.ok) throw new Error(d.error)
            setPartidos(d.partidos || [])
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudieron cargar las llaves')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { if (isOpen && categoriaId) cargar() }, [isOpen, categoriaId])

    const generar = async () => {
        if (!torneo || !categoriaId) return
        setGenerando(true)
        try {
            const r = await fetch(`/api/torneos/${torneo.id}/llaves`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoriaId: Number(categoriaId), clasificanPorGrupo: 2 }),
            })
            const d = await r.json()
            if (!r.ok) throw new Error(d.error)
            toast.success('Llaves generadas')
            cargar()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al generar llaves')
        } finally {
            setGenerando(false)
        }
    }

    const confirmarTodo = async () => {
        if (!torneo || Object.keys(ganadoresBorrador).length === 0) return
        setConfirmando(true)
        try {
            for (const [partidoId, ganadorParticipanteId] of Object.entries(ganadoresBorrador)) {
                const r = await fetch(`/api/torneos/${torneo.id}/llaves/${partidoId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ganadorParticipanteId }),
                })
                const d = await r.json()
                if (!r.ok) throw new Error(d.error)
            }
            toast.success('Llave confirmada y ranking actualizado')
            setGanadoresBorrador({})
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

    if (!isOpen || !torneo) return null

    const numBorradores = Object.keys(ganadoresBorrador).length

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
                    <Button
                        variant="primary"
                        onClick={generar}
                        isLoading={generando}
                        disabled={confirmando}
                        leadingIcon={<PlayIcon className="h-4 w-4" />}
                    >
                        {generando ? 'Generando...' : 'Generar llaves (top 2)'}
                    </Button>
                    <Button
                        variant="success"
                        onClick={confirmarTodo}
                        isLoading={confirmando}
                        disabled={numBorradores === 0}
                        leadingIcon={<CheckBadgeIcon className="h-4 w-4" />}
                    >
                        {confirmando ? 'Confirmando y actualizando ELO...' : `Confirmar ${numBorradores || ''} resultado(s)`}
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
                <div className="py-16 text-center text-fg-muted">Cargando...</div>
            ) : (
                <div className="overflow-x-auto pb-4 scrollbar-thin">
                    <div className="flex gap-6 min-w-max">
                        {rondas.map(([ronda, juegos]) => (
                            <div key={ronda} className="w-72 flex flex-col gap-4">
                                <h3 className="text-center text-xs font-bold text-fg-muted uppercase tracking-wider">
                                    {juegos.length === 1 ? 'Final' : ronda}
                                </h3>
                                {juegos.map(p => {
                                    const finalizado = p.estado === 'FINALIZADO'
                                    const campeon = p.ganador_participante_id === p.participante_local_id
                                        ? p.participante_local
                                        : p.participante_visitante
                                    return (
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
                                            finalizado={finalizado}
                                            campeon={finalizado && juegos.length === 1 ? campeon : null}
                                        />
                                    )
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </Modal>
    )
}

function LlaveCard({
    partido,
    arrastre,
    setArrastre,
    ganadorBorrador,
    onDropGanador,
    finalizado,
    campeon,
}: {
    partido: Partido
    arrastre: { partidoId: number; participanteId: number } | null
    setArrastre: (a: { partidoId: number; participanteId: number } | null) => void
    ganadorBorrador?: number
    onDropGanador: () => void
    finalizado: boolean
    campeon: Participante | null
}) {
    return (
        <div
            onDragOver={e => e.preventDefault()}
            onDrop={onDropGanador}
            className="card-flush overflow-hidden"
        >
            <div className="px-3 py-1 text-[10px] font-bold text-fg-muted bg-subtle border-b border-line uppercase tracking-wider">
                Partido {partido.posicion_llave}
            </div>
            {[partido.participante_local, partido.participante_visitante].map((p, i) => {
                const pid = i === 0 ? partido.participante_local_id : partido.participante_visitante_id
                return (
                    <div
                        key={i}
                        draggable={!finalizado && !!pid}
                        onDragStart={() => pid && setArrastre({ partidoId: partido.id, participanteId: pid })}
                        className="px-3 py-2 border-t border-line text-sm cursor-grab text-fg"
                    >
                        {nombre(p)}
                    </div>
                )
            })}
            {!finalizado && (
                <div className="m-2 p-2 text-center text-xs font-bold text-success bg-success-soft border border-dashed border-success rounded">
                    {ganadorBorrador ? 'Ganador en borrador' : 'Suelta ganador aquí'}
                </div>
            )}
            {campeon && (
                <div className="p-3 bg-warning-soft text-center font-bold text-warning inline-flex items-center justify-center gap-1.5 w-full">
                    <TrophyIcon className="h-4 w-4" />
                    Campeón: {nombre(campeon)}
                </div>
            )}
        </div>
    )
}
