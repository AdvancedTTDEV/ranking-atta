'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'
import Sidebar from './Sidebar'
import { useSession } from 'next-auth/react'

interface HeaderProps {
    /** When true, render the sidebar on desktop and a top bar with drawer on mobile. */
    withShell?: boolean
    /** Page title shown in the mobile top bar. */
    title?: string
}

/**
 * Header is the top bar for dashboard pages. It always renders the Sidebar
 * on desktop (persistent) and exposes a hamburger drawer on mobile.
 *
 * Pass `withShell={false}` to use it as a simple top bar (e.g. for the
 * landing/login page) — the sidebar is then omitted.
 */
export default function Header({ withShell = true, title }: HeaderProps) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const pathName = usePathname()
    const { data: session } = useSession()

    // Close drawer on route change
    useEffect(() => {
        setMobileMenuOpen(false)
    }, [pathName])

    if (!withShell) {
        return null
    }

    // Derive title from pathname if not provided
    const derivedTitle = title ?? deriveTitle(pathName)

    return (
        <>
            {/* Desktop: persistent sidebar is rendered by Sidebar.tsx via this Header
                wrapper. We render it inline here so callers don't need to think
                about placement. On mobile, the sidebar lives inside the drawer. */}
            <div className="hidden md:block">
                <Sidebar />
            </div>

            {/* Mobile top bar */}
            <header className="md:hidden sticky top-0 z-30 bg-canvas/80 backdrop-blur border-b border-line">
                <div className="flex items-center justify-between px-4 h-14">
                    <div className="flex items-center gap-2">
                        <div
                            className="h-8 w-8 rounded-md bg-brand-soft text-brand flex items-center justify-center font-semibold text-xs"
                            aria-hidden="true"
                        >
                            ATTA
                        </div>
                        <span className="text-sm font-semibold text-fg truncate">
                            {derivedTitle}
                        </span>
                    </div>
                    {session && (
                        <button
                            type="button"
                            onClick={() => setMobileMenuOpen(true)}
                            className="btn btn-ghost btn-icon"
                            aria-label="Abrir menú"
                        >
                            <Bars3Icon className="h-5 w-5" />
                        </button>
                    )}
                </div>
            </header>

            {/* Mobile drawer */}
            {mobileMenuOpen && (
                <div
                    className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in"
                    onClick={() => setMobileMenuOpen(false)}
                >
                    <div
                        className="absolute inset-y-0 left-0"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Sidebar
                            asDrawer
                            onNavigate={() => setMobileMenuOpen(false)}
                        />
                    </div>
                    <button
                        type="button"
                        className="absolute top-3 right-3 btn btn-ghost btn-icon"
                        onClick={() => setMobileMenuOpen(false)}
                        aria-label="Cerrar menú"
                    >
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>
            )}
        </>
    )
}

function deriveTitle(pathname: string | null): string {
    if (!pathname) return 'ATTA'
    if (pathname === '/dashboard') return 'Panel'
    const segments = pathname.split('/').filter(Boolean)
    const last = segments[segments.length - 1] ?? 'ATTA'
    return last.charAt(0).toUpperCase() + last.slice(1)
}
