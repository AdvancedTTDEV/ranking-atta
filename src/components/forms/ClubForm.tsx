'use client'
import { useState, FormEvent } from 'react'
import { toast } from 'react-hot-toast'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

interface ClubFormProps {
    onSuccessAction: () => void
    onCancelAction: () => void
}

export default function ClubForm({ onSuccessAction, onCancelAction }: ClubFormProps) {
    const [nombre, setNombre] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setIsSubmitting(true)
        try {
            const response = await fetch('/api/clubes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre }),
            })
            if (response.ok) {
                toast.success('Club creado exitosamente')
                onSuccessAction()
            } else {
                const errorData = await response.json()
                toast.error(errorData.message || 'Error al crear club')
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
                label="Nombre del Club"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Club Atlético Tenis de Mesa"
                required
                autoFocus
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
