'use client'

import Header from '@/components/ui/Header'
import { PageHeader } from '@/components/ui/PageHeader'
import { DashboardGate } from '@/components/ui/DashboardGate'
import RankingWrapper from '@/components/dashboard/RankingWrapper'
import AscensosDescensosWrapper from '@/components/dashboard/AscensosDescensosWrapper'

export default function RankingPage() {
    return (
        <>
            <Header />
            <div className="md:pl-64 min-h-screen bg-canvas">
                <main className="page-shell">
                    <DashboardGate>
                        <PageHeader
                            title="Ranking"
                            subtitle="Visualiza el ranking oficial y gestiona ascensos/descensos"
                        />
                        <div className="space-y-6">
                            <AscensosDescensosWrapper />
                            <RankingWrapper />
                        </div>
                    </DashboardGate>
                </main>
            </div>
        </>
    )
}
