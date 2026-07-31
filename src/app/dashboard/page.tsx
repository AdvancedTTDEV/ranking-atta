'use client'

import Header from '@/components/ui/Header'
import { PageHeader } from '@/components/ui/PageHeader'
import { DashboardGate } from '@/components/ui/DashboardGate'
import EstadisticasWrapper from '@/components/dashboard/EstadisticasWrapper'
import ClubesWrapper from '@/components/dashboard/ClubesWrapper'
import JugadoresWrapper from '@/components/dashboard/JugadoresWrapper'
import TorneosWrapper from '@/components/dashboard/TorneosWrapper'
import PartidosWrapper from '@/components/dashboard/PartidosWrapper'
import AscensosDescensosWrapper from '@/components/dashboard/AscensosDescensosWrapper'
import { useSession } from 'next-auth/react'

export default function DashboardPage() {
    const { data: session } = useSession()

    return (
        <>
            <Header />
            <div className="md:pl-64 min-h-screen bg-canvas">
                <main className="page-shell">
                    <DashboardGate>
                        <PageHeader
                            title="Panel de Control"
                            subtitle={`Bienvenido, ${session?.user?.name?.split(' ')[0] ?? 'jugador'}. Resumen del club.`}
                        />
                        <div className="space-y-6">
                            <EstadisticasWrapper />

                            <AscensosDescensosWrapper />

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div className="lg:col-span-1">
                                    <ClubesWrapper />
                                </div>
                                <div className="lg:col-span-2">
                                    <JugadoresWrapper />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <TorneosWrapper />
                                <PartidosWrapper />
                            </div>
                        </div>
                    </DashboardGate>
                </main>
            </div>
        </>
    )
}
