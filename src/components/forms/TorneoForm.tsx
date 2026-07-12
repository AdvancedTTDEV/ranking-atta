'use client'
import { useState, useEffect, FormEvent } from 'react'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'

interface Categoria {
    id: number
    nombre: string
}

interface TorneoFormProps {
    onSuccessAction: () => void
    onCancelAction: () => void
}

export default function TorneoForm({ onSuccessAction, onCancelAction }: TorneoFormProps) {
    const [nombre, setNombre] = useState('')
    const [fecha, setFecha] = useState(format(new Date(), 'yyyy-MM-dd'))
    const [ubicacion, setUbicacion] = useState('')
    const [modalidad, setModalidad] = useState('INDIVIDUAL')
    const [categoriasSeleccionadas, setCategoriasSeleccionadas] = useState<number[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [categorias, setCategorias] = useState<Categoria[]>([])

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
        setCategoriasSeleccionadas((prev) =>
            prev.includes(categoriaId)
                ? prev.filter((id) => id !== categoriaId)
                : [...prev, categoriaId]
        )
    }

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setIsSubmitting(true)
        // Para DOBLES/EQUIPOS el backend asigna todas las categorías; para
        // INDIVIDUAL respetamos la selección manual del formulario.
        const categoriasAEnviar = modalidad === 'INDIVIDUAL' ? categoriasSeleccionadas : []
        if (modalidad === 'INDIVIDUAL' && categoriasAEnviar.length === 0) {
            toast.error('Selecciona al menos una categoría')
            setIsSubmitting(false)
            return
        }
        const torneoData = {
            nombre,
            fecha,
            ubicacion,
            modalidad,
            categorias: categoriasAEnviar,
        }
        try {
            const response = await fetch('/api/torneos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(torneoData),
            })
            if (response.ok) {
                toast.success('Torneo creado exitosamente')
                onSuccessAction()
            } else {
                const errorData = await response.json()
                toast.error(errorData.message || 'Error al crear torneo')
            }
        } catch {
            toast.error('Error de conexión')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <Input
                label="Nombre del Torneo"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Abierto de Primavera 2025"
                required
                autoFocus
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                    label="Modalidad"
                    value={modalidad}
                    onChange={(e) => setModalidad(e.target.value)}
                >
                    <option value="INDIVIDUAL">Individual</option>
                    <option value="DOBLES">Dobles</option>
                    <option value="EQUIPOS">Por equipos</option>
                </Select>
                <Input
                    label="Fecha"
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    required
                />
            </div>

            <Input
                label="Ubicación"
                value={ubicacion}
                onChange={(e) => setUbicacion(e.target.value)}
                placeholder="Ej. Polideportivo Central"
            />

            <div>
                <label className="label">Categorías</label>
                {modalidad === 'INDIVIDUAL' ? (
                    categorias.length === 0 ? (
                        <p className="text-sm text-fg-muted">Cargando categorías…</p>
                    ) : (
                        <div className="grid grid-cols-2 gap-2">
                            {categorias.map((categoria) => {
                                const checked = categoriasSeleccionadas.includes(categoria.id)
                                return (
                                    <label
                                        key={categoria.id}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors ${
                                            checked
                                                ? 'border-brand bg-brand-soft text-fg'
                                                : 'border-line text-fg-muted hover:border-line-strong hover:text-fg'
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => handleCheckboxChange(categoria.id)}
                                            className="h-4 w-4 rounded border-line-strong text-brand focus:ring-brand"
                                        />
                                        <span className="text-sm">{categoria.nombre}</span>
                                    </label>
                                )
                            })}
                        </div>
                    )
                ) : (
                    <div className="banner banner-info text-xs">
                        Los torneos de {modalidad === 'DOBLES' ? 'dobles' : 'por equipos'} son
                        abiertos a todas las categorías. Se asignarán automáticamente al crear el torneo.
                    </div>
                )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={onCancelAction} disabled={isSubmitting}>
                    Cancelar
                </Button>
                <Button type="submit" variant="primary" isLoading={isSubmitting}>
                    {isSubmitting ? 'Guardando…' : 'Guardar'}
                </Button>
            </div>
        </form>
    )
}
