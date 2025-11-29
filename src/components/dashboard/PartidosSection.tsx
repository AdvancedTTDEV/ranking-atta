'use client'
import { useState, useEffect } from 'react'
import DataTable from '@/components/ui/DataTable'
import {ArrowDownIcon, PlusIcon} from '@heroicons/react/24/outline'
import PartidoForm from '@/components/forms/PartidoForm'
import { safeFetch } from '@/lib/api'
import {toast} from "react-hot-toast";

type Partido = {
  id: number
  jugador1Nombre: string
  jugador2Nombre: string
  ganadorNombre: string
  torneoNombre: string
  ronda: string,
  fecha: string
}

type Torneo = {
  id: number
  nombre: string
}
type PaginatedResponse = {
  partidos: Partido[]
  total: number
}

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
  
  const fetchPartidos = async (page: number, limit: number) => {
  try {
    setIsLoading(true)
    setError(null)
      const data = await safeFetch(
          `/api/partidos?page=${page}&limit=${limit}${selectedTorneoId ? `&torneo_id=${selectedTorneoId}` : ''}`
      );

      // Usa directamente las propiedades que vienen del backend
    const parsed = data.partidos.map((partido: any) => ({
      id: partido.id,
      jugador1Nombre: partido.jugador1Nombre, // Usar la propiedad directa
      jugador2Nombre: partido.jugador2Nombre,
      ganadorNombre: partido.ganadorNombre,
      torneoNombre: partido.torneoNombre,
      ronda: partido.ronda,
      fecha: partido.fecha // Ya viene formateada desde el backend
    }))
    
    setPartidos(parsed)
    setTotalItems(data.total)
  } catch (err) {
    console.error('Failed to fetch matches:', err)
    setError('Error al cargar partidos. Intente nuevamente.')
  } finally {
    setIsLoading(false)
  }
}
  
  useEffect(() => {
    fetchPartidos(currentPage, itemsPerPage)
  }, [currentPage, itemsPerPage, selectedTorneoId])

    useEffect(() => {
        const fetchTorneos = async () => {
            try {
                const data = await safeFetch('/api/torneos')
                setTorneos(data.torneos)
            } catch (err) {
                console.error('Error al cargar torneos:', err)
            }
        }
        fetchTorneos()
    }, [])

    const handleTorneoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedTorneoId(e.target.value)
        setCurrentPage(1) // 🔄 Resetear a primera página
    }
    const handleUndo = async (id: number) => {
        if (!confirm("¿Revertir este partido?")) return

        try {
            const res = await fetch(`/api/partidos/${id}/revert`, {
                method: 'POST'
            })

            if (res.ok) {
                toast.success('Partido revertido')
                fetchPartidos(currentPage, itemsPerPage)
            } else {
                toast.error('Error al revertir')
            }

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (err) {
            toast.error('Error de conexión')
        }
    }


    const columns = [
        { header: 'ID', accessor: 'id' },
        { header: 'Jugador 1', accessor: 'jugador1Nombre' },
        { header: 'Jugador 2', accessor: 'jugador2Nombre' },
        { header: 'Ganador', accessor: 'ganadorNombre' },
        { header: 'Ronda', accessor: 'ronda' },
        { header: 'Torneo', accessor: 'torneoNombre' },
        { header: 'Fecha', accessor: 'fecha' },
        {
            header: 'Acciones',
            accessor: 'acciones',
            cell: (row: never) => (
                <button
                    onClick={() => handleUndo(row.id)}
                    className="text-red-600 hover:underline"
                >
                    Deshacer
                </button>
            ),
        }
    ]


    return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Partidos</h2>
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
              <select
                  value={selectedTorneoId}
                  onChange={handleTorneoChange}
                  className="border rounded px-3 py-1 w-full md:w-48"
              >
                  <option value="">Todos los Torneos</option>
                  {torneos.map((tournament) => (
                      <option key={tournament.id} value={tournament.id}>
                          {tournament.nombre}
                      </option>
                  ))}
              </select>
              <button
                  onClick={() => setShowForm(true)}
                  className="bg-blue-600 text-white px-3 py-1 rounded flex items-center"
              >
                  <PlusIcon className="h-4 w-4 mr-1" />
                  Nuevo
              </button>
          </div>
      </div>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}
      
      {showForm ? (
        <PartidoForm 
          onSuccessAction={() => {
            setShowForm(false)
            fetchPartidos(currentPage, itemsPerPage)
          }} 
          onCancelAction={() => setShowForm(false)}
        />
      ) : (
        <DataTable 
          columns={columns} 
          data={partidos} 
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
  )
}