'use client'
import { useState } from 'react'
import ClubForm from '@/components/forms/ClubForm'
import DataTable from '@/components/ui/DataTable'
import { PlusIcon } from '@heroicons/react/24/outline'
import { Section } from '@/components/ui/Section'
import { Button } from '@/components/ui/Button'
import toast from 'react-hot-toast'
import { useRecurso } from '@/app/hooks/useRecurso'

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
    const [currentPage, setCurrentPage] = useState(1)
    const [itemsPerPage, setItemsPerPage] = useState(10)

    // edición directa desde el DT
    const [editingClubId, setEditingClubId] = useState<number | null>(null)
    const [editingField, setEditingField] = useState<string | null>(null)
    const [editingValue, setEditingValue] = useState<string | number>('')

    const { datos, setDatos, isLoading, refresh, actualizar } = useRecurso<PaginatedResponse>(
        `/api/clubes?page=${currentPage}&limit=${itemsPerPage}`
    )
    const clubes = datos?.clubes ?? []
    const totalItems = datos?.total ?? 0

    const handleEditStart = (clubId: number, field: string, currentValue: string | number) => {
        setEditingClubId(clubId)
        setEditingField(field)
        setEditingValue(currentValue)
    }

    const handleEditSave = async () => {
        if (editingClubId === null || editingField === null) return

        const clubId = editingClubId
        const campo = editingField
        const valor = editingValue

        // Update optimista: la fila cambia al instante; si falla, se revierte.
        const previo = datos
        actualizar(prev =>
            prev
                ? {
                      ...prev,
                      clubes: prev.clubes.map(c => (c.id === clubId ? { ...c, [campo]: valor } : c)),
                  }
                : prev
        )

        try {
            const res = await fetch(`/api/clubes/${clubId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [campo]: valor }),
            })
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Error ${res.status}`)
            toast.success('Club actualizado')
        } catch (error: any) {
            setDatos(previo)
            console.error('Error guardando edición:', error)
            toast.error(error.message ?? 'No se pudo guardar')
        } finally {
            setEditingClubId(null)
            setEditingField(null)
            setEditingValue('')
        }
    }

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
                                if (e.key === 'Escape') {
                                    setEditingClubId(null)
                                    setEditingField(null)
                                    setEditingValue('')
                                }
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
                        refresh()
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
