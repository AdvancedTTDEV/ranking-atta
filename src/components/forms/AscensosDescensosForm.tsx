'use client'
import { useState, useEffect, useMemo } from 'react'
import { toast } from 'react-hot-toast'
import { fetchCache } from '@/lib/fetchCache'
import PlayerSelector from '@/components/ui/PlayerSelector'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'

interface Jugador {
    id: number
    nombre: string
    /** ID de la categoría actual. La API /api/jugadores?all=true lo expone
     *  como escalar raíz; algunas respuestas (no `all`) lo anidan en `categorias`. */
    categoria_id?: number
    categorias?: {
        id: number
        nombre: string
    }
}

interface Categoria {
    id: number
    nombre: string
    elo_inicial?: number
}

interface Props {
    tipo: 'ascenso' | 'descenso'
    onClose: () => void
}

/** Devuelve el ID de categoría actual de un jugador, venga del escalar
 *  raíz o de la relación anidada. */
const idCategoriaActual = (j: Jugador): number | undefined =>
    j.categoria_id ?? j.categorias?.id

export default function GestionAscensoDescenso({ tipo, onClose }: Props) {
    const [categorias, setCategorias] = useState<Categoria[]>([])
    const [jugadores, setJugadores] = useState<Jugador[]>([])
    const [selectedCategoriaId, setSelectedCategoriaId] = useState<string>('')
    const [selectedJugadores, setSelectedJugadores] = useState<Jugador[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [showConfirmation, setShowConfirmation] = useState(false)

    // Orden de categorías por rango (mayor elo_inicial = categoría más alta).
    // Si el campo no viene, caemos al orden de la API (alfabético por nombre)
    // y avisamos para no filtrar en silencio.
    const categoriasPorRango = useMemo(() => {
        if (categorias.length === 0) return [] as Categoria[]
        const conElo = categorias.every(c => typeof c.elo_inicial === 'number')
        if (!conElo) {
            console.warn(
                'AscensosDescensos: alguna categoría no tiene elo_inicial; el orden por rango puede no ser el correcto.'
            )
        }
        return [...categorias].sort((a, b) => (b.elo_inicial ?? 0) - (a.elo_inicial ?? 0))
    }, [categorias])

    // Categorías que pueden gestionar ascensos/descensos.
    // El dropdown muestra la categoría ORIGEN del jugador (de dónde sale).
    // - Ascenso: el origen es cualquier categoría que tenga una superior,
    //   o sea, todas excepto la más alta (primera posición del array).
    // - Descenso: el origen es cualquier categoría que tenga una inferior,
    //   o sea, todas excepto la más baja (última posición del array).
    const categoriasGestionables = useMemo(() => {
        if (categoriasPorRango.length === 0) return [] as Categoria[]
        if (tipo === 'ascenso') {
            return categoriasPorRango.slice(1)
        }
        return categoriasPorRango.slice(0, -1)
    }, [categoriasPorRango, tipo])

    useEffect(() => {
        const fetchCategorias = async () => {
            try {
                const data = await fetchCache<never[]>('/api/categorias')
                setCategorias(data as never)
            } catch (error) {
                console.error(error)
                toast.error('Error al obtener categorías')
            }
        }
        fetchCategorias()
    }, [tipo])

    // Cuando cambian las categorías gestionables (por tipo o por carga),
    // mantenemos la selección si sigue siendo válida; si no, elegimos la
    // primera gestionable.
    useEffect(() => {
        if (categoriasGestionables.length === 0) {
            setSelectedCategoriaId('')
            return
        }
        setSelectedCategoriaId(prev => {
            if (prev && categoriasGestionables.some(c => c.id.toString() === prev)) {
                return prev
            }
            return categoriasGestionables[0].id.toString()
        })
    }, [categoriasGestionables])

    useEffect(() => {
        if (!selectedCategoriaId) {
            setJugadores([])
            return
        }
        const fetchJugadores = async () => {
            try {
                const data = await fetchCache<{ jugadores: never[] }>(`/api/jugadores?all=true&categoriaId=${selectedCategoriaId}`)
                setJugadores(data.jugadores)
            } catch (error) {
                console.error(error)
                toast.error('Error al obtener jugadores')
            }
        }
        fetchJugadores()
    }, [selectedCategoriaId])

    const handleJugadorChange = (jugador: Jugador) => {
        setSelectedJugadores(prev => {
            const exists = prev.find(j => j.id === jugador.id)
            return exists ? prev.filter(j => j.id !== jugador.id) : [...prev, jugador]
        })
    }

    const handleRemoveJugador = (jugadorId: number) => {
        setSelectedJugadores(prev => prev.filter(j => j.id !== jugadorId))
    }

    /** Dado el id de la categoría actual y el tipo de movimiento,
     *  devuelve la categoría destino dentro del rango gestionable.
     *  Devuelve `null` si el jugador está en una categoría que no se
     *  debería estar moviendo (top en ascenso, bottom en descenso). */
    const categoriaDestino = (catIdActual: number): Categoria | null => {
        const idx = categoriasPorRango.findIndex(c => c.id === catIdActual)
        if (idx === -1) return null
        const nuevoIdx = tipo === 'ascenso' ? idx - 1 : idx + 1
        if (nuevoIdx < 0 || nuevoIdx >= categoriasPorRango.length) return null
        return categoriasPorRango[nuevoIdx]
    }

    const handleSubmit = async () => {
        setIsSubmitting(true)
        try {
            const motivo = tipo === 'ascenso' ? 'Ascenso' : 'Descenso'

            // Agrupamos por categoría actual: si un jugador está en una
            // categoría que no aplica para el movimiento, lo omitimos con
            // un aviso. Esto evita mandar IDs inválidos al procedimiento.
            const grupos = new Map<number, Jugador[]>()
            const omitidos: { jugador: Jugador; motivo: string }[] = []

            for (const j of selectedJugadores) {
                const catId = idCategoriaActual(j)
                if (catId === undefined) {
                    omitidos.push({ jugador: j, motivo: 'sin categoría' })
                    continue
                }
                const destino = categoriaDestino(catId)
                if (!destino) {
                    omitidos.push({
                        jugador: j,
                        motivo: tipo === 'ascenso'
                            ? 'ya está en la categoría más alta'
                            : 'ya está en la categoría más baja',
                    })
                    continue
                }
                if (!grupos.has(destino.id)) grupos.set(destino.id, [])
                grupos.get(destino.id)!.push(j)
            }

            if (omitidos.length > 0) {
                const nombres = omitidos.map(o => `${o.jugador.nombre} (${o.motivo})`).join(', ')
                toast.error(`Omitidos: ${nombres}`)
            }

            if (grupos.size === 0) {
                setIsSubmitting(false)
                setShowConfirmation(false)
                return
            }

            for (const [newCategoriaId, jugadoresGrupo] of grupos) {
                const res = await fetch('/api/jugadores/cambiar-categoria', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jugadores: jugadoresGrupo,
                        nuevaCategoriaId: newCategoriaId,
                        motivo
                    })
                })

                if (!res.ok) {
                    const errorData = await res.json()
                    toast.error(errorData.error || 'Error al aplicar cambios')
                    return
                }
            }

            toast.success(`${motivo}s aplicados correctamente`)
            window.dispatchEvent(new Event('ranking:refresh'))
            onClose()
        } catch (err) {
            console.error(err)
            toast.error('Error de conexión')
        } finally {
            setIsSubmitting(false)
            setShowConfirmation(false)
        }
    }

    const getCategoriaChange = (jugador: Jugador) => {
        const catId = idCategoriaActual(jugador)
        const actual = jugador.categorias?.nombre
            ?? categorias.find(c => c.id === catId)?.nombre
            ?? 'Desconocida'
        const destino = catId !== undefined ? categoriaDestino(catId) : null
        return {
            actual,
            nueva: destino?.nombre ?? 'Desconocida',
        }
    }

    const esAscenso = tipo === 'ascenso'

    return (
        <>
            {/* La confirmación REEMPLAZA el contenido: queda visible de inmediato
                sin depender de la posición del scroll (clave en móvil). */}
            {showConfirmation ? (
                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold text-fg">
                            Confirmar {esAscenso ? 'ascensos' : 'descensos'}
                        </h4>
                        <button
                            type="button"
                            onClick={() => setShowConfirmation(false)}
                            className="btn btn-ghost btn-icon"
                            aria-label="Cerrar confirmación"
                            disabled={isSubmitting}
                        >
                            ✕
                        </button>
                    </div>
                    <p className="text-sm text-fg-muted">Estás a punto de realizar los siguientes cambios:</p>
                    <div className="card-flush p-2 max-h-[38vh] overflow-y-auto scrollbar-thin">
                        <ul className="divide-y divide-line">
                            {selectedJugadores.map(jugador => {
                                const { actual, nueva } = getCategoriaChange(jugador)
                                return (
                                    <li key={jugador.id} className="flex justify-between items-center py-2 px-2 gap-2">
                                        <span className="font-medium text-fg truncate">{jugador.nombre}</span>
                                        <div className="flex items-center gap-2 text-sm shrink-0">
                                            <span className="text-fg-muted">{actual}</span>
                                            <span className="text-fg-muted">→</span>
                                            <span className="font-semibold text-fg">{nueva}</span>
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                    <div className="banner banner-warning">
                        Esta acción no se puede deshacer. ¿Desea continuar?
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setShowConfirmation(false)} disabled={isSubmitting}>
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            variant={esAscenso ? 'success' : 'danger'}
                            onClick={handleSubmit}
                            isLoading={isSubmitting}
                        >
                            {isSubmitting ? 'Procesando…' : 'Confirmar cambios'}
                        </Button>
                    </div>
                </div>
            ) : (
            <>
            {/* Selector de categoría */}
            <div className="flex flex-wrap items-center gap-3 mb-4 pb-4 border-b border-line">
                <Select
                    label="Categoría"
                    value={selectedCategoriaId}
                    onChange={(e) => setSelectedCategoriaId(e.target.value)}
                    className="w-auto min-w-[14rem]"
                >
                    {categoriasGestionables.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                    ))}
                </Select>
                <p className="text-xs text-fg-muted">
                    Cambia de categoría para seleccionar jugadores de cada una
                </p>
            </div>

            {/* Dos columnas en desktop, stacked en mobile */}
            <div className="flex flex-col md:flex-row md:gap-4 md:h-[50vh] gap-3">

                {/* Izquierda — buscador y checkboxes */}
                <div className="flex-1 flex flex-col card overflow-hidden min-h-[180px] max-h-[42vh] md:min-h-0 md:max-h-none">
                    <div className="card-header-row bg-surface-2">
                        <h3 className="text-sm font-semibold text-fg">Jugadores disponibles</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 sm:p-4 scrollbar-thin overscroll-contain">
                        <PlayerSelector
                            jugadores={jugadores}
                            selectedJugadores={selectedJugadores}
                            onJugadorChange={handleJugadorChange}
                            onRemoveJugador={handleRemoveJugador}
                            showTags={false}
                        />
                    </div>
                </div>

                {/* Derecha — seleccionados */}
                <div className="flex flex-col card overflow-hidden shrink-0 max-h-[34vh] md:w-72 md:max-h-[40vh]">
                    <div className="card-header-row bg-surface-2">
                        <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
                            {esAscenso ? 'A ascender' : 'A descender'}
                            <span className={`badge ${esAscenso ? 'badge-success' : 'badge-danger'}`}>
                                {selectedJugadores.length}
                            </span>
                        </h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
                        {selectedJugadores.length === 0 ? (
                            <div className="text-center text-fg-muted text-sm mt-8">
                                <p className="text-2xl mb-2">←</p>
                                <p>Selecciona jugadores de la lista</p>
                            </div>
                        ) : (
                            <ul className="space-y-1.5">
                                {selectedJugadores.map((j, idx) => {
                                    const { actual, nueva } = getCategoriaChange(j)
                                    return (
                                        <li
                                            key={j.id}
                                            className={`rounded-lg px-3 py-2 text-sm border ${
                                                esAscenso
                                                    ? 'bg-success-soft border-success/30'
                                                    : 'bg-danger-soft border-danger/30'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="flex items-center gap-2 min-w-0">
                                                    <span className="text-fg-muted text-xs w-4 shrink-0">{idx + 1}.</span>
                                                    <span className="font-medium text-fg truncate">{j.nombre}</span>
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveJugador(j.id)}
                                                    className="text-fg-muted hover:text-danger ml-2 shrink-0"
                                                    aria-label="Quitar"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                            <p className="text-xs text-fg-muted mt-1 ml-5">
                                                {actual} → <span className="font-semibold text-fg">{nueva}</span>
                                            </p>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="flex flex-wrap justify-between items-center gap-2 mt-4 pt-4 border-t border-line">
                <span className="text-sm text-fg-muted">
                    {selectedJugadores.length} jugador{selectedJugadores.length !== 1 ? 'es' : ''} seleccionado{selectedJugadores.length !== 1 ? 's' : ''}
                </span>
                <div className="flex gap-2">
                    <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        variant={esAscenso ? 'success' : 'danger'}
                        onClick={() => setShowConfirmation(true)}
                        disabled={selectedJugadores.length === 0 || isSubmitting}
                    >
                        {esAscenso ? 'Ascender seleccionados' : 'Descender seleccionados'}
                    </Button>
                </div>
            </div>
            </>
            )}
        </>
    )
}
