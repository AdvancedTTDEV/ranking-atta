'use client'

import Header from '@/components/ui/Header'
import { PageHeader } from '@/components/ui/PageHeader'
import { DashboardGate } from '@/components/ui/DashboardGate'
import EstadisticasWrapper from '@/components/dashboard/EstadisticasWrapper'
import ClubesWrapper from '@/components/dashboard/ClubesWrapper'
import JugadoresWrapper from '@/components/dashboard/JugadoresWrapper'
import TorneosWrapper from '@/components/dashboard/TorneosWrapper'
import PartidosWrapper from '@/components/dashboard/PartidosWrapper'
import AscensosDescensosCard from '@/components/dashboard/AscensosDescensosCard'
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
                        <div className="dash-compact space-y-3 md:space-y-6">
                            <EstadisticasWrapper />

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-6">
                                <div className="lg:col-span-1 space-y-3 md:space-y-6 flex flex-col gap-3 md:gap-6">
                                    <ClubesWrapper />
                                    <AscensosDescensosCard />
                                </div>
                                <div className="lg:col-span-2">
                                    <JugadoresWrapper />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-6">
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
