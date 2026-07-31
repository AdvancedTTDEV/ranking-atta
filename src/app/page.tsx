'use client'

import { SpeedInsights } from '@vercel/speed-insights/next'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signIn, signOut } from 'next-auth/react'
import { ArrowRightIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline'
import { useTheme } from '@/app/providers'
import { MoonIcon, SunIcon } from '@heroicons/react/24/outline'

export default function Home() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const { data: session } = useSession()
    const { resolvedTheme, toggleTheme } = useTheme()

    const handleAccessDashboard = async () => {
        setLoading(true)

        const maxAttempts = 5
        let attempt = 0

        while (attempt < maxAttempts) {
            try {
                const res = await fetch('/api/dbStarter')
                const data = await res.json()

                if (data.success) {
                    router.push('/dashboard')
                    return
                } else {
                    console.log(`Intento ${attempt + 1}: Base de datos no lista`)
                }
            } catch (err) {
                console.warn(`Intento ${attempt + 1} fallido`, err)
            }

            attempt++
            await new Promise((resolve) => setTimeout(resolve, 3000))
        }

        alert('No se pudo conectar con la base de datos. Intenta nuevamente más tarde.')
        setLoading(false)
    }

    return (
        <div className="min-h-screen bg-canvas relative overflow-hidden">
            {/* Background grid */}
            <div
                className="absolute inset-0 opacity-[0.04]"
                aria-hidden="true"
                style={{
                    backgroundImage:
                        'linear-gradient(var(--color-fg) 1px, transparent 1px), linear-gradient(90deg, var(--color-fg) 1px, transparent 1px)',
                    backgroundSize: '56px 56px',
                    maskImage:
                        'radial-gradient(ellipse 60% 60% at 50% 30%, black 0%, transparent 70%)',
                    WebkitMaskImage:
                        'radial-gradient(ellipse 60% 60% at 50% 30%, black 0%, transparent 70%)',
                }}
            />

            {/* Top right theme toggle */}
            <div className="absolute top-4 right-4 z-10">
                <button
                    type="button"
                    onClick={toggleTheme}
                    className="btn btn-secondary btn-icon"
                    aria-label="Cambiar tema"
                >
                    {resolvedTheme === 'dark' ? (
                        <SunIcon className="h-4 w-4" />
                    ) : (
                        <MoonIcon className="h-4 w-4" />
                    )}
                </button>
            </div>

            <div className="relative min-h-screen flex flex-col items-center justify-center px-4 py-12">
                <div className="w-full max-w-md">
                    {/* Brand */}
                    <div className="flex flex-col items-center text-center mb-8">
                        <div
                            className="h-14 w-14 rounded-xl bg-brand-soft text-brand flex items-center justify-center font-semibold text-lg mb-4 shadow-md"
                            aria-hidden="true"
                        >
                            ATTA
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-fg">
                            Advanced Table Tennis Academy
                        </h1>
                        <p className="mt-2 text-fg-muted">
                            Sistema de gestión de torneos y ranking
                        </p>
                    </div>

                    {/* Card */}
                    <div className="card-elevated p-6 sm:p-8 animate-scale-in">
                        {!session ? (
                            <div className="space-y-5">
                                <div>
                                    <h2 className="text-lg font-semibold text-fg">Iniciar sesión</h2>
                                    <p className="mt-1 text-sm text-fg-muted">
                                        Accede con tu cuenta de Google para entrar al panel.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => signIn('google')}
                                    className="btn btn-primary w-full btn-lg"
                                >
                                    <GoogleIcon />
                                    Continuar con Google
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-5">
                                <div className="flex items-center gap-3">
                                    {session.user?.image ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={session.user.image}
                                            alt=""
                                            className="h-10 w-10 rounded-full"
                                        />
                                    ) : (
                                        <div
                                            className="h-10 w-10 rounded-full bg-brand-soft text-brand flex items-center justify-center text-sm font-semibold"
                                            aria-hidden="true"
                                        >
                                            {session.user?.name?.[0]?.toUpperCase() ?? '?'}
                                        </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm text-fg-muted">Bienvenido</p>
                                        <p className="font-medium text-fg truncate">
                                            {session.user?.name}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleAccessDashboard}
                                    disabled={loading}
                                    className="btn btn-primary w-full btn-lg"
                                >
                                    {loading ? (
                                        <>
                                            <span
                                                className="inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
                                                aria-hidden="true"
                                            />
                                            Conectando…
                                        </>
                                    ) : (
                                        <>
                                            Acceder al dashboard
                                            <ArrowRightIcon className="h-4 w-4" />
                                        </>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => signOut({ callbackUrl: '/' })}
                                    className="btn btn-ghost w-full text-sm"
                                >
                                    <ArrowRightOnRectangleIcon className="h-4 w-4" />
                                    Cerrar sesión
                                </button>
                            </div>
                        )}
                    </div>

                    <p className="mt-6 text-center text-xs text-fg-muted">
                        © {new Date().getFullYear()} Advanced Table Tennis Academy
                    </p>
                </div>
            </div>

            <SpeedInsights />
        </div>
    )
}

function GoogleIcon() {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                fill="#fff"
                d="M21.6 12.227c0-.78-.07-1.53-.2-2.25H12v4.26h5.4c-.234 1.26-.94 2.33-2.005 3.045v2.53h3.243c1.9-1.75 2.962-4.33 2.962-7.585z"
            />
            <path
                fill="#fff"
                d="M12 22c2.7 0 4.965-.895 6.618-2.43l-3.243-2.53c-.9.6-2.05.96-3.375.96-2.595 0-4.795-1.755-5.58-4.11H3.07v2.585C4.715 19.77 8.085 22 12 22z"
                opacity="0.85"
            />
            <path
                fill="#fff"
                d="M6.42 13.89A6.005 6.005 0 0 1 6.125 12c0-.66.11-1.3.295-1.89V7.525H3.07A9.997 9.997 0 0 0 2 12c0 1.61.385 3.13 1.07 4.475l3.35-2.585z"
                opacity="0.7"
            />
            <path
                fill="#fff"
                d="M12 5.97c1.47 0 2.79.505 3.83 1.5l2.87-2.87C16.96 2.99 14.695 2 12 2 8.085 2 4.715 4.23 3.07 7.525l3.35 2.585C7.205 7.725 9.405 5.97 12 5.97z"
                opacity="0.55"
            />
        </svg>
    )
}
