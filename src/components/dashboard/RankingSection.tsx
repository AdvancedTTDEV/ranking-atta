'use client'
import { useState, useEffect } from 'react'
import DataTable from '@/components/ui/DataTable'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { Section } from '@/components/ui/Section'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

type Jugador = {
    id: number
    ranking: number
    nombre: string
    elo: number
    clubes?: { nombre?: string }
    categorias?: { nombre?: string }
}

type Categoria = {
    id: number
    nombre: string
}

export default function RankingSection({ className = '' }) {
    const [jugadores, setJugadores] = useState<Jugador[]>([])
    const [categorias, setCategorias] = useState<Categoria[]>([])
    const [selectedCategoriaId, setSelectedCategoriaId] = useState<string>('')
    const [currentPage, setCurrentPage] = useState(1)
    const [itemsPerPage, setItemsPerPage] = useState(10)
    const [totalItems, setTotalItems] = useState(0)
    const [isLoading, setIsLoading] = useState(false)

    const fetchCategorias = async () => {
        try {
            const response = await fetch('/api/categorias')
            const data = await response.json()
            setCategorias(data)
        } catch (error) {
            console.error('Error fetching categories:', error)
        }
    }

    const fetchJugadores = async (page = 1, limit = 10) => {
        setIsLoading(true)
        try {
            const url = `/api/ranking?page=${page}&limit=${limit}${
                selectedCategoriaId ? `&categoriaId=${selectedCategoriaId}` : ''
            }`
            const response = await fetch(url)
            if (!response.ok) throw new Error(`Error ${response.status}`)
            const data = await response.json()

            const startRank = (page - 1) * limit + 1
            const rankedData = data.jugadores.map((j: Jugador, index: number) => ({
                ...j,
                ranking: startRank + index,
            }))

            setJugadores(rankedData)
            setTotalItems(data.total)
        } catch (error) {
            console.error('Error fetching ranking:', error)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchCategorias()
    }, [])

    useEffect(() => {
        setCurrentPage(1)
        fetchJugadores(1, itemsPerPage)
    }, [selectedCategoriaId])

    useEffect(() => {
        fetchJugadores(currentPage, itemsPerPage)
    }, [currentPage, itemsPerPage])

    // Escucha el evento de refresh desde GestionAscensoDescenso
    useEffect(() => {
        const handleRefresh = () => fetchJugadores(currentPage, itemsPerPage)
        window.addEventListener('ranking:refresh', handleRefresh)
        return () => window.removeEventListener('ranking:refresh', handleRefresh)
    }, [currentPage, itemsPerPage])

    const getCurrentMonth = (month: number, year: number, formatted: boolean) => {
        const monthMap = ['ENE','FEB','MAR','ABRIL','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']
        return formatted ? `${monthMap[month]} ${year}` : `${monthMap[month]}_${year}`
    }

    const handleDownloadPDF = async () => {
        if (isLoading) return
        setIsLoading(true)
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
            const downloadUrl = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = downloadUrl
            const safeName = categoriaNombre.replace(/[^a-z0-9]/gi, '_')
            link.download = `Ranking_ATTA_${safeName}_${mesAnioFile}.pdf`
            document.body.appendChild(link)
            link.click()
            setTimeout(() => {
                document.body.removeChild(link)
                window.URL.revokeObjectURL(downloadUrl)
            }, 100)
        } catch (error) {
            console.error('Error detallado:', error)
            alert('Error al generar el archivo. Revisa la consola para más detalles.')
        } finally {
            setIsLoading(false)
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
            header: 'ELO',
            accessor: 'elo',
            sortable: true,
            className: 'w-24 text-right',
            render: (elo: number) => (
                <span className="font-mono text-sm tabular-nums text-fg">{elo}</span>
            ),
        },
        {
            header: 'Club',
            accessor: 'clubes',
            render: (club: { nombre?: string }) => club?.nombre ?? <span className="text-fg-muted">—</span>,
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
        },
    ]

    return (
        <Section
            title="Ranking de Jugadores"
            subtitle="Escalafón oficial de la ATTA"
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
                            <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                        ))}
                    </Select>
                    <Button
                        onClick={handleDownloadPDF}
                        isLoading={isLoading}
                        variant="secondary"
                        leadingIcon={<ArrowDownTrayIcon className="h-4 w-4" />}
                    >
                        Exportar PDF
                    </Button>
                </div>
            }
        >
            <DataTable
                columns={columns}
                data={jugadores}
                currentPage={currentPage}
                itemsPerPage={itemsPerPage}
                totalItems={totalItems}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={setItemsPerPage}
                isLoading={isLoading}
                rowKey={(row) => row.id}
            />
        </Section>
    )
}
