'use client'
import { useEffect, useState } from 'react'
import TorneoForm from '@/components/forms/TorneoForm'
import DataTable from '@/components/ui/DataTable'
import { PlusIcon } from '@heroicons/react/24/outline'
import InscripcionTorneoModal from '@/components/ui/InscripcionTorneoModal'
import GruposTorneoModal from '@/components/ui/GruposTorneoModal'
import PartidosTorneoModal from '@/components/ui/PartidosTorneoModal'
import LlavesTorneoModal from '@/components/ui/LlavesTorneoModal'
import { DestinoModal } from '@/components/ui/NavegacionModales'
import { Section } from '@/components/ui/Section'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useRecurso } from '@/app/hooks/useRecurso'
import Buscador, { useDebounce } from '@/components/ui/Buscador'

type Torneo = {
    id: number
    nombre: string
    fecha: string
    ubicacion: string
    modalidad: 'INDIVIDUAL' | 'DOBLES' | 'EQUIPOS' | 'ATTA_TEAMS'
    torneo_categorias: { categorias: { id: number; nombre: string } }[]
}

type PaginatedResponse = {
    torneos: Torneo[]
    total: number
}

const modalidadLabel: Record<Torneo['modalidad'], string> = {
    INDIVIDUAL: 'Individual',
    DOBLES: 'Dobles',
    EQUIPOS: 'Equipos',
    ATTA_TEAMS: 'ATTA Teams',
}

const modalidadVariant: Record<Torneo['modalidad'], 'info' | 'brand' | 'warning'> = {
    INDIVIDUAL: 'info',
    DOBLES: 'brand',
    EQUIPOS: 'warning',
    ATTA_TEAMS: 'brand',
}

export default function TorneosSection({ className = '' }) {
    const [showForm, setShowForm] = useState(false)
    const [busqueda, setBusqueda] = useState('')
    const busquedaDebounce = useDebounce(busqueda)
    const [modalidadFiltro, setModalidadFiltro] = useState('')
    const [currentPage, setCurrentPage] = useState(1)
    const [itemsPerPage, setItemsPerPage] = useState(10)

    const [selectedTorneo, setSelectedTorneo] = useState<Torneo | null>(null)
    const [showInscripcionModal, setShowInscripcionModal] = useState(false)
    const [showGruposModal, setShowGruposModal] = useState(false)
    const [showPartidosModal, setShowPartidosModal] = useState(false)
    const [showLlavesModal, setShowLlavesModal] = useState(false)

    /** Salto directo entre los modales del torneo conservando el torneo
     *  seleccionado (la barra inferior de cada modal la invoca). */
    const navegarA = (destino: DestinoModal) => {
        setShowInscripcionModal(destino === 'inscripcion')
        setShowGruposModal(destino === 'grupos')
        setShowPartidosModal(destino === 'partidos')
        setShowLlavesModal(destino === 'llaves')
    }

    // Al escribir en el buscador o cambiar filtro, volver a la primera página.
    useEffect(() => {
        setCurrentPage(1)
    }, [busquedaDebounce, modalidadFiltro])

    const { datos, isLoading, error, refresh } = useRecurso<PaginatedResponse>(
        `/api/torneos?page=${currentPage}&limit=${itemsPerPage}${
            busquedaDebounce ? `&nombre=${encodeURIComponent(busquedaDebounce)}` : ''
        }${modalidadFiltro ? `&modalidad=${modalidadFiltro}` : ''}`
    )
    const torneos = datos?.torneos ?? []
    const totalItems = datos?.total ?? 0

    const columns = [
        { header: 'ID', accessor: 'id', key: 'id', className: 'w-16 text-fg-muted', ocultarEnMovil: true },
        {
            header: 'Nombre',
            accessor: 'nombre',
            render: (n: string) => <span className="font-medium text-fg">{n}</span>,
        },
        {
            header: 'Fecha',
            accessor: 'fecha',
            className: 'whitespace-nowrap text-fg-muted',
            render: (fecha: string) => new Date(fecha).toLocaleDateString(),
        },
        {
            header: 'Ubicación',
            ocultarEnMovil: true,
            accessor: 'ubicacion',
            className: 'hidden md:table-cell text-fg-muted',
        },
        {
            header: 'Modalidad',
            accessor: 'modalidad',
            render: (m: Torneo['modalidad']) => (
                <Badge variant={modalidadVariant[m]}>{modalidadLabel[m]}</Badge>
            ),
        },
        {
            header: 'Categorías',
            ocultarEnMovil: true,
            accessor: 'torneo_categorias',
            render: (tc: { categorias?: { nombre?: string } }[]) => (
                <div className="flex flex-wrap gap-1">
                    {tc?.map((cat, idx) => (
                        <Badge key={idx} variant="neutral">
                            {cat.categorias?.nombre}
                        </Badge>
                    ))}
                </div>
            ),
        },
        {
            header: 'Acciones',
            accessor: 'id',
            key: 'actions',
            className: 'w-72',
            render: (_: number, row: Torneo) => (
                <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            setSelectedTorneo(row)
                            setShowInscripcionModal(true)
                        }}
                    >
                        Inscripciones
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            setSelectedTorneo(row)
                            setShowGruposModal(true)
                        }}
                    >
                        Grupos
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            setSelectedTorneo(row)
                            setShowPartidosModal(true)
                        }}
                    >
                        Partidos
                    </Button>
                    <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => {
                            setSelectedTorneo(row)
                            setShowLlavesModal(true)
                        }}
                    >
                        Llaves
                    </Button>
                </div>
            ),
        },
    ]

    return (
        <Section
            title="Torneos"
            subtitle="Gestión de torneos y llaves"
            className={className}
            actions={
                showForm ? null : (
                    <Button
                        variant="primary"
                        size="sm"
                        leadingIcon={<PlusIcon className="h-4 w-4" />}
                        onClick={() => setShowForm(true)}
                    >
                        Nuevo
                    </Button>
                )
            }
        >
            {showForm ? (
                <TorneoForm
                    onSuccessAction={() => {
                        setShowForm(false)
                        refresh()
                    }}
                    onCancelAction={() => setShowForm(false)}
                />
            ) : (
                <>
                    {error && (
                        <div className="banner banner-warning mb-4">
                            {error}. Si acabas de actualizar el código, aplica la migración de base de datos y reinicia el servidor.
                        </div>
                    )}
                    <DataTable
                        toolbar={
                            <div className="flex flex-col sm:flex-row gap-2">
                                <Buscador
                                    valor={busqueda}
                                    onCambiar={setBusqueda}
                                    placeholder="Buscar torneo…"
                                    className="sm:w-56"
                                />
                                <Select
                                    value={modalidadFiltro}
                                    onChange={(e) => setModalidadFiltro(e.target.value)}
                                    className="sm:w-44"
                                    aria-label="Filtrar por modalidad"
                                >
                                    <option value="">Todas las modalidades</option>
                                    <option value="INDIVIDUAL">Individual</option>
                                    <option value="DOBLES">Dobles</option>
                                    <option value="EQUIPOS">Equipos</option>
                                    <option value="ATTA_TEAMS">ATTA Teams</option>
                                </Select>
                            </div>
                        }
                        columns={columns}
                        data={torneos}
                        currentPage={currentPage}
                        itemsPerPage={itemsPerPage}
                        totalItems={totalItems}
                        onPageChange={setCurrentPage}
                        onItemsPerPageChange={setItemsPerPage}
                        isLoading={isLoading}
                        rowKey={(row: Torneo) => row.id}
                    />
                </>
            )}

            <InscripcionTorneoModal
                isOpen={showInscripcionModal}
                onClose={() => {
                    setShowInscripcionModal(false)
                    setSelectedTorneo(null)
                }}
                torneo={selectedTorneo}
                onNavegar={navegarA}
            />

            <GruposTorneoModal
                isOpen={showGruposModal}
                onClose={() => {
                    setShowGruposModal(false)
                    setSelectedTorneo(null)
                }}
                torneo={selectedTorneo}
                onOpenPartidos={() => {
                    setShowGruposModal(false)
                    setShowPartidosModal(true)
                }}
                onNavegar={navegarA}
            />

            <PartidosTorneoModal
                isOpen={showPartidosModal}
                onClose={() => {
                    setShowPartidosModal(false)
                    setSelectedTorneo(null)
                }}
                torneo={selectedTorneo}
                onOpenLlaves={() => {
                    setShowPartidosModal(false)
                    setShowLlavesModal(true)
                }}
                onNavegar={navegarA}
            />
            <LlavesTorneoModal
                isOpen={showLlavesModal}
                onClose={() => {
                    setShowLlavesModal(false)
                    setSelectedTorneo(null)
                }}
                torneo={selectedTorneo}
                onNavegar={navegarA}
            />
        </Section>
    )
}
