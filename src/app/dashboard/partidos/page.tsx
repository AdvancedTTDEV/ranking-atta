'use client'

import Header from '@/components/ui/Header'
import { PageHeader } from '@/components/ui/PageHeader'
import { DashboardGate } from '@/components/ui/DashboardGate'
import PartidosWrapper from '@/components/dashboard/PartidosWrapper'

export default function PartidosPage() {
    return (
        <>
            <Header />
            <div className="md:pl-64 min-h-screen bg-canvas">
                <main className="page-shell">
                    <DashboardGate>
                        <PageHeader
                            title="Partidos"
                            subtitle="Registro e historial de partidos"
                        />
                        <PartidosWrapper />
                    </DashboardGate>
                </main>
            </div>
        </>
    )
}
