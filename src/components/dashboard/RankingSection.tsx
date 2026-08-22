'use client'
import { useEffect, useMemo, useState } from 'react'
import DataTable from '@/components/ui/DataTable'
import {
    ArrowDownTrayIcon,
    TrophyIcon,
    UserGroupIcon,
    FireIcon,
    ChartBarIcon,
    Squares2X2Icon,
} from '@heroicons/react/24/outline'
import { Section } from '@/components/ui/Section'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import toast from 'react-hot-toast'
import { useRecurso } from '@/app/hooks/useRecurso';
import Buscador, { useDebounce } from '@/components/ui/Buscador'
import AscensosDescensosCard from '@/components/dashboard/AscensosDescensosCard'
import { descargarBlob } from '@/lib/descargar-archivo'

type Jugador = {
    id: number
    ranking?: number
    nombre: string
    elo: number
    clubes?: { nombre?: string }
    categorias?: { id?: number; nombre?: string }
}

type Categoria = {
    id: number
    nombre: string
}

type RankingResponse = {
    jugadores: Jugador[]
    total: number
}

const ICONOS = [Squares2X2Icon, TrophyIcon, UserGroupIcon, FireIcon, ChartBarIcon]

export default function RankingSection({ className = '' }) {
    const [selectedCategoriaId, setSelectedCategoriaId] = useState<string>('')
    const [currentPage, setCurrentPage] = useState(1)
    const [itemsPerPage, setItemsPerPage] = useState(10)
    const [pdfLoading, setPdfLoading] = useState(false)
    const [busqueda, setBusqueda] = useState('')
    const busquedaDebounce = useDebounce(busqueda)

    // Listado paginado del escalafón (server-side).
    const { datos, isLoading, refresh } = useRecurso<RankingResponse>(
        `/api/ranking?page=${currentPage}&limit=${itemsPerPage}${
            selectedCategoriaId ? `&categoriaId=${selectedCategoriaId}` : ''
        }${busquedaDebounce ? `&nombre=${encodeURIComponent(busquedaDebounce)}` : ''}`
    )
    const { datos: datosCategorias } = useRecurso<Categoria[]>('/api/categorias')
    const categorias = datosCategorias ?? []

    // Descarga única (cacheada) para las estadísticas de las tarjetas:
    // total por categoría, ELO promedio y líder.
    const { datos: todos } = useRecurso<RankingResponse>('/api/ranking?all=true')

    const estadisticasPorCategoria = useMemo(() => {
        const mapa = new Map<number, { total: number; sumaElo: number; lider: Jugador | null }>()
        for (const j of todos?.jugadores ?? []) {
            const catId = j.categorias?.id
            if (!catId) continue
            const actual = mapa.get(catId) ?? { total: 0, sumaElo: 0, lider: null }
            actual.total += 1
            actual.sumaElo += Number(j.elo) || 0
            if (!actual.lider || (Number(j.elo) || 0) > (Number(actual.lider.elo) || 0)) {
                actual.lider = j
            }
            mapa.set(catId, actual)
        }
        return mapa
    }, [todos])

    const statsTodas = useMemo(() => {
        const lista = todos?.jugadores ?? []
        const suma = lista.reduce((acc, j) => acc + (Number(j.elo) || 0), 0)
        return { total: lista.length, promedio: lista.length ? Math.round(suma / lista.length) : 0 }
    }, [todos])

    // Al cambiar el filtro de categoría o la búsqueda, volver a la primera página.
    useEffect(() => {
        setCurrentPage(1)
    }, [selectedCategoriaId, busquedaDebounce])

    // Número de ranking calculado de la página actual (1° global por página).
    const jugadores: Jugador[] = useMemo(() => {
        const startRank = (currentPage - 1) * itemsPerPage + 1
        return (datos?.jugadores ?? []).map((j, index) => ({ ...j, ranking: startRank + index }))
    }, [datos, currentPage, itemsPerPage])

    // Escucha el evento de refresh desde GestionAscensoDescenso
    useEffect(() => {
        const handleRefresh = () => refresh()
        window.addEventListener('ranking:refresh', handleRefresh)
        return () => window.removeEventListener('ranking:refresh', handleRefresh)
    }, [refresh])

    const seleccionarCategoria = (id: string) => {
        setSelectedCategoriaId(id)
    }

    const getCurrentMonth = (month: number, year: number, formatted: boolean) => {
        const monthMap = ['ENE','FEB','MAR','ABRIL','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']
        return formatted ? `${monthMap[month]} ${year}` : `${monthMap[month]}_${year}`
    }

    const handleDownloadPDF = async () => {
        if (pdfLoading) return
        setPdfLoading(true)
        try {
            const url = `/api/ranking?all=true${
                selectedCategoriaId ? `&categoriaId=${selectedCategoriaId}` : ''
            }`
            const response = await fetch(url)
            if (!response.ok) throw new Error(`Error ${response.status}`)
            const data = await response.json()

            const date = new Date()
            const mesAnio = getCurrentMonth(date.getMonth(), date.getFullYear(), true)
            const mesAnioFile = getCurrentMonth(date.getMonth(), date.getFullYear(), false)
            const categoriaNombre = selectedCategoriaId
                ? categorias.find((c) => c.id === Number(selectedCategoriaId))?.nombre || ''
                : 'GENERAL'

            const bgBase64 = await new Promise<string>((resolve, reject) => {
                const img = new window.Image()
                img.crossOrigin = 'anonymous'
                img.src = '/canvas.jpg'
                img.onload = () => {
                    const canvas = document.createElement('canvas')
                    canvas.width = img.width
                    canvas.height = img.height
                    const ctx = canvas.getContext('2d')
                    if (!ctx) return reject('Error de contexto canvas')
                    ctx.drawImage(img, 0, 0)
                    resolve(canvas.toDataURL('image/jpeg', 0.8))
                }
                img.onerror = () => reject('No se pudo cargar el fondo')
            })

            const pdfResponse = await fetch('/api/generate-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jugadores: data.jugadores,
                    categoriaNombre,
                    mesAnio,
                    bgBase64,
                }),
            })

            if (!pdfResponse.ok) {
                const errorText = await pdfResponse.text()
                throw new Error(errorText || 'Error en servidor de PDF')
            }

            const blob = await pdfResponse.blob()
            const safeName = categoriaNombre.replace(/[^a-z0-9]/gi, '_')
            descargarBlob(blob, `Ranking_ATTA_${safeName}_${mesAnioFile}.pdf`)
            toast.success('PDF descargado')
        } catch (error) {
            console.error('Error detallado:', error)
            toast.error('Error al generar el archivo PDF')
        } finally {
            setPdfLoading(false)
        }
    }

    const rankBadge = (rank: number) => {
        if (rank === 1) return <Badge variant="warning">🥇 1</Badge>
        if (rank === 2) return <Badge variant="neutral">🥈 2</Badge>
        if (rank === 3) return <Badge variant="danger">🥉 3</Badge>
        return <span className="font-mono text-sm text-fg-muted">#{rank}</span>
    }

    const columns = [
        {
            header: '#',
            accessor: 'ranking',
            sortable: false,
            className: 'w-20',
            render: (rank: number) => rankBadge(rank),
        },
        {
            header: 'Jugador',
            accessor: 'nombre',
            render: (nombre: string) => <span className="font-medium text-fg">{nombre}</span>,
        },
        {
            header: 'Club',
            accessor: 'clubes',
            ocultarEnMovil: true,
            render: (club: { nombre?: string }) => club?.nombre ?? <span className="text-fg-muted">—</span>,
        },
        {
            header: 'Categoría',
            accessor: 'categorias',
            ocultarEnMovil: true,
            render: (categoria: { nombre?: string }) =>
                categoria?.nombre ? (
                    <Badge variant="brand">{categoria.nombre}</Badge>
                ) : (
                    <span className="text-fg-muted">—</span>
                ),
        },
        {
            header: 'ELO',
            accessor: 'elo',
            sortable: true,
            className: 'w-24 text-right',
            render: (elo: number) => (
                <span className="font-mono text-sm tabular-nums text-fg">{elo}</span>
            ),
        },
    ]

    const categoriaSeleccionadaNombre =
        categorias.find((c) => String(c.id) === selectedCategoriaId)?.nombre ?? ''

    return (
        <div className={`space-y-6 ${className}`}>
            {/* Tarjetas de categoría — selección visual directa */}
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
                <button
                    type="button"
                    onClick={() => seleccionarCategoria('')}
                    aria-pressed={selectedCategoriaId === ''}
                    className={`group text-left rounded-xl border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 ${
                        selectedCategoriaId === ''
                            ? 'border-fg/50 bg-surface shadow-sm ring-1 ring-fg/20'
                            : 'border-line bg-surface hover:border-fg/30'
                    }`}
                >
                    <div className="flex items-center justify-between gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-subtle text-fg-muted transition-colors group-hover:text-fg sm:h-9 sm:w-9">
                            <Squares2X2Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                        </span>
                        <span className="text-lg font-semibold tabular-nums text-fg sm:text-2xl">
                            {statsTodas.total}
                        </span>
                    </div>
                    <p className="mt-2 truncate text-sm font-medium capitalize text-fg sm:mt-3">General</p>
                    <p className="mt-0.5 hidden text-xs text-fg-muted sm:block">
                        ELO promedio {statsTodas.promedio} · Todas las categorías
                    </p>
                </button>

                {(categorias ?? []).map((cat, i) => {
                    const stats = estadisticasPorCategoria.get(cat.id)
                    const Icono = ICONOS[(i + 1) % ICONOS.length]
                    const activa = String(cat.id) === selectedCategoriaId
                    const promedio =
                        stats && stats.total > 0 ? Math.round(stats.sumaElo / stats.total) : 0
                    return (
                        <button
                            key={cat.id}
                            type="button"
                            onClick={() => seleccionarCategoria(String(cat.id))}
                            aria-pressed={activa}
                            className={`group text-left rounded-xl border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 ${
                                activa
                                    ? 'border-fg/50 bg-surface shadow-sm ring-1 ring-fg/20'
                                    : 'border-line bg-surface hover:border-fg/30'
                            }`}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-subtle text-fg-muted transition-colors group-hover:text-fg sm:h-9 sm:w-9">
                                    <Icono className="h-4 w-4 sm:h-5 sm:w-5" />
                                </span>
                                <span className="text-lg font-semibold tabular-nums text-fg sm:text-2xl">
                                    {stats?.total ?? 0}
                                </span>
                            </div>
                            <p className="mt-2 truncate text-sm font-medium capitalize text-fg sm:mt-3">{cat.nombre}</p>
                            <p className="mt-0.5 hidden text-xs text-fg-muted sm:block">
                                ELO promedio {promedio}
                                {stats?.lider && (
                                    <>
                                        {' · Líder '}
                                        <span className="font-medium text-fg">
                                            {stats.lider.nombre}
                                        </span>
                                    </>
                                )}
                            </p>
                        </button>
                    )
                })}

                {/* Gestión de ascensos/descensos como una tarjeta más del grid */}
                <AscensosDescensosCard />
            </div>

            <Section
                title={categoriaSeleccionadaNombre ? `Ranking · ${categoriaSeleccionadaNombre}` : 'Ranking General'}
                subtitle="Escalafón oficial de la ATTA"
                actions={
                    <Button
                        onClick={handleDownloadPDF}
                        isLoading={pdfLoading}
                        variant="secondary"
                        leadingIcon={<ArrowDownTrayIcon className="h-4 w-4" />}
                    >
                        Exportar PDF
                    </Button>
                }
            >
                <DataTable
                    toolbar={
                        <Buscador
                            valor={busqueda}
                            onCambiar={setBusqueda}
                            placeholder="Buscar jugador…"
                            className="sm:w-64"
                        />
                    }
                    columns={columns}
                    data={jugadores}
                    currentPage={currentPage}
                    itemsPerPage={itemsPerPage}
                    totalItems={datos?.total ?? 0}
                    onPageChange={setCurrentPage}
                    onItemsPerPageChange={setItemsPerPage}
                    isLoading={isLoading}
                    rowKey={(row) => row.id}
                />
            </Section>
        </div>
    )
}
