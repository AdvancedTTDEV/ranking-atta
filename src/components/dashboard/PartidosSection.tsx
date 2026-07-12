'use client'
import { useState, useEffect } from 'react'
import DataTable from '@/components/ui/DataTable'
import { PlusIcon, ArrowUturnLeftIcon, TrophyIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import PartidoForm from '@/components/forms/PartidoForm'
import { safeFetch } from '@/lib/api'
import { toast } from 'react-hot-toast'
import { Section } from '@/components/ui/Section'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import PartidosResultadoModal from '@/components/ui/PartidosResultadoModal'

type Partido = {
    id: number
    jugador1Nombre: string
    jugador2Nombre: string
    ganadorNombre: string
    torneoNombre: string
    ronda: string
    fecha: string
}

type Torneo = {
    id: number
    nombre: string
    modalidad: 'INDIVIDUAL' | 'DOBLES' | 'EQUIPOS'
}

interface PartidoTorneo {
    id: number
    orden: number
    sets_local: number
    sets_visitante: number
    estado: 'PENDIENTE' | 'FINALIZADO'
    grupo_id?: number | null
    categoria_id: number
    torneo_grupos: { id: number; numero_grupo: number } | null
    participante_local: {
        id: number
        nombre_personalizado?: string | null
        jugadores?: { id: number; nombre: string } | null
        miembros: { jugadores: { id: number; nombre: string } }[]
    }
    participante_visitante: {
        id: number
        nombre_personalizado?: string | null
        jugadores?: { id: number; nombre: string } | null
        miembros: { jugadores: { id: number; nombre: string } }[]
    }
    arbitro: { id: number; nombre: string } | null
    sets: { numero: number; puntos_local: number; puntos_visitante: number }[]
    detalles: never[] // No usamos detalles en INDIVIDUAL/DOBLES del recopilatorio
}

const nombreParticipante = (p: PartidoTorneo['participante_local']) =>
    p.nombre_personalizado?.trim()
    || p.miembros.map(m => m.jugadores.nombre).join(' / ')
    || p.jugadores?.nombre
    || 'Participante'

export default function PartidosSection() {
    const [showForm, setShowForm] = useState(false)
    const [partidos, setPartidos] = useState<Partido[]>([])
    const [error, setError] = useState<string | null>(null)
    const [torneos, setTorneos] = useState<Torneo[]>([])
    const [selectedTorneoId, setSelectedTorneoId] = useState<string>('')
    const [currentPage, setCurrentPage] = useState(1)
    const [itemsPerPage, setItemsPerPage] = useState(10)
    const [totalItems, setTotalItems] = useState(0)
    const [isLoading, setIsLoading] = useState(false)

    // Vista alternativa: partidos programados del torneo seleccionado
    const [partidosTorneo, setPartidosTorneo] = useState<PartidoTorneo[]>([])
    const [loadingTorneo, setLoadingTorneo] = useState(false)
    const [partidoResultadoId, setPartidoResultadoId] = useState<number | null>(null)
    const [borradores, setBorradores] = useState<Record<number, { sets: { local: number; visitante: number }[] }>>({})
    const [torneoActivo, setTorneoActivo] = useState<Torneo | null>(null)

    const fetchPartidos = async (page: number, limit: number) => {
        try {
            setIsLoading(true)
            setError(null)
            const data = await safeFetch(
                `/api/partidos?page=${page}&limit=${limit}${selectedTorneoId ? `&torneo_id=${selectedTorneoId}` : ''}`
            )
            const parsed = data.partidos.map((partido: Partido) => ({
                id: partido.id,
                jugador1Nombre: partido.jugador1Nombre,
                jugador2Nombre: partido.jugador2Nombre,
                ganadorNombre: partido.ganadorNombre,
                torneoNombre: partido.torneoNombre,
                ronda: partido.ronda,
                fecha: partido.fecha,
            }))
            setPartidos(parsed)
            setTotalItems(data.total)
        } catch {
            console.error('Failed to fetch matches')
            setError('Error al cargar partidos. Intente nuevamente.')
        } finally {
            setIsLoading(false)
        }
    }

    // Cuando se selecciona un torneo, además de filtrar el recopilatorio,
    // cargamos los partidos PROGRAMADOS de ese torneo (vía la ruta de la API
    // de partidos de torneo sin categoriaId, para traer todas las categorías).
    const fetchPartidosTorneo = async () => {
        if (!selectedTorneoId) {
            setPartidosTorneo([])
            setTorneoActivo(null)
            return
        }
        setLoadingTorneo(true)
        try {
            const data = await safeFetch(`/api/torneos/${selectedTorneoId}/partidos`)
            setPartidosTorneo((data.partidos || []) as PartidoTorneo[])
            const t = torneos.find(x => x.id.toString() === selectedTorneoId)
            if (t) setTorneoActivo(t)
        } catch {
            toast.error('No se pudieron cargar los partidos del torneo')
        } finally {
            setLoadingTorneo(false)
        }
    }

    useEffect(() => {
        fetchPartidos(currentPage, itemsPerPage)
    }, [currentPage, itemsPerPage, selectedTorneoId])

    useEffect(() => {
        fetchPartidosTorneo()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTorneoId, torneos])

    useEffect(() => {
        const fetchTorneos = async () => {
            try {
                const data = await safeFetch('/api/torneos')
                setTorneos(data.torneos)
            } catch {
                console.error('Error al cargar torneos')
            }
        }
        fetchTorneos()
    }, [])

    const handleTorneoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedTorneoId(e.target.value)
        setCurrentPage(1)
        setBorradores({})
    }

    const handleUndo = async (id: number) => {
        try {
            const res = await fetch(`/api/partidos/${id}/revert`, { method: 'POST' })
            if (res.ok) {
                toast.success('Partido revertido')
                fetchPartidos(currentPage, itemsPerPage)
            } else {
                toast.error('Error al revertir')
            }
        } catch {
            toast.error('Error de conexión')
        }
    }

    const columns = [
        {
            header: 'ID',
            accessor: 'id',
            key: 'id',
            className: 'w-16 text-fg-muted',
        },
        {
            header: 'Jugador 1',
            accessor: 'jugador1Nombre',
            render: (n: string) => <span className="font-medium text-fg">{n}</span>,
        },
        {
            header: 'Jugador 2',
            accessor: 'jugador2Nombre',
            render: (n: string) => n ?? <span className="text-fg-muted">—</span>,
        },
        {
            header: 'Ganador',
            accessor: 'ganadorNombre',
            render: (n: string) => (
                <Badge variant="success">{n}</Badge>
            ),
        },
        {
            header: 'Ronda',
            accessor: 'ronda',
            render: (n: string) =>
                n ? <Badge variant="neutral">{n}</Badge> : <span className="text-fg-muted">—</span>,
        },
        {
            header: 'Torneo',
            accessor: 'torneoNombre',
            className: 'hidden md:table-cell',
        },
        {
            header: 'Fecha',
            accessor: 'fecha',
            className: 'hidden lg:table-cell whitespace-nowrap text-fg-muted',
        },
        {
            header: '',
            accessor: 'id',
            key: 'actions',
            className: 'w-20 text-right',
            render: (_: number, row: Partido) => (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                        e.stopPropagation()
                        handleUndo(row.id)
                    }}
                    leadingIcon={<ArrowUturnLeftIcon className="h-3.5 w-3.5" />}
                >
                    Deshacer
                </Button>
            ),
        },
    ]

    // ── Tabla de partidos programados del torneo seleccionado ──
    const hayTorneoSeleccionado = !!selectedTorneoId
    const partidosTorneoAgrupados = (() => {
        const grupos = new Map<number, { id: number; numero: number; partidos: PartidoTorneo[] }>()
        for (const p of partidosTorneo) {
            if (!p.torneo_grupos) continue
            const g = grupos.get(p.torneo_grupos.id) || { id: p.torneo_grupos.id, numero: p.torneo_grupos.numero_grupo, partidos: [] }
            g.partidos.push(p)
            grupos.set(p.torneo_grupos.id, g)
        }
        return [...grupos.values()].sort((a, b) => a.numero - b.numero)
    })()

    return (
        <Section
            title="Partidos"
            subtitle="Historial de partidos y resultados"
            actions={
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <Select
                        value={selectedTorneoId}
                        onChange={handleTorneoChange}
                        className="sm:w-48"
                    >
                        <option value="">Todos los torneos</option>
                        {torneos.map((t) => (
                            <option key={t.id} value={t.id}>{t.nombre}</option>
                        ))}
                    </Select>
                    {!showForm && (
                        <Button
                            variant="primary"
                            size="sm"
                            leadingIcon={<PlusIcon className="h-4 w-4" />}
                            onClick={() => setShowForm(true)}
                        >
                            Nuevo
                        </Button>
                    )}
                </div>
            }
        >
            {error && <div className="banner banner-danger mb-4">{error}</div>}

            {showForm ? (
                <PartidoForm
                    onSuccessAction={() => {
                        setShowForm(false)
                        fetchPartidos(currentPage, itemsPerPage)
                    }}
                    onCancelAction={() => setShowForm(false)}
                />
            ) : (
                <>
                    {/* ── Bloque de partidos programados del torneo seleccionado ── */}
                    {hayTorneoSeleccionado && (
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-sm font-semibold text-fg inline-flex items-center gap-2">
                                    <TrophyIcon className="h-4 w-4 text-fg-muted" />
                                    Partidos programados de {torneoActivo?.nombre || '—'}
                                </h3>
                                {Object.keys(borradores).length > 0 && (
                                    <Badge variant="warning">
                                        <span className="inline-flex items-center gap-1">
                                            <ExclamationTriangleIcon className="h-3 w-3" />
                                            {Object.keys(borradores).length} borrador{Object.keys(borradores).length === 1 ? '' : 'es'}
                                        </span>
                                    </Badge>
                                )}
                            </div>
                            {loadingTorneo ? (
                                <div className="text-center py-10 text-fg-muted text-sm">Cargando partidos…</div>
                            ) : partidosTorneoAgrupados.length === 0 ? (
                                <div className="card-flush p-6 text-center text-fg-muted text-sm">
                                    Este torneo aún no tiene partidos programados. Genera los cruces desde
                                    <b> Torneos → {torneoActivo?.nombre} → Partidos</b>.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {partidosTorneoAgrupados.map(grupo => (
                                        <div key={grupo.id} className="card-flush overflow-hidden">
                                            <div className="px-4 py-2.5 bg-subtle border-b border-line text-xs font-bold text-fg-muted uppercase tracking-wider">
                                                Grupo {grupo.numero}
                                            </div>
                                            <div className="divide-y divide-line">
                                                {grupo.partidos.map(partido => {
                                                    const finalizado = partido.estado === 'FINALIZADO'
                                                    const tieneBorrador = !!borradores[partido.id]
                                                    return (
                                                        <button
                                                            key={partido.id}
                                                            type="button"
                                                            onClick={() => setPartidoResultadoId(partido.id)}
                                                            className="w-full p-3.5 text-left hover:bg-subtle transition-colors flex flex-col sm:flex-row sm:items-center gap-2"
                                                        >
                                                            <span className="chip w-7 text-center">#{partido.orden}</span>
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
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Recopilatorio de partidos libres (sin atar a torneo, o de la BD `partidos`) ── */}
                    <div>
                        <h3 className="text-sm font-semibold text-fg mb-2">
                            Recopilatorio
                            {hayTorneoSeleccionado && (
                                <span className="text-fg-muted font-normal text-xs ml-2">
                                    (filtrado por {torneoActivo?.nombre})
                                </span>
                            )}
                        </h3>
                        <DataTable
                            columns={columns}
                            data={partidos}
                            currentPage={currentPage}
                            itemsPerPage={itemsPerPage}
                            totalItems={totalItems}
                            onPageChange={setCurrentPage}
                            onItemsPerPageChange={setItemsPerPage}
                            isLoading={isLoading}
                            rowKey={(row: Partido) => row.id}
                        />
                    </div>
                </>
            )}

            {partidoResultadoId !== null && torneoActivo && (
                <PartidosResultadoModal
                    isOpen
                    onClose={() => setPartidoResultadoId(null)}
                    torneo={torneoActivo}
                    partidos={partidosTorneo as never}
                    partidoInicialId={partidoResultadoId}
                    borradores={borradores}
                    onBorradoresChange={setBorradores}
                    onPersist={() => fetchPartidosTorneo()}
                />
            )}
        </Section>
    )
}
