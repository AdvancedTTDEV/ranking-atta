'use client'

import Header from '@/components/ui/Header'
import { PageHeader } from '@/components/ui/PageHeader'
import { DashboardGate } from '@/components/ui/DashboardGate'
import TorneosWrapper from '@/components/dashboard/TorneosWrapper'

export default function TorneosPage() {
    return (
        <>
            <Header />
            <div className="md:pl-64 min-h-screen bg-canvas">
                <main className="page-shell">
                    <DashboardGate>
                        <PageHeader
                            title="Torneos"
                            subtitle="Crea, organiza y consulta los torneos"
                        />
                        <TorneosWrapper />
                    </DashboardGate>
                </main>
            </div>
        </>
    )
}
