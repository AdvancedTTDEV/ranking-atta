'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
    HomeIcon,
    UserGroupIcon,
    TrophyIcon,
    ChartBarIcon,
    DocumentTextIcon,
} from '@heroicons/react/24/outline'
import { useSession, signOut } from 'next-auth/react'
import { ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline'
import { useTheme } from '@/app/providers'
import { MoonIcon, SunIcon } from '@heroicons/react/24/outline'

const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
    { name: 'Ranking', href: '/dashboard/Ranking', icon: ChartBarIcon },
    { name: 'Jugadores', href: '/dashboard/jugadores', icon: UserGroupIcon },
    { name: 'Torneos', href: '/dashboard/torneos', icon: TrophyIcon },
    { name: 'Partidos', href: '/dashboard/partidos', icon: DocumentTextIcon },
    { name: 'Clubes', href: '/dashboard/clubes', icon: HomeIcon },
    { name: 'Estadísticas', href: '/dashboard/estadisticas', icon: ChartBarIcon },
]

interface SidebarProps {
    /** When true, render as a slide-over panel (mobile drawer). */
    asDrawer?: boolean
    onNavigate?: () => void
}

export default function Sidebar({ asDrawer = false, onNavigate }: SidebarProps) {
    const pathname = usePathname()
    const { data: session } = useSession()
    const { resolvedTheme, toggleTheme } = useTheme()

    const isActive = (href: string) => {
        if (href === '/dashboard') return pathname === '/dashboard'
        return pathname === href || pathname.startsWith(href + '/')
    }

    const containerClasses = asDrawer
        ? 'flex h-full w-72 flex-col bg-canvas border-r border-line animate-slide-up'
        : 'hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 md:z-30'

    return (
        <aside className={containerClasses}>
            <div className="flex flex-col flex-1 bg-canvas overflow-y-auto scrollbar-thin">
                {/* Brand */}
                <div className="flex items-center gap-3 px-5 h-16 border-b border-line">
                    <div
                        className="h-9 w-9 rounded-lg bg-brand-soft text-brand flex items-center justify-center font-semibold text-sm"
                        aria-hidden="true"
                    >
                        ATTA
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-fg leading-tight truncate">
                            Advanced TT
                        </p>
                        <p className="text-xs text-fg-muted leading-tight truncate">Academia</p>
                    </div>
                </div>

                {/* Nav */}
                <nav className="flex-1 px-3 py-4 space-y-0.5">
                    {navigation.map((item) => {
                        const active = isActive(item.href)
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                onClick={onNavigate}
                                className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    active
                                        ? 'bg-subtle text-fg'
                                        : 'text-fg-muted hover:bg-subtle hover:text-fg'
                                }`}
                            >
                                <item.icon
                                    className={`h-[18px] w-[18px] flex-shrink-0 ${
                                        active ? 'text-brand' : 'text-fg-muted group-hover:text-fg'
                                    }`}
                                    aria-hidden="true"
                                />
                                <span className="truncate">{item.name}</span>
                            </Link>
                        )
                    })}
                </nav>

                {/* Footer: theme toggle + user + logout */}
                <div className="border-t border-line p-3 space-y-2">
                    <button
                        type="button"
                        onClick={toggleTheme}
                        className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm text-fg-muted hover:bg-subtle hover:text-fg transition-colors"
                        aria-label="Cambiar tema"
                    >
                        {resolvedTheme === 'dark' ? (
                            <SunIcon className="h-[18px] w-[18px]" />
                        ) : (
                            <MoonIcon className="h-[18px] w-[18px]" />
                        )}
                        <span>{resolvedTheme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>
                    </button>

                    {session && (
                        <>
                            <div className="flex items-center gap-3 px-3 py-2">
                                {session.user?.image ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={session.user.image}
                                        alt=""
                                        className="h-7 w-7 rounded-full"
                                    />
                                ) : (
                                    <div
                                        className="h-7 w-7 rounded-full bg-brand-soft text-brand flex items-center justify-center text-xs font-semibold"
                                        aria-hidden="true"
                                    >
                                        {session.user?.name?.[0]?.toUpperCase() ?? '?'}
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-fg truncate">
                                        {session.user?.name}
                                    </p>
                                    <p className="text-xs text-fg-muted truncate">
                                        {session.user?.email}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => signOut({ callbackUrl: '/' })}
                                className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm text-fg-muted hover:bg-subtle hover:text-danger transition-colors"
                            >
                                <ArrowRightOnRectangleIcon className="h-[18px] w-[18px]" />
                                <span>Cerrar sesión</span>
                            </button>
                        </>
                    )}
                </div>
            </div>
        </aside>
    )
}
