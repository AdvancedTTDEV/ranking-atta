'use client'

import Header from '@/components/ui/Header'
import { PageHeader } from '@/components/ui/PageHeader'
import { DashboardGate } from '@/components/ui/DashboardGate'
import EstadisticasWrapper from '@/components/dashboard/EstadisticasWrapper'
import AnaliticaSection from '@/components/dashboard/AnaliticaSection'
import H2HSection from '@/components/dashboard/H2HSection'
import { useState } from 'react'
import { ChartBarIcon, UserGroupIcon, ScaleIcon } from '@heroicons/react/24/outline'

type Pestana = 'general' | 'jugador' | 'h2h'

const PESTANAS: { id: Pestana; nombre: string; icono: React.ReactNode }[] = [
    { id: 'general', nombre: 'General', icono: <ChartBarIcon className="h-4 w-4" /> },
    { id: 'jugador', nombre: 'Por jugador', icono: <UserGroupIcon className="h-4 w-4" /> },
    { id: 'h2h', nombre: 'Cara a cara', icono: <ScaleIcon className="h-4 w-4" /> },
]

export default function EstadisticasPage() {
    const [pestana, setPestana] = useState<Pestana>('general')

    return (
        <>
            <Header />
            <div className="md:pl-64 min-h-screen bg-canvas">
                <main className="page-shell">
                    <DashboardGate>
                        <PageHeader
                            title="Estadísticas"
                            subtitle="Métricas y tendencias del club"
                        />

                        {/* Selector de pestañas */}
                        <div
                            role="tablist"
                            aria-label="Vistas de estadísticas"
                            className="mb-5 inline-flex rounded-xl border border-line bg-surface p-1 shadow-sm"
                        >
                            {PESTANAS.map(({ id, nombre, icono }) => (
                                <button
                                    key={id}
                                    role="tab"
                                    aria-selected={pestana === id}
                                    onClick={() => setPestana(id)}
                                    className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 ${
                                        pestana === id
                                            ? 'bg-fg text-canvas shadow-sm active:scale-[0.97]'
                                            : 'text-fg-muted hover:text-fg hover:bg-subtle'
                                    }`}
                                >
                                    {icono}
                                    {nombre}
                                </button>
                            ))}
                        </div>

                        <div key={pestana} className="animate-slide-up">
                            {pestana === 'general' ? <EstadisticasWrapper /> : pestana === 'jugador' ? <AnaliticaSection /> : <H2HSection />}
                        </div>
                    </DashboardGate>
                </main>
            </div>
        </>
    )
}
