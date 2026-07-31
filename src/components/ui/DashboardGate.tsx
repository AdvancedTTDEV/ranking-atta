'use client'

import { ReactNode } from 'react'
import useAuthAndDb from '@/app/hooks/useAuthAndDb'
import Modal from '@/components/ui/Modal'

interface DashboardGateProps {
    children: ReactNode
}

/**
 * Shared guard for dashboard pages: handles the "no session" modal and
 * the "DB not ready" loading/error state. Renders `children` only when
 * the user is signed in and the database is reachable.
 */
export function DashboardGate({ children }: DashboardGateProps) {
    const { session, modalOpen, handleLogin, dbReady, loading } = useAuthAndDb()

    return (
        <>
            <Modal isOpen={modalOpen} onClose={() => {}} title="Inicia sesión">
                <p className="mb-4 text-fg-muted">
                    Debes iniciar sesión con tu cuenta de Google para acceder a esta página.
                </p>
                <button
                    onClick={handleLogin}
                    className="btn btn-primary w-full"
                >
                    Continuar con Google
                </button>
            </Modal>

            {loading && (
                <div className="flex items-center gap-3 text-fg-muted">
                    <span
                        className="inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
                        aria-hidden="true"
                    />
                    <span>Conectando con la base de datos…</span>
                </div>
            )}

            {session && dbReady && children}

            {session && !dbReady && !loading && (
                <div className="banner banner-danger" role="alert">
                    La base de datos no está lista. Intenta recargar la página.
                </div>
            )}
        </>
    )
}
