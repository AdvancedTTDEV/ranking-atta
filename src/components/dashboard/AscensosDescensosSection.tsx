'use client'
import { useState } from 'react'
import AscensosDescensosForm from "@/components/forms/AscensosDescensosForm"
import Modal from "@/components/ui/Modal"

export default function GestionPage() {
    const [showForm, setShowForm] = useState<'ascenso' | 'descenso' | null>(null)

    return (
        <div className="bg-white rounded-lg shadow p-4">
            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                <button
                    onClick={() => setShowForm('ascenso')}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                    Manejar Ascensos
                </button>
                <button
                    onClick={() => setShowForm('descenso')}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                    Manejar Descensos
                </button>
            </div>

            <Modal
                isOpen={showForm === 'ascenso'}
                onClose={() => setShowForm(null)}
                title="Gestión de Ascensos"
                size="xl"
            >
                <AscensosDescensosForm
                    tipo="ascenso"
                    onClose={() => setShowForm(null)}
                />
            </Modal>

            <Modal
                isOpen={showForm === 'descenso'}
                onClose={() => setShowForm(null)}
                title="Gestión de Descensos"
                size="xl"
            >
                <AscensosDescensosForm
                    tipo="descenso"
                    onClose={() => setShowForm(null)}
                />
            </Modal>
        </div>
    )
}