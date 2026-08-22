'use client'

import Header from '@/components/ui/Header'
import { PageHeader } from '@/components/ui/PageHeader'
import { DashboardGate } from '@/components/ui/DashboardGate'
import JugadoresWrapper from '@/components/dashboard/JugadoresWrapper'

export default function JugadoresPage() {
    return (
        <>
            <Header />
            <div className="md:pl-64 min-h-screen bg-canvas">
                <main className="page-shell">
                    <DashboardGate>
                        <PageHeader
                            title="Jugadores"
                            subtitle="Busca y administra los jugadores del club"
                        />
                        <div className="space-y-6">
                            <JugadoresWrapper />
                        </div>
                    </DashboardGate>
                </main>
            </div>
        </>
    )
}
