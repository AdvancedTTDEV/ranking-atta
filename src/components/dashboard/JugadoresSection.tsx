'use client';

import { useState, useEffect } from 'react';
import JugadorForm from '@/components/forms/JugadorForm';
import DataTable from '@/components/ui/DataTable';
import { PlusIcon } from '@heroicons/react/24/outline';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

type Jugador = {
    id: number;
    nombre: string;
    elo: number;
    clubes?: { nombre?: string };
    categorias?: { nombre?: string };
};

type Categoria = {
    id: number;
    nombre: string;
};

export default function JugadoresSection({ className = '' }: { className?: string }) {
    const [showForm, setShowForm] = useState(false);
    const [jugadores, setJugadores] = useState<Jugador[]>([]);
    const [categorias, setCategorias] = useState<Categoria[]>([]);
    const [selectedCategoriaId, setSelectedCategoriaId] = useState<string>('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [totalItems, setTotalItems] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    // edición directa
    const [editingJugadorId, setEditingJugadorId] = useState<number | null>(null);
    const [editingField, setEditingField] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState<string | number>('');
    const [selectedClubId, setSelectedClubId] = useState<number | null>(null);
    const [showClubResults, setShowClubResults] = useState(false);
    const [clubes, setClubes] = useState<{ id: number; nombre: string }[]>([]);
    const [filteredClubes, setFilteredClubes] = useState<typeof clubes>([]);

    const fetchCategorias = async () => {
        try {
            const response = await fetch('/api/categorias');
            const data = await response.json();
            setCategorias(data);
        } catch (error) {
            console.error('Error fetching categories:', error);
        }
    };

    const fetchJugadores = async (page: number, limit: number) => {
        setIsLoading(true);
        try {
            const url = `/api/ranking?page=${page}&limit=${limit}${
                selectedCategoriaId ? `&categoriaId=${selectedCategoriaId}` : ''
            }`;
            const res = await fetch(url);
            const data = await res.json();
            setJugadores(data.jugadores || []);
            setTotalItems(data.total || 0);
        } catch (err) {
            console.error('Error fetching jugadores:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleEditStart = (jugadorId: number, field: string, currentValue: string | number) => {
        setEditingJugadorId(jugadorId);
        setEditingField(field);
        setEditingValue(currentValue);
    };

    const handleEditSave = async () => {
        if (editingJugadorId === null || editingField === null) return;

        try {
            await fetch(`/api/jugadores/${editingJugadorId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [editingField]: editingValue }),
            });
            await fetchJugadores(currentPage, itemsPerPage);
        } catch (error) {
            console.error('Error guardando edición:', error);
        } finally {
            setEditingJugadorId(null);
            setEditingField(null);
            setEditingValue('');
        }
    };

    useEffect(() => {
        const fetchClubes = async () => {
            const res = await fetch('/api/clubes?all=true');
            const data = await res.json();
            setClubes(data.clubes);
            setFilteredClubes(data.clubes);
        };
        fetchClubes();
    }, []);

    useEffect(() => {
        fetchCategorias();
    }, []);

    useEffect(() => {
        setCurrentPage(1);
        fetchJugadores(1, itemsPerPage);
    }, [selectedCategoriaId]);

    useEffect(() => {
        fetchJugadores(currentPage, itemsPerPage);
    }, [currentPage, itemsPerPage]);

    const columns = [
        {
            header: 'ID',
            accessor: 'id',
            sortable: true,
            className: 'w-16 text-fg-muted',
        },
        {
            header: 'Nombre',
            accessor: 'nombre',
            render: (nombre: string, row: Jugador) => {
                if (editingJugadorId === row.id && editingField === 'nombre') {
                    return (
                        <input
                            type="text"
                            value={editingValue}
                            autoFocus
                            onChange={(e) => setEditingValue(e.target.value)}
                            onBlur={handleEditSave}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleEditSave();
                            }}
                            className="input-base py-1 text-sm"
                        />
                    );
                }
                return (
                    <span
                        onClick={() => handleEditStart(row.id, 'nombre', nombre)}
                        className="cursor-pointer hover:text-brand font-medium text-fg"
                    >
                        {nombre}
                    </span>
                );
            },
            sortable: true,
        },
        {
            header: 'ELO',
            accessor: 'elo',
            render: (elo: number, row: Jugador) => {
                if (editingJugadorId === row.id && editingField === 'elo') {
                    return (
                        <input
                            type="number"
                            value={editingValue}
                            autoFocus
                            onChange={(e) => setEditingValue(Number(e.target.value))}
                            onBlur={handleEditSave}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleEditSave();
                            }}
                            className="input-base py-1 text-sm"
                        />
                    );
                }
                return (
                    <span
                        onClick={() => handleEditStart(row.id, 'elo', elo)}
                        className="cursor-pointer hover:text-brand font-mono text-sm tabular-nums text-fg"
                    >
                        {elo}
                    </span>
                );
            },
            sortable: true,
            className: 'w-24 text-right',
        },
        {
            header: 'Club',
            accessor: 'clubes',
            render: (club: { nombre?: string }, row: Jugador) => {
                const isEditing = editingJugadorId === row.id && editingField === 'clubes';

                return isEditing ? (
                    <div className="relative">
                        <input
                            type="text"
                            value={editingValue}
                            onChange={(e) => {
                                const val = e.target.value;
                                setEditingValue(val);
                                setFilteredClubes(
                                    clubes.filter((c) =>
                                        c.nombre.toLowerCase().includes(val.toLowerCase())
                                    )
                                );
                                setShowClubResults(true);
                            }}
                            onFocus={() => setShowClubResults(true)}
                            onBlur={() => setTimeout(() => setShowClubResults(false), 200)}
                            className="input-base py-1 text-sm"
                        />
                        {showClubResults && filteredClubes.length > 0 && (
                            <div className="absolute z-20 mt-1 w-full card-elevated max-h-40 overflow-auto scrollbar-thin py-1">
                                {filteredClubes.map((club) => (
                                    <button
                                        key={club.id}
                                        type="button"
                                        onClick={async () => {
                                            setEditingValue(club.nombre);
                                            setSelectedClubId(club.id);
                                            setShowClubResults(false);

                                            await fetch(`/api/jugadores/${row.id}`, {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ club_id: club.id }),
                                            });
                                            fetchJugadores(currentPage, itemsPerPage);
                                            setEditingJugadorId(null);
                                            setEditingField(null);
                                        }}
                                        className="w-full text-left px-3 py-1.5 text-sm text-fg hover:bg-subtle"
                                    >
                                        {club.nombre}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => handleEditStart(row.id, 'clubes', club?.nombre || '')}
                        className="text-left hover:text-brand text-fg-muted"
                    >
                        {club?.nombre || 'Sin club'}
                    </button>
                );
            },
            sortable: true,
        },
        {
            header: 'Categoría',
            accessor: 'categorias',
            render: (categoria: { nombre?: string }) =>
                categoria?.nombre ? (
                    <Badge variant="brand">{categoria.nombre}</Badge>
                ) : (
                    <span className="text-fg-muted">—</span>
                ),
            sortable: true,
        },
    ];

    return (
        <Section
            title="Jugadores"
            subtitle="Administra la lista de jugadores del club"
            className={className}
            actions={
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <Select
                        value={selectedCategoriaId}
                        onChange={(e) => setSelectedCategoriaId(e.target.value)}
                        className="sm:w-48"
                    >
                        <option value="">Todas las categorías</option>
                        {categorias.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                                {cat.nombre}
                            </option>
                        ))}
                    </Select>
                    {!showForm && (
                        <Button
                            variant="primary"
                            size="sm"
                            leadingIcon={<PlusIcon className="h-4 w-4" />}
                            onClick={() => setShowForm(true)}
                            disabled={isLoading}
                        >
                            Nuevo
                        </Button>
                    )}
                </div>
            }
        >
            {showForm ? (
                <JugadorForm
                    onSuccessAction={() => {
                        setShowForm(false);
                        fetchJugadores(currentPage, itemsPerPage);
                    }}
                    onCancelAction={() => setShowForm(false)}
                />
            ) : (
                <DataTable
                    columns={columns}
                    data={jugadores}
                    currentPage={currentPage}
                    itemsPerPage={itemsPerPage}
                    totalItems={totalItems}
                    onPageChange={setCurrentPage}
                    onItemsPerPageChange={setItemsPerPage}
                    isLoading={isLoading}
                    rowKey={(row: Jugador) => row.id}
                />
            )}
        </Section>
    );
}
