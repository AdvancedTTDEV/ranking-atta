'use client'
import { useState, useEffect } from 'react'
import TorneoForm from '@/components/forms/TorneoForm'
import DataTable from '@/components/ui/DataTable'
import { PlusIcon } from '@heroicons/react/24/outline'
import InscripcionTorneoModal from '@/components/ui/InscripcionTorneoModal'
import GruposTorneoModal from '@/components/ui/GruposTorneoModal' // <-- Importamos el nuevo modal de grupos

type Torneo = {
    id: number
    nombre: string
    fecha: string
    ubicacion: string
    torneo_categorias: { categorias : { id: number; nombre: string } }[]
}

type PaginatedResponse = {
    torneos: Torneo[]
    total: number
}

export default function TorneosSection({ className = '' }) {
    const [showForm, setShowForm] = useState(false)
    const [torneos, setTorneos] = useState<Torneo[]>([])
    const [currentPage, setCurrentPage] = useState(1)
    const [itemsPerPage, setItemsPerPage] = useState(10)
    const [totalItems, setTotalItems] = useState(0)
    const [isLoading, setIsLoading] = useState(false)

    // Estados para el control de los modales y el torneo seleccionado
    const [selectedTorneo, setSelectedTorneo] = useState<Torneo | null>(null)
    const [showInscripcionModal, setShowInscripcionModal] = useState(false)
    const [showGruposModal, setShowGruposModal] = useState(false) // <-- Estado para el modal de grupos

    const fetchTorneos = async (page: number, limit: number) => {
        setIsLoading(true)
        try {
            const response = await fetch(`/api/torneos?page=${page}&limit=${limit}`)
            const data: PaginatedResponse = await response.json()
            setTorneos(data.torneos)
            setTotalItems(data.total)
        } catch (error) {
            console.error('Error fetching tournaments:', error)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchTorneos(currentPage, itemsPerPage)
    }, [currentPage, itemsPerPage])

    const columns = [
        { header: 'ID', accessor: 'id' },
        { header: 'Nombre', accessor: 'nombre' },
        {
            header: 'Fecha',
            accessor: 'fecha',
            render: (fecha: string) => new Date(fecha).toLocaleDateString()
        },
        { header: 'Ubicación', accessor: 'ubicacion' },
        {
            header: 'Categorías',
            accessor: 'torneo_categorias',
            render: (torneoCategorias: { categorias?: { nombre?: string } }[]) => (
                <div className="flex flex-wrap gap-1">
                    {torneoCategorias?.map((tc, idx) => (
                        <span key={idx} className="bg-gray-100 text-gray-800 text-xs px-2 py-0.5 rounded">
                            {tc.categorias?.nombre}
                        </span>
                    ))}
                </div>
            )
        },
        {  header: 'Acciones',
            accessor: 'id',
            render: (_: number, row: Torneo) => (
                <div className="flex space-x-2" onClick={(e) => e.stopPropagation()}>
                    <button
                        onClick={() => {
                            setSelectedTorneo(row)
                            setShowInscripcionModal(true)
                        }}
                        className="text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1.5 rounded font-semibold transition-colors"
                    >
                        Inscripciones
                    </button>
                    <button
                        onClick={() => {
                            setSelectedTorneo(row)
                            setShowGruposModal(true)
                        }}
                        className="text-xs bg-slate-800 text-white hover:bg-slate-700 px-3 py-1.5 rounded font-semibold transition-colors"
                    >
                        Ver / Generar Grupos
                    </button>
                </div>
            )
        }
    ]

    return (
        <div className={`bg-white rounded-lg shadow p-4 ${className}`}>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Torneos</h2>
                <button
                    onClick={() => setShowForm(true)}
                    className="bg-blue-600 text-white px-3 py-1 rounded flex items-center"
                >
                    <PlusIcon className="h-4 w-4 mr-1" />
                    Nuevo
                </button>
            </div>

            {showForm ? (
                <TorneoForm
                    onSuccessAction={() => {
                        setShowForm(false)
                        fetchTorneos(currentPage, itemsPerPage)
                    }}
                    onCancelAction={() => setShowForm(false)}
                />
            ) : (
                <DataTable
                    columns={columns}
                    data={torneos}
                    currentPage={currentPage}
                    itemsPerPage={itemsPerPage}
                    totalItems={totalItems}
                    onPageChange={setCurrentPage}
                    onItemsPerPageChange={setItemsPerPage}
                    isLoading={isLoading}
                />
            )}

            {/* Modal para la gestión de inscripciones de jugadores */}
            <InscripcionTorneoModal
                isOpen={showInscripcionModal}
                onClose={() => {
                    setShowInscripcionModal(false)
                    setSelectedTorneo(null)
                }}
                torneo={selectedTorneo}
            />

            {/* Modal grande para visualizar y disparar el ordenamiento de grupos */}
            <GruposTorneoModal
                isOpen={showGruposModal}
                onClose={() => {
                    setShowGruposModal(false)
                    setSelectedTorneo(null)
                }}
                torneo={selectedTorneo}
            />
        </div>
    )
}