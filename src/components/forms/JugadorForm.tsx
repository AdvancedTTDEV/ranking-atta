'use client'
import { useState, useEffect, FormEvent, useMemo, useRef } from 'react'
import { toast } from 'react-hot-toast'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'

interface Club {
    id: number
    nombre: string
}

interface Categoria {
    id: number
    nombre: string
}

interface JugadorFormProps {
    onSuccessAction: () => void
    onCancelAction: () => void
}

export default function JugadorForm({ onSuccessAction, onCancelAction }: JugadorFormProps) {
    const [nombre, setNombre] = useState('')
    const [clubId, setClubId] = useState('')
    const [categoriaId, setCategoriaId] = useState('')
    const [elo, setElo] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [clubes, setClubes] = useState<Club[]>([])
    const [categorias, setCategorias] = useState<Categoria[]>([])

    // Searchable club dropdown
    const [clubSearch, setClubSearch] = useState('')
    const [showClubResults, setShowClubResults] = useState(false)
    const clubDropdownRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [clubesRes, categoriasRes] = await Promise.all([
                    fetch('/api/clubes?all=true'),
                    fetch('/api/categorias'),
                ])
                const clubesData = await clubesRes.json()
                const categoriasData = await categoriasRes.json()
                setClubes(clubesData.clubes || [])
                setCategorias(categoriasData || [])
                if (categoriasData.length > 0) {
                    setCategoriaId(categoriasData[0].id.toString())
                }
            } catch (error) {
                console.error('Fetch error:', error)
                toast.error('Error al cargar datos')
            }
        }
        fetchData()
    }, [])

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (clubDropdownRef.current && !clubDropdownRef.current.contains(e.target as Node)) {
                setShowClubResults(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const filteredClub = useMemo(() => {
        if (!clubSearch) return clubes
        const term = clubSearch.toLowerCase()
        return clubes.filter(
            (club) => club.nombre.toLowerCase().includes(term) || club.id.toString().includes(term)
        )
    }, [clubes, clubSearch])

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setIsSubmitting(true)
        const jugadorData = {
            nombre,
            club_id: clubId,
            categoria_id: categoriaId,
            elo: elo ? parseFloat(elo) : null,
        }
        try {
            const response = await fetch('/api/jugadores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(jugadorData),
            })
            if (response.ok) {
                toast.success('Jugador creado exitosamente')
                onSuccessAction()
            } else {
                const errorData = await response.json()
                toast.error(errorData.message || 'Error al crear jugador')
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
                label="Nombre del Jugador"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Juan Pérez"
                required
                autoFocus
            />

            {/* Searchable Club dropdown */}
            <div className="w-full" ref={clubDropdownRef}>
                <label htmlFor="club-search" className="label">
                    Club
                </label>
                <div className="relative">
                    <input
                        id="club-search"
                        type="text"
                        value={clubSearch}
                        onChange={(e) => {
                            setClubSearch(e.target.value)
                            setShowClubResults(true)
                        }}
                        onFocus={() => setShowClubResults(true)}
                        placeholder="Buscar club…"
                        className="input-base"
                        required
                        autoComplete="off"
                    />
                    {showClubResults && filteredClub.length > 0 && (
                        <div className="absolute z-20 mt-1 w-full card-elevated max-h-60 overflow-auto scrollbar-thin py-1">
                            {filteredClub.map((club) => (
                                <button
                                    key={club.id}
                                    type="button"
                                    onClick={() => {
                                        setClubId(club.id.toString())
                                        setClubSearch(club.nombre)
                                        setShowClubResults(false)
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm text-fg hover:bg-subtle transition-colors"
                                >
                                    {club.nombre}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <p className="form-hint">Escribe para filtrar clubes existentes.</p>
            </div>

            <Select
                label="Categoría"
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                required
            >
                {categorias.map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>
                        {categoria.nombre}
                    </option>
                ))}
            </Select>

            <Input
                label="ELO Inicial"
                hint="Opcional. Si lo dejas vacío, se asignará un valor por defecto."
                type="number"
                value={elo}
                onChange={(e) => setElo(e.target.value)}
                step="0.1"
            />

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
