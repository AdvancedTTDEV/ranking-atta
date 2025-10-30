'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'

export default function Header() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const pathName = usePathname()
    const { data: session } = useSession()

    const navigation = [
        { name: 'Ranking', href: '/dashboard/Ranking' },
        { name: 'Estadísticas', href: '/dashboard/estadisticas' },
        { name: 'Jugadores', href: '/dashboard/jugadores' },
        { name: 'Torneos', href: '/dashboard/torneos' },
        { name: 'Partidos', href: '/dashboard/partidos' },
        { name: 'Clubes', href: '/dashboard/clubes' },
    ]

    const showNavigation = pathName !== '/'

    return (
        <header className="bg-blue-700 text-white shadow-md">
            <div className="container mx-auto px-4">
                <div className="flex justify-between items-center py-4">

                    {/* Izquierda: Botón de logout + Logo */}
                    <div className="flex items-center space-x-4">
                        {session && (
                            <button
                                onClick={() => signOut({ callbackUrl: '/' })}
                                className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md text-sm"
                            >
                                Cerrar Sesion
                            </button>
                        )}

                        <Link href="/dashboard" className="text-xl font-bold">
                            Advanced Table Tennis Academy
                        </Link>
                    </div>

                    {/* Menú para desktop */}
                    {showNavigation && (
                        <nav className="hidden md:flex space-x-6">
                            {navigation.map((item) => (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    className="hover:underline font-medium"
                                >
                                    {item.name}
                                </Link>
                            ))}
                        </nav>
                    )}

                    {/* Botón móvil solo si hay navegación */}
                    {showNavigation && (
                        <button
                            type="button"
                            className="md:hidden text-white"
                            onClick={() => setMobileMenuOpen(true)}
                        >
                            <Bars3Icon className="h-6 w-6" />
                        </button>
                    )}
                </div>
            </div>

            {/* Menú móvil */}
            {mobileMenuOpen && showNavigation && (
                <div className="md:hidden fixed inset-0 z-50 bg-blue-700">
                    <div className="flex justify-end p-4">
                        <button
                            type="button"
                            className="text-white"
                            onClick={() => setMobileMenuOpen(false)}
                        >
                            <XMarkIcon className="h-6 w-6" />
                        </button>
                    </div>
                    <nav className="flex flex-col items-center space-y-6 py-10">
                        {navigation.map((item) => (
                            <Link
                                key={item.name}
                                href={item.href}
                                className="text-xl font-medium hover:underline"
                                onClick={() => setMobileMenuOpen(false)}
                            >
                                {item.name}
                            </Link>
                        ))}
                    </nav>
                </div>
            )}
        </header>
    )
}
