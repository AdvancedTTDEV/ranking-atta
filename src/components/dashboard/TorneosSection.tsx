'use client'
import { useState, useEffect } from 'react'
import TorneoForm from '@/components/forms/TorneoForm'
import DataTable from '@/components/ui/DataTable'
import { PlusIcon } from '@heroicons/react/24/outline'
import InscripcionTorneoModal from '@/components/ui/InscripcionTorneoModal'
import GruposTorneoModal from '@/components/ui/GruposTorneoModal'
import PartidosTorneoModal from '@/components/ui/PartidosTorneoModal'
import LlavesTorneoModal from '@/components/ui/LlavesTorneoModal'
import { Section } from '@/components/ui/Section'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

type Torneo = {
    id: number
    nombre: string
    fecha: string
    ubicacion: string
    modalidad: 'INDIVIDUAL' | 'DOBLES' | 'EQUIPOS'
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
}

const modalidadVariant: Record<Torneo['modalidad'], 'info' | 'brand' | 'warning'> = {
    INDIVIDUAL: 'info',
    DOBLES: 'brand',
    EQUIPOS: 'warning',
}

export default function TorneosSection({ className = '' }) {
    const [showForm, setShowForm] = useState(false)
    const [torneos, setTorneos] = useState<Torneo[]>([])
    const [currentPage, setCurrentPage] = useState(1)
    const [itemsPerPage, setItemsPerPage] = useState(10)
    const [totalItems, setTotalItems] = useState(0)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [selectedTorneo, setSelectedTorneo] = useState<Torneo | null>(null)
    const [showInscripcionModal, setShowInscripcionModal] = useState(false)
    const [showGruposModal, setShowGruposModal] = useState(false)
    const [showPartidosModal, setShowPartidosModal] = useState(false)
    const [showLlavesModal, setShowLlavesModal] = useState(false)

    const fetchTorneos = async (page: number, limit: number) => {
        setIsLoading(true)
        setError(null)
        try {
            const response = await fetch(`/api/torneos?page=${page}&limit=${limit}`)
            const data: PaginatedResponse = await response.json()
            if (!response.ok) {
                throw new Error((data as PaginatedResponse & { message?: string }).message || 'No se pudieron cargar los torneos')
            }
            setTorneos(Array.isArray(data.torneos) ? data.torneos : [])
            setTotalItems(typeof data.total === 'number' ? data.total : 0)
        } catch (error) {
            console.error('Error fetching tournaments:', error)
            setTorneos([])
            setTotalItems(0)
            setError(error instanceof Error ? error.message : 'No se pudieron cargar los torneos')
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchTorneos(currentPage, itemsPerPage)
    }, [currentPage, itemsPerPage])

    const columns = [
        { header: 'ID', accessor: 'id', key: 'id', className: 'w-16 text-fg-muted' },
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
                        fetchTorneos(currentPage, itemsPerPage)
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
            />
            <LlavesTorneoModal
                isOpen={showLlavesModal}
                onClose={() => {
                    setShowLlavesModal(false)
                    setSelectedTorneo(null)
                }}
                torneo={selectedTorneo}
            />
        </Section>
    )
}
