'use client'
import { useState, useEffect } from 'react'
import ClubForm from '@/components/forms/ClubForm'
import DataTable from '@/components/ui/DataTable'
import { PlusIcon } from '@heroicons/react/24/outline'
import { Section } from '@/components/ui/Section'
import { Button } from '@/components/ui/Button'

type Club = {
    id: number
    nombre: string
    jugadoresCount: number
}

type PaginatedResponse = {
    clubes: Club[]
    total: number
}

export default function ClubesSection() {
    const [showForm, setShowForm] = useState(false)
    const [clubes, setClubes] = useState<Club[]>([])
    const [currentPage, setCurrentPage] = useState(1)
    const [itemsPerPage, setItemsPerPage] = useState(10)
    const [totalItems, setTotalItems] = useState(0)
    const [isLoading, setIsLoading] = useState(false)

    // edición directa desde el DT
    const [editingClubId, setEditingClubId] = useState<number | null>(null)
    const [editingField, setEditingField] = useState<string | null>(null)
    const [editingValue, setEditingValue] = useState<string | number>('')

    const fetchClubes = async (page: number, limit: number) => {
        setIsLoading(true)
        try {
            const response = await fetch(`/api/clubes?page=${page}&limit=${limit}`)
            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`)
            }
            const data: PaginatedResponse = await response.json()
            setClubes(data.clubes)
            setTotalItems(data.total)
        } catch (error) {
            console.error('Error fetching clubs:', error)
        } finally {
            setIsLoading(false)
        }
    }

    const handleEditStart = (jugadorId: number, field: string, currentValue: string | number) => {
        setEditingClubId(jugadorId)
        setEditingField(field)
        setEditingValue(currentValue)
    }

    const handleEditSave = async () => {
        if (editingClubId === null || editingField === null) return

        try {
            await fetch(`/api/clubes/${editingClubId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [editingField]: editingValue }),
            })
            await fetchClubes(currentPage, itemsPerPage)
        } catch (error) {
            console.error('Error guardando edición:', error)
        } finally {
            setEditingClubId(null)
            setEditingField(null)
            setEditingValue('')
        }
    }

    useEffect(() => {
        fetchClubes(currentPage, itemsPerPage)
    }, [currentPage, itemsPerPage])

    const columns = [
        { header: 'ID', accessor: 'id', sortable: true, className: 'w-16 text-fg-muted' },
        {
            header: 'Nombre',
            accessor: 'nombre',
            render: (nombre: string, row: Club) => {
                if (editingClubId === row.id && editingField === 'nombre') {
                    return (
                        <input
                            type="text"
                            value={editingValue}
                            autoFocus
                            onChange={(e) => setEditingValue(e.target.value)}
                            onBlur={handleEditSave}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleEditSave()
                            }}
                            className="input-base py-1 text-sm"
                        />
                    )
                }
                return (
                    <span
                        onClick={() => handleEditStart(row.id, 'nombre', nombre)}
                        className="cursor-pointer hover:text-brand font-medium text-fg"
                    >
                        {nombre}
                    </span>
                )
            },
            sortable: true,
        },
        {
            header: 'Jugadores',
            accessor: 'jugadoresCount',
            className: 'w-32 text-right',
            render: (n: number) => <span className="font-mono text-sm tabular-nums text-fg-muted">{n}</span>,
        },
    ]

    return (
        <Section
            title="Clubes"
            subtitle="Administra los clubes afiliados"
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
                <ClubForm
                    onSuccessAction={() => {
                        setShowForm(false)
                        fetchClubes(currentPage, itemsPerPage)
                    }}
                    onCancelAction={() => setShowForm(false)}
                />
            ) : (
                <DataTable
                    columns={columns}
                    data={clubes}
                    currentPage={currentPage}
                    itemsPerPage={itemsPerPage}
                    totalItems={totalItems}
                    onPageChange={setCurrentPage}
                    onItemsPerPageChange={setItemsPerPage}
                    isLoading={isLoading}
                    rowKey={(row: Club) => row.id}
                />
            )}
        </Section>
    )
}
