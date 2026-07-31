'use client'

import Header from '@/components/ui/Header'
import { PageHeader } from '@/components/ui/PageHeader'
import { DashboardGate } from '@/components/ui/DashboardGate'
import ClubesWrapper from '@/components/dashboard/ClubesWrapper'

export default function ClubesPage() {
    return (
        <>
            <Header />
            <div className="md:pl-64 min-h-screen bg-canvas">
                <main className="page-shell">
                    <DashboardGate>
                        <PageHeader
                            title="Clubes"
                            subtitle="Gestión de clubes afiliados al ranking"
                        />
                        <ClubesWrapper />
                    </DashboardGate>
                </main>
            </div>
        </>
    )
}
