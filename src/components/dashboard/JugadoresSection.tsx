'use client';

import { useEffect, useState } from 'react';
import JugadorForm from '@/components/forms/JugadorForm';
import DataTable from '@/components/ui/DataTable';
import { PlusIcon } from '@heroicons/react/24/outline';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import toast from 'react-hot-toast';
import { useRecurso } from '@/app/hooks/useRecurso';
import Buscador, { useDebounce } from '@/components/ui/Buscador';

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

type RankingResponse = {
    jugadores: Jugador[];
    total: number;
};

export default function JugadoresSection({ className = '' }: { className?: string }) {
    const [showForm, setShowForm] = useState(false);
    const [selectedCategoriaId, setSelectedCategoriaId] = useState<string>('');
    const [busqueda, setBusqueda] = useState('');
    const busquedaDebounce = useDebounce(busqueda);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    // edición directa
    const [editingJugadorId, setEditingJugadorId] = useState<number | null>(null);
    const [editingField, setEditingField] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState<string | number>('');
    const [showClubResults, setShowClubResults] = useState(false);

    // Un solo useRecurso por recurso: la URL derivada dispara la carga y
    // cancela requests viejos al cambiar página/filtro (adiós doble fetch).
    const { datos, setDatos, isLoading, refresh, actualizar } = useRecurso<RankingResponse>(
        `/api/ranking?page=${currentPage}&limit=${itemsPerPage}${
            selectedCategoriaId ? `&categoriaId=${selectedCategoriaId}` : ''
        }${busquedaDebounce ? `&nombre=${encodeURIComponent(busquedaDebounce)}` : ''}`
    );
    const { datos: datosCategorias } = useRecurso<Categoria[]>('/api/categorias');
    const { datos: datosClubes } = useRecurso<{ clubes: { id: number; nombre: string }[] }>('/api/clubes?all=true');

    const jugadores = datos?.jugadores ?? [];
    const totalItems = datos?.total ?? 0;
    const categorias = datosCategorias ?? [];
    const clubes = datosClubes?.clubes ?? [];
    const filteredClubes = clubes.filter((c) =>
        c.nombre.toLowerCase().includes(String(editingValue).toLowerCase())
    );

    // Al cambiar el filtro de categoría o la búsqueda, volver a la primera página.
    useEffect(() => {
        setCurrentPage(1);
    }, [selectedCategoriaId, busquedaDebounce]);

    const handleEditStart = (jugadorId: number, field: string, currentValue: string | number) => {
        setEditingJugadorId(jugadorId);
        setEditingField(field);
        setEditingValue(currentValue);
    };

    const limpiarEdicion = () => {
        setEditingJugadorId(null);
        setEditingField(null);
        setEditingValue('');
    };

    interface PatchJugadorArgs {
        payload: Record<string, unknown>;
        /** Cómo reflejar el cambio en la fila local (update optimista). */
        aplicarA?: (j: Jugador) => Partial<Jugador>;
    }

    /** PATCH con update optimista y rollback en error. */
    const patchJugador = async (jugadorId: number, { payload, aplicarA }: PatchJugadorArgs, mensajeExito?: string) => {
        const previo = datos;
        actualizar(prev =>
            prev
                ? {
                      ...prev,
                      jugadores: prev.jugadores.map(j => (j.id === jugadorId ? { ...j, ...(aplicarA?.(j) ?? {}) } : j)),
                  }
                : prev
        );
        try {
            const res = await fetch(`/api/jugadores/${jugadorId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Error ${res.status}`);
            if (mensajeExito) toast.success(mensajeExito);
            return true;
        } catch (error: any) {
            setDatos(previo);
            console.error('Error guardando edición:', error);
            toast.error(error.message ?? 'No se pudo guardar');
            return false;
        }
    };

    const handleEditSave = async () => {
        if (editingJugadorId === null || editingField === null) return;
        const jugadorId = editingJugadorId;
        const campo = editingField;
        const valor = editingValue;

        await patchJugador(
            jugadorId,
            {
                payload: { [campo]: valor },
                aplicarA: () => ({ [campo]: valor } as Partial<Jugador>),
            },
            'Jugador actualizado'
        );
        limpiarEdicion();
    };

    const columns = [
        {
            header: 'ID',
            accessor: 'id',
            sortable: true,
            className: 'w-16 text-fg-muted',
            ocultarEnMovil: true,
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
                                if (e.key === 'Escape') limpiarEdicion();
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
                                if (e.key === 'Escape') limpiarEdicion();
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
            ocultarEnMovil: true,
            render: (club: { nombre?: string }, row: Jugador) => {
                const isEditing = editingJugadorId === row.id && editingField === 'clubes';

                return isEditing ? (
                    <div className="relative">
                        <input
                            type="text"
                            value={editingValue}
                            onChange={(e) => {
                                setEditingValue(e.target.value);
                                setShowClubResults(true);
                            }}
                            onFocus={() => setShowClubResults(true)}
                            onBlur={() => setTimeout(() => setShowClubResults(false), 200)}
                            autoFocus
                            className="input-base py-1 text-sm"
                        />
                        {showClubResults && filteredClubes.length > 0 && (
                            <div className="absolute z-20 mt-1 w-full card-elevated max-h-40 overflow-auto scrollbar-thin py-1">
                                {filteredClubes.map((clubOpcion) => (
                                    <button
                                        key={clubOpcion.id}
                                        type="button"
                                        onClick={async () => {
                                            setShowClubResults(false);
                                            const ok = await patchJugador(
                                                row.id,
                                                {
                                                    payload: { club_id: clubOpcion.id },
                                                    aplicarA: (j: Jugador) => ({ clubes: { nombre: clubOpcion.nombre } }),
                                                },
                                                'Club actualizado'
                                            );
                                            if (ok) limpiarEdicion();
                                        }}
                                        className="w-full text-left px-3 py-1.5 text-sm text-fg hover:bg-subtle"
                                    >
                                        {clubOpcion.nombre}
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
            compact
            className={className}
            actions={
                !showForm && (
                    <Button
                        variant="primary"
                        size="sm"
                        leadingIcon={<PlusIcon className="h-4 w-4" />}
                        onClick={() => setShowForm(true)}
                        disabled={isLoading}
                    >
                        Nuevo
                    </Button>
                )
            }
        >
            {showForm ? (
                <JugadorForm
                    onSuccessAction={() => {
                        setShowForm(false);
                        refresh();
                    }}
                    onCancelAction={() => setShowForm(false)}
                />
            ) : (
                <DataTable
                    toolbar={
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Buscador
                                valor={busqueda}
                                onCambiar={setBusqueda}
                                placeholder="Buscar jugador…"
                                className="sm:w-56"
                            />
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
                        </div>
                    }
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
