'use client'
import { useState } from 'react'
import AscensosDescensosForm from '@/components/forms/AscensosDescensosForm'
import Modal from '@/components/ui/Modal'
import { Section } from '@/components/ui/Section'
import { Button } from '@/components/ui/Button'
import { ArrowTrendingUpIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/outline'

export default function GestionPage() {
    const [showForm, setShowForm] = useState<'ascenso' | 'descenso' | null>(null)

    return (
        <Section
            title="Ascensos y Descensos"
            subtitle="Mueve jugadores entre categorías"
            actions={
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <Button
                        variant="success"
                        leadingIcon={<ArrowTrendingUpIcon className="h-4 w-4" />}
                        onClick={() => setShowForm('ascenso')}
                    >
                        Manejar Ascensos
                    </Button>
                    <Button
                        variant="danger"
                        leadingIcon={<ArrowTrendingDownIcon className="h-4 w-4" />}
                        onClick={() => setShowForm('descenso')}
                    >
                        Manejar Descensos
                    </Button>
                </div>
            }
        >
            <div className="text-center py-6 text-fg-muted text-sm">
                Selecciona una acción arriba para comenzar.
            </div>

            <Modal
                isOpen={showForm === 'ascenso'}
                onClose={() => setShowForm(null)}
                title="Gestión de Ascensos"
                size="2xl"
            >
                <AscensosDescensosForm
                    tipo="ascenso"
                    onClose={() => setShowForm(null)}
                />
            </Modal>

            <Modal
                isOpen={showForm === 'descenso'}
                onClose={() => setShowForm(null)}
                title="Gestión de Descensos"
                size="2xl"
            >
                <AscensosDescensosForm
                    tipo="descenso"
                    onClose={() => setShowForm(null)}
                />
            </Modal>
        </Section>
    )
}
