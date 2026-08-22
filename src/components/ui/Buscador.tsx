'use client'

import { useEffect, useState } from 'react'
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'

interface BuscadorProps {
    valor: string
    onCambiar: (valor: string) => void
    placeholder?: string
    className?: string
}

/**
 * Campo de búsqueda reutilizable y 100% controlado: lupa, botón de limpiar.
 * El debounce lo aplica la sección con useDebounce para decidir si filtra
 * en el servidor (request) o en el cliente (inmediato).
 */
export default function Buscador({
    valor,
    onCambiar,
    placeholder = 'Buscar…',
    className = '',
}: BuscadorProps) {
    return (
        <div className={`relative ${className}`}>
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
            <input
                type="search"
                value={valor}
                onChange={(e) => onCambiar(e.target.value)}
                placeholder={placeholder}
                className="input-base w-full pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
                aria-label={placeholder}
            />
            {valor && (
                <button
                    type="button"
                    onClick={() => onCambiar('')}
                    aria-label="Limpiar búsqueda"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-fg-muted transition-colors hover:bg-subtle hover:text-fg"
                >
                    <XMarkIcon className="h-3.5 w-3.5" />
                </button>
            )}
        </div>
    )
}

/** Devuelve el valor tras quedarse quieto `ms` milisegundos. */
export function useDebounce<T>(valor: T, ms = 350): T {
    const [conDebounce, setConDebounce] = useState(valor)
    useEffect(() => {
        const t = setTimeout(() => setConDebounce(valor), ms)
        return () => clearTimeout(t)
    }, [valor, ms])
    return conDebounce
}
