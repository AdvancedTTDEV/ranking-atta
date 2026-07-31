'use client'

import { useEffect, ReactNode } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'

interface ModalProps {
    isOpen: boolean
    onClose: () => void
    title: string
    description?: string
    children: ReactNode
    size?: ModalSize
    /** Optional content rendered in the footer (typically action buttons). */
    footer?: ReactNode
}

const sizeClasses: Record<ModalSize, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
    '2xl': 'max-w-4xl',
    full: 'max-w-[96vw]',
}

export default function Modal({
    isOpen,
    onClose,
    title,
    description,
    children,
    size = 'lg',
    footer,
}: ModalProps) {
    useEffect(() => {
        if (!isOpen) return
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKeyDown)

        return () => {
            document.body.style.overflow = previousOverflow
            window.removeEventListener('keydown', onKeyDown)
        }
    }, [isOpen, onClose])

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
        >
            <div
                className={`card-elevated w-full ${sizeClasses[size]} max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col animate-scale-in`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="card-header-row flex-shrink-0">
                    <div className="min-w-0">
                        <h3 id="modal-title" className="card-title text-lg">
                            {title}
                        </h3>
                        {description && <p className="card-subtitle mt-1">{description}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Cerrar"
                        className="btn btn-ghost btn-icon flex-shrink-0"
                    >
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>
                <div className="card-body overflow-y-auto scrollbar-thin flex-1">
                    {children}
                </div>
                {footer && (
                    <div className="flex-shrink-0 border-t border-line px-5 py-3 flex justify-end gap-2 bg-surface-2">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    )
}
