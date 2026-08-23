'use client'

import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

interface Props {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    titulo: string
    /** Texto explicativo: qué va a pasar y qué consecuencias tiene. */
    descripcion?: string
    confirmLabel?: string
    cancelLabel?: string
    /** danger = acción destructiva (rojo); primary = acción normal. */
    variant?: 'danger' | 'primary'
    busy?: boolean
}

/**
 * Confirmación ESTILO APP: reemplaza a `window.confirm`/`alert` nativos
 * (los diálogos «localhost:3000 says…» rompen la seriedad de la app).
 * Úsalo siempre para acciones destructivas o irreversibles.
 */
export default function ConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    titulo,
    descripcion,
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    variant = 'danger',
    busy = false,
}: Props) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={busy ? () => { /* no cerrar mientras trabaja */ } : onClose}
            title={titulo}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={busy}>
                        {cancelLabel}
                    </Button>
                    <Button variant={variant} onClick={onConfirm} isLoading={busy}>
                        {confirmLabel}
                    </Button>
                </>
            }
        >
            <div className="flex items-start gap-3">
                <span
                    className={`shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full ${
                        variant === 'danger' ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand'
                    }`}
                >
                    <ExclamationTriangleIcon className="h-5 w-5" aria-hidden="true" />
                </span>
                {descripcion && (
                    <p className="text-sm text-fg-muted leading-relaxed">{descripcion}</p>
                )}
            </div>
        </Modal>
    )
}
