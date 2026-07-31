'use client'

import { useState, useMemo, ReactNode } from 'react'
import {
    ChevronUpIcon,
    ChevronDownIcon,
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
}: DataTableProps) {
    const [sortColumn, setSortColumn] = useState<string | null>(null)
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

    const sortedData = useMemo(() => {
        if (!sortColumn) return data
        const sorted = [...data].sort((a, b) => {
            const valA = a[sortColumn]
            const valB = b[sortColumn]
            if (typeof valA === 'number' && typeof valB === 'number') {
                return sortDirection === 'asc' ? valA - valB : valB - valA
            }
            return sortDirection === 'asc'
                ? String(valA ?? '').localeCompare(String(valB ?? ''))
                : String(valB ?? '').localeCompare(String(valA ?? ''))
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

    return (
        <div className="space-y-3">
            {toolbar && <div>{toolbar}</div>}

            <div className="overflow-x-auto scrollbar-thin -mx-1">
                <table className="table-base">
                    <thead>
                        <tr>
                            {columns.map((column) => {
                                const isSorted = sortColumn === column.accessor
                                const reactKey = column.key ?? column.accessor
                                return (
                                    <th
                                        key={reactKey}
                                        scope="col"
                                        onClick={() => handleHeaderClick(column)}
                                        className={`${column.className ?? ''} ${
                                            column.sortable ? 'cursor-pointer select-none hover:text-fg' : ''
                                        }`}
                                    >
                                        <span className="inline-flex items-center gap-1">
                                            {column.header}
                                            {isSorted &&
                                                (sortDirection === 'asc' ? (
                                                    <ChevronUpIcon className="h-3.5 w-3.5" />
                                                ) : (
                                                    <ChevronDownIcon className="h-3.5 w-3.5" />
                                                ))}
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
                                    {columns.map((column) => (
                                        <td
                                            key={column.key ?? column.accessor}
                                            className={column.className}
                                        >
                                            <div className="h-3 w-3/4 rounded bg-subtle" />
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : sortedData.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="py-12 text-center">
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
                                    className={onRowClick ? 'cursor-pointer' : ''}
                                >
                                    {columns.map((column) => (
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

                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => onPageChange(currentPage - 1)}
                                disabled={currentPage === 1 || isLoading}
                                className="btn btn-ghost btn-icon"
                                aria-label="Página anterior"
                            >
                                <ChevronLeftIcon className="h-4 w-4" />
                            </button>
                            <span className="px-2 text-xs text-fg-muted">
                                <span className="font-medium text-fg">{currentPage}</span> / {totalPages}
                            </span>
                            <button
                                type="button"
                                onClick={() => onPageChange(currentPage + 1)}
                                disabled={currentPage === totalPages || isLoading}
                                className="btn btn-ghost btn-icon"
                                aria-label="Página siguiente"
                            >
                                <ChevronRightIcon className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
