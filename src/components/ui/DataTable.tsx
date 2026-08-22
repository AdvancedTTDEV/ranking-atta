'use client'

import { useState, useEffect, useMemo, ReactNode } from 'react'
import {
    ChevronUpIcon,
    ChevronDownIcon,
    ChevronDoubleLeftIcon,
    ChevronDoubleRightIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    InboxIcon,
} from '@heroicons/react/24/outline'

interface Column {
    header: string
    accessor: string
    /** Unique React key for this column. Falls back to `accessor`.
     *  Required when two columns share the same `accessor` (e.g. a read-only
     *  "ID" column and a separate "Acciones" column that also reads `id`). */
    key?: string
    render?: (value: any, row: any) => ReactNode
    sortable?: boolean
    className?: string
    /** No mostrar esta columna dentro de las tarjetas de móvil. */
    ocultarEnMovil?: boolean
}

interface DataTableProps {
    columns: Column[]
    data: any[]
    onRowClick?: (row: any) => void
    currentPage: number
    itemsPerPage: number
    totalItems: number
    onPageChange: (page: number) => void
    onItemsPerPageChange?: (items: number) => void
    isLoading?: boolean
    /** Rows shown in the loading skeleton. Default: 5. */
    skeletonRows?: number
    /** Fixed key extractor so React doesn't reuse rows between page changes. */
    rowKey?: (row: any, index: number) => string | number
    /** Optional element rendered above the table (filters, search, etc.). */
    toolbar?: ReactNode
    /** Optional element rendered below the table (totals, etc.). */
    footer?: ReactNode
    /** Hide the items-per-page selector. */
    hideItemsPerPage?: boolean
    emptyMessage?: string
    /** Fija el encabezado dentro de un contenedor con scroll vertical. */
    stickyHeader?: boolean
    /** Altura máxima del contenedor de la tabla (requiere stickyHeader). */
    maxHeight?: string
}

/** Ventana de páginas con puntos suspensivos: 1 … 4 5 6 … 20 */
function paginasVisibles(current: number, total: number): (number | '…')[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
    const paginas = new Set<number>([1, total, current, current - 1, current + 1])
    const ordenadas = [...paginas].filter(p => p >= 1 && p <= total).sort((a, b) => a - b)
    const resultado: (number | '…')[] = []
    let previa = 0
    for (const pagina of ordenadas) {
        if (pagina - previa > 1) resultado.push('…')
        resultado.push(pagina)
        previa = pagina
    }
    return resultado
}

export default function DataTable({
    columns,
    data,
    onRowClick,
    currentPage,
    itemsPerPage,
    totalItems,
    onPageChange,
    onItemsPerPageChange,
    isLoading = false,
    skeletonRows = 5,
    rowKey,
    toolbar,
    footer,
    hideItemsPerPage = false,
    emptyMessage = 'No se encontraron registros',
    stickyHeader = false,
    maxHeight,
}: DataTableProps) {
    const [sortColumn, setSortColumn] = useState<string | null>(null)
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
    // En móvil (<768px) la tabla se vuelve densa: filas de una sola línea
    // mostrando solo las columnas esenciales (las marcadas con
    // `ocultarEnMovil` desaparecen en vez de apilar tarjetas).
    const [esEscritorio, setEsEscritorio] = useState(true)
    useEffect(() => {
        const mq = window.matchMedia('(min-width: 768px)')
        const actualizar = () => setEsEscritorio(mq.matches)
        actualizar()
        mq.addEventListener('change', actualizar)
        return () => mq.removeEventListener('change', actualizar)
    }, [])

    const sortedData = useMemo(() => {
        if (!sortColumn) return data
        const sorted = [...data].sort((a, b) => {
            const valA = a[sortColumn]
            const valB = b[sortColumn]
            if (typeof valA === 'number' && typeof valB === 'number') {
                return sortDirection === 'asc' ? valA - valB : valB - valA
            }
            return sortDirection === 'asc'
                ? String(valA ?? '').localeCompare(String(valB ?? ''), 'es', { numeric: true })
                : String(valB ?? '').localeCompare(String(valA ?? ''), 'es', { numeric: true })
        })
        return sorted
    }, [data, sortColumn, sortDirection])

    const handleHeaderClick = (column: Column) => {
        if (!column.sortable) return
        if (sortColumn === column.accessor) {
            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
        } else {
            setSortColumn(column.accessor)
            setSortDirection('asc')
        }
    }

    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage))
    const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1
    const endIndex = Math.min(itemsPerPage * currentPage, totalItems)
    const tablaClassName = `table-base ${stickyHeader ? 'table-sticky' : ''}`

    /** Columnas que se muestran en móvil (sin las marcadas como prescindibles). */
    const columnasVisibles = esEscritorio ? columns : columns.filter((c) => !c.ocultarEnMovil)

    const celda = (column: Column, row: any) =>
        column.render ? column.render(row[column.accessor], row) : row[column.accessor]

    return (
        <div className="space-y-3">
            {toolbar && <div>{toolbar}</div>}

            {/* Tabla: densa de una línea en móvil, completa en desktop */}
            <div
                className="overflow-x-auto scrollbar-thin -mx-1"
                style={stickyHeader && maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}
            >
                <table className={`${tablaClassName} ${esEscritorio ? '' : 'tabla-movil'}`}>
                    <thead>
                        <tr>
                            {columnasVisibles.map((column) => {
                                const isSorted = sortColumn === column.accessor
                                const reactKey = column.key ?? column.accessor
                                return (
                                    <th
                                        key={reactKey}
                                        scope="col"
                                        onClick={() => handleHeaderClick(column)}
                                        aria-sort={isSorted ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined}
                                        className={`${column.className ?? ''} ${
                                            column.sortable ? 'cursor-pointer select-none hover:text-fg' : ''
                                        }`}
                                    >
                                        <span className="inline-flex items-center gap-1">
                                            {column.header}
                                            {column.sortable && (
                                                <span className={`inline-flex flex-col leading-none transition-opacity ${isSorted ? 'opacity-100 text-fg' : 'opacity-30'}`}>
                                                    <ChevronUpIcon
                                                        className={`h-3 w-3 ${isSorted && sortDirection === 'asc' ? '' : '-mb-0.5'}`}
                                                    />
                                                    <ChevronDownIcon
                                                        className={`h-3 w-3 ${isSorted && sortDirection === 'desc' ? '' : '-mt-0.5'}`}
                                                    />
                                                </span>
                                            )}
                                        </span>
                                    </th>
                                )
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            Array.from({ length: skeletonRows }).map((_, i) => (
                                <tr key={`skeleton-${i}`} className="animate-pulse-soft">
                                    {columnasVisibles.map((column) => (
                                        <td
                                            key={column.key ?? column.accessor}
                                            className={column.className}
                                        >
                                            <div
                                                className="skeleton-shimmer h-3 rounded bg-subtle text-fg"
                                                style={{ width: `${55 + ((i * 13 + String(column.key ?? column.accessor).length * 7) % 35)}%` }}
                                            />
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : sortedData.length === 0 ? (
                            <tr>
                                <td colSpan={columnasVisibles.length} className="py-12 text-center">
                                    <div className="mx-auto flex max-w-xs flex-col items-center gap-2 text-fg-muted">
                                        <InboxIcon className="h-8 w-8 opacity-50" />
                                        <p className="text-sm">{emptyMessage}</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            sortedData.map((row, rowIndex) => (
                                <tr
                                    key={rowKey ? rowKey(row, rowIndex) : rowIndex}
                                    onClick={() => onRowClick?.(row)}
                                    style={{ animationDelay: `${Math.min(rowIndex * 35, 250)}ms` }}
                                    className={`row-enter ${onRowClick ? 'cursor-pointer' : ''}`}
                                >
                                    {columnasVisibles.map((column) => (
                                        <td
                                            key={column.key ?? column.accessor}
                                            className={column.className}
                                        >
                                            {column.render
                                                ? column.render(row[column.accessor], row)
                                                : row[column.accessor]}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {footer}

            {/* Paginación */}
            {totalItems > 0 && (
                <div className="flex flex-col-reverse items-stretch gap-3 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-fg-muted">
                        Mostrando <span className="font-medium text-fg">{startIndex}–{endIndex}</span> de{' '}
                        <span className="font-medium text-fg">{totalItems}</span>
                    </p>

                    <div className="flex items-center gap-3">
                        {!hideItemsPerPage && onItemsPerPageChange && (
                            <label className="flex items-center gap-2 text-xs text-fg-muted">
                                <span>Por página</span>
                                <select
                                    value={itemsPerPage}
                                    onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
                                    disabled={isLoading}
                                    className="select-base py-1 text-xs w-auto"
                                >
                                    {[5, 10, 25, 50].map((size) => (
                                        <option key={size} value={size}>
                                            {size}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}

                        <div className="flex items-center gap-0.5">
                            {currentPage > 1 && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => onPageChange(1)}
                                        disabled={isLoading}
                                        className="btn btn-ghost btn-icon"
                                        aria-label="Primera página"
                                    >
                                        <ChevronDoubleLeftIcon className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onPageChange(currentPage - 1)}
                                        disabled={isLoading}
                                        className="btn btn-ghost btn-icon"
                                        aria-label="Página anterior"
                                    >
                                        <ChevronLeftIcon className="h-4 w-4" />
                                    </button>
                                </>
                            )}

                            {paginasVisibles(currentPage, totalPages).map((pagina, i) =>
                                pagina === '…' ? (
                                    <span key={`ellipsis-${i}`} className="px-1 text-xs text-fg-muted">
                                        …
                                    </span>
                                ) : (
                                    <button
                                        key={`page-${pagina}`}
                                        type="button"
                                        onClick={() => onPageChange(pagina)}
                                        disabled={isLoading}
                                        aria-current={pagina === currentPage ? 'page' : undefined}
                                        className={`h-8 min-w-8 rounded-md px-2 text-xs font-medium transition-colors active:scale-95 ${
                                            pagina === currentPage
                                                ? 'bg-fg text-canvas'
                                                : 'text-fg-muted hover:bg-subtle hover:text-fg'
                                        }`}
                                    >
                                        {pagina}
                                    </button>
                                )
                            )}

                            {currentPage < totalPages && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => onPageChange(currentPage + 1)}
                                        disabled={isLoading}
                                        className="btn btn-ghost btn-icon"
                                        aria-label="Página siguiente"
                                    >
                                        <ChevronRightIcon className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onPageChange(totalPages)}
                                        disabled={isLoading}
                                        className="btn btn-ghost btn-icon"
                                        aria-label="Última página"
                                    >
                                        <ChevronDoubleRightIcon className="h-4 w-4" />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
