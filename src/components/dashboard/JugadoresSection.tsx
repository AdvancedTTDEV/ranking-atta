'use client';

import { useState, useEffect } from 'react';
import JugadorForm from '@/components/forms/JugadorForm';
import DataTable from '@/components/ui/DataTable';
import { PlusIcon } from '@heroicons/react/24/outline';

type Jugador = {
  id: number;
  nombre: string;
  elo: number;
  clubes?: { nombre?: string };
  categorias?: { nombre?: string };
};

type Categoria = {
  id: number
  nombre: string
}

export default function JugadoresSection({ className = '' }: { className?: string }) {
  const [showForm, setShowForm] = useState(false);
  const [jugadores, setJugadores] = useState<Jugador[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [selectedCategoriaId, setSelectedCategoriaId] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
//edicion directa desde el DT
  const [editingJugadorId, setEditingJugadorId] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string | number>('');
  const [selectedClubId, setSelectedClubId] = useState<number | null>(null);
  const [showClubResults, setShowClubResults] = useState(false);
  const [clubes, setClubes] = useState<{ id: number; nombre: string }[]>([]);
  const [filteredClubes, setFilteredClubes] = useState<typeof clubes>([]);


  // Obtener categorías disponibles
  const fetchCategorias = async () => {
    try {
      const response = await fetch('/api/categorias')
      const data = await response.json()
      setCategorias(data)
    } catch (error) {
      console.error('Error fetching categories:', error)
    }
  }

  const fetchJugadores = async (page: number, limit: number) => {
    setIsLoading(true);
    try {
      const url = `/api/ranking?page=${page}&limit=${limit}${
          selectedCategoriaId ? `&categoriaId=${selectedCategoriaId}` : ''
      }`
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
    // Resetear a página 1 cuando cambia la categoría
    setCurrentPage(1)
    fetchJugadores(1, itemsPerPage)
  }, [selectedCategoriaId])

  // Initial fetch and pagination changes
  useEffect(() => {
    fetchJugadores(currentPage, itemsPerPage);
  }, [currentPage, itemsPerPage]);

  const columns = [
    { header: 'ID', accessor: 'id', sortable: true },
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
                  className="border rounded px-1 py-0.5 w-full"
              />
          );
        }
        return (
            <span onClick={() => handleEditStart(row.id, 'nombre', nombre)} className="cursor-pointer hover:underline">
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
                          className="border rounded px-1 py-0.5 w-full"
                      />
                  );
              }

              return (
                  <span
                      onClick={() => handleEditStart(row.id, 'elo', elo)}
                      className="cursor-pointer hover:underline"
                  >
        {elo}
      </span>
              );
          },
          sortable: true,
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
                  className="w-full border border-gray-300 rounded-md p-1"
              />
              {showClubResults && filteredClubes.length > 0 && (
                  <div className="absolute z-10 mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-40 overflow-auto w-full">
                    {filteredClubes.map((club) => (
                        <div
                            key={club.id}
                            className="p-2 hover:bg-gray-100 cursor-pointer"
                            onMouseDown={async () => {
                              setEditingValue(club.nombre);
                              setSelectedClubId(club.id);
                              setShowClubResults(false);

                              // Actualiza en la base de datos
                              await fetch(`/api/jugadores/${row.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ club_id: club.id }),
                              });

                              // Vuelve a cargar
                              fetchJugadores(currentPage, itemsPerPage);
                              setEditingJugadorId(null);
                              setEditingField(null);
                            }}
                        >
                          {club.nombre}
                        </div>
                    ))}
                  </div>
              )}
            </div>
        ) : (
            <div
                className="cursor-pointer"
                onClick={() => handleEditStart(row.id, 'clubes', club?.nombre || '')}
            >
              {club?.nombre || 'Sin club'}
            </div>
        );
      },
      sortable: true,
    },

    {
      header: 'Categoría',
      accessor: 'categorias',
      render: (categoria: { nombre?: string }) => categoria?.nombre || 'Sin categoría',
      sortable: true,
    },
  ];

  if (isLoading && currentPage === 1) {
    return (
        <div className={`bg-white rounded-lg shadow p-4 ${className}`}>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Jugadores</h2>
            <div className="h-8 w-24 bg-gray-200 rounded animate-pulse"></div>
          </div>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 rounded animate-pulse"></div>
            ))}
          </div>
        </div>
    );
  }

  return (
      <div className={`bg-white rounded-lg shadow p-4 ${className}`}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Jugadores</h2>

          {/* Contenedor para filtro y botón - CORREGIDO */}
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <select
                value={selectedCategoriaId}
                onChange={(e) => setSelectedCategoriaId(e.target.value)}
                className="border rounded px-3 py-1 w-full md:w-48"
            >
              <option value="">Todas las categorías</option>
              {categorias.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.nombre}
                  </option>
              ))}
            </select>
            <button
                onClick={() => setShowForm(true)}
                className="bg-blue-600 text-white px-3 py-1 rounded flex items-center hover:bg-blue-700 transition-colors"
                disabled={isLoading}
            >
              <PlusIcon className="h-4 w-4 mr-1" />
              Nuevo
            </button>
          </div>
        </div> {/* Fin del div de header */}

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
                onRowClick={(row) => console.log(row)}
                currentPage={currentPage}
                itemsPerPage={itemsPerPage}
                totalItems={totalItems}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={setItemsPerPage}
                isLoading={isLoading}
            />
        )}
      </div>
  );
}