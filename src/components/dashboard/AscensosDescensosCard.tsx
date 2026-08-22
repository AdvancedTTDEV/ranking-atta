'use client'

import { useState } from 'react'
import {
    ArrowTrendingUpIcon,
    ArrowTrendingDownIcon,
    ArrowsUpDownIcon,
} from '@heroicons/react/24/outline'
import AscensosDescensosForm from '@/components/forms/AscensosDescensosForm'
import Modal from '@/components/ui/Modal'

/**
 * Tarjeta compacta de ascensos/descensos: mismo estilo que las tarjetas de
 * categoría del ranking. Los dos accesos abren su modal correspondiente,
 * así la gestión completa vive dentro de una sola celda del grid.
 */
export default function AscensosDescensosCard({ className = '' }: { className?: string }) {
    const [gestion, setGestion] = useState<'ascenso' | 'descenso' | null>(null)

    return (
        <>
            <div
                className={`group rounded-xl border border-line bg-surface p-3 sm:p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-fg/30 hover:shadow-md ${className}`}
            >
                <div className="flex items-center justify-between">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-subtle text-fg-muted transition-colors group-hover:text-fg sm:h-9 sm:w-9">
                        <ArrowsUpDownIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                    </span>
                    <span className="flex gap-1">
                        <span className="h-2 w-2 rounded-full bg-emerald-500/70" />
                        <span className="h-2 w-2 rounded-full bg-red-500/70" />
                    </span>
                </div>
                <p className="mt-2 truncate text-sm font-medium text-fg sm:mt-3">Ascensos y descensos</p>
                <p className="mt-0.5 hidden text-xs text-fg-muted sm:block">Mueve jugadores entre categorías</p>

                <div className="mt-3 flex gap-2">
                    <button
                        type="button"
                        onClick={() => setGestion('ascenso')}
                        className="btn btn-sm flex-1 border border-line bg-subtle/60 text-fg transition-colors hover:bg-emerald-500/15 hover:text-emerald-600 dark:hover:text-emerald-400"
                    >
                        <ArrowTrendingUpIcon className="h-4 w-4" />
                        Subir
                    </button>
                    <button
                        type="button"
                        onClick={() => setGestion('descenso')}
                        className="btn btn-sm flex-1 border border-line bg-subtle/60 text-fg transition-colors hover:bg-red-500/15 hover:text-red-600 dark:hover:text-red-400"
                    >
                        <ArrowTrendingDownIcon className="h-4 w-4" />
                        Bajar
                    </button>
                </div>
            </div>

            <Modal
                isOpen={gestion === 'ascenso'}
                onClose={() => setGestion(null)}
                title="Gestión de Ascensos"
                size="2xl"
            >
                <AscensosDescensosForm tipo="ascenso" onClose={() => setGestion(null)} />
            </Modal>

            <Modal
                isOpen={gestion === 'descenso'}
                onClose={() => setGestion(null)}
                title="Gestión de Descensos"
                size="2xl"
            >
                <AscensosDescensosForm tipo="descenso" onClose={() => setGestion(null)} />
            </Modal>
        </>
    )
}
