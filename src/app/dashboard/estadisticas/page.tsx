'use client'

import Header from '@/components/ui/Header'
import { PageHeader } from '@/components/ui/PageHeader'
import { DashboardGate } from '@/components/ui/DashboardGate'
import EstadisticasWrapper from '@/components/dashboard/EstadisticasWrapper'

export default function EstadisticasPage() {
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
                        <EstadisticasWrapper />
                    </DashboardGate>
                </main>
            </div>
        </>
    )
}
