'use client'
import { useState, useEffect, FormEvent } from 'react'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'

interface Categoria {
  id: number;
  nombre: string;
}

interface TorneoFormProps {
  onSuccessAction: () => void;
  onCancelAction: () => void;
}

export default function TorneoForm({ onSuccessAction, onCancelAction }: TorneoFormProps) { // ✅ Nombre corregido
  const [nombre, setNombre] = useState('')
  const [fecha, setFecha] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [ubicacion, setUbicacion] = useState('')
  const [modalidad, setModalidad] = useState('INDIVIDUAL')
  const [categoriasSeleccionadas, setCategoriasSeleccionadas] = useState<number[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [categorias, setCategorias] = useState<Categoria[]>([]) // ✅ Mover dentro del componente

  useEffect(() => {
    const fetchCategorias = async () => {
      try {
        const res = await fetch('/api/categorias')
        if (!res.ok) throw new Error('Error al cargar categorías')
        const data = await res.json()
        setCategorias(data)
      } catch (error) {
        toast.error('Error al cargar categorías')
        console.error(error)
      }
    }
    
    fetchCategorias()
  }, [])
  
  const handleCheckboxChange = (categoriaId: number) => {
    setCategoriasSeleccionadas(prev => 
      prev.includes(categoriaId)
        ? prev.filter(id => id !== categoriaId)
        : [...prev, categoriaId]
    )
  }
  
const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    
    const torneoData = {
      nombre,
      fecha,
      ubicacion,
      modalidad,
      categorias: categoriasSeleccionadas
    }
    
    try {
      const response = await fetch('/api/torneos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(torneoData)
      })
      
      if (response.ok) {
        toast.success('Torneo creado exitosamente')
        onSuccessAction()
      } else {
        const errorData = await response.json()
        toast.error(errorData.message || 'Error al crear torneo')
      }
    } catch (error) {
      toast.error('Error de conexión')
    } finally {
      setIsSubmitting(false)
    }
  }
  
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="nombre" className="block text-sm font-medium text-gray-700">
          Nombre del Torneo
        </label>
        <input
          type="text"
          id="nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
          required
        />
      </div>

      <div>
        <label htmlFor="modalidad" className="block text-sm font-medium text-gray-700">
          Modalidad
        </label>
        <select
          id="modalidad"
          value={modalidad}
          onChange={(e) => setModalidad(e.target.value)}
          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 bg-white"
        >
          <option value="INDIVIDUAL">Individual</option>
          <option value="DOBLES">Dobles</option>
          <option value="EQUIPOS">Por equipos</option>
        </select>
      </div>
      
      <div>
        <label htmlFor="fecha" className="block text-sm font-medium text-gray-700">
          Fecha
        </label>
        <input
          type="date"
          id="fecha"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
          required
        />
      </div>
      
      <div>
        <label htmlFor="ubicacion" className="block text-sm font-medium text-gray-700">
          Ubicación
        </label>
        <input
          type="text"
          id="ubicacion"
          value={ubicacion}
          onChange={(e) => setUbicacion(e.target.value)}
          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Categorías
        </label>
        <div className="mt-2 space-y-2">
          {categorias.map(categoria => (
            <div key={categoria.id} className="flex items-center">
              <input
                type="checkbox"
                id={`cat-${categoria.id}`}
                checked={categoriasSeleccionadas.includes(categoria.id)}
                onChange={() => handleCheckboxChange(categoria.id)}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor={`cat-${categoria.id}`} className="ml-2 text-sm text-gray-700">
                {categoria.nombre}
              </label>
            </div>
          ))}
        </div>
      </div>
      
      <div className="flex justify-end space-x-2">
        <button
          type="button"
          onClick={onCancelAction}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          disabled={isSubmitting}
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
