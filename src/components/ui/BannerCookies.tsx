'use client'

import { useEffect, useState } from 'react'
import { ShieldCheckIcon, XMarkIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const CLAVE_CONSENTIMIENTO = 'atta-consent-cookies'

/**
 * Aviso de cookies: informa qué se guarda en el navegador y pide
 * consentimiento. Este sitio solo usa cookies esenciales (sesión de Google,
 * CSRF) y preferencias locales (tema); no hay rastreadores de terceros.
 * La elección se recuerda en localStorage y puede cambiarse borrando datos.
 */
export default function BannerCookies() {
    const [visible, setVisible] = useState(false)
    const [expandido, setExpandido] = useState(false)

    useEffect(() => {
        try {
            if (!localStorage.getItem(CLAVE_CONSENTIMIENTO)) {
                const t = setTimeout(() => setVisible(true), 900)
                return () => clearTimeout(t)
            }
        } catch {
            // Sin acceso a localStorage (modo privado estricto): no molestar.
        }
    }, [])

    const decidir = (valor: 'aceptadas' | 'esenciales') => {
        try {
            localStorage.setItem(CLAVE_CONSENTIMIENTO, valor)
        } catch {
            // Ignorado: el aviso reaparecerá en la próxima visita.
        }
        setVisible(false)
        toast.success(
            valor === 'aceptadas'
                ? 'Preferencias guardadas. ¡Gracias!'
                : 'Guardado: solo usamos cookies esenciales.'
        )
    }

    if (!visible) return null

    return (
        <div
            role="dialog"
            aria-live="polite"
            aria-label="Aviso de cookies"
            className="fixed inset-x-0 bottom-0 z-[80] px-3 pb-3 sm:px-4 sm:pb-4 animate-slide-up"
        >
            <div className="mx-auto max-w-3xl rounded-xl border border-line bg-surface/95 shadow-lg backdrop-blur-md">
                <div className="flex items-start gap-3 p-4 sm:p-5">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-subtle text-fg-muted">
                        <ShieldCheckIcon className="h-5 w-5" />
                    </span>

                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-fg">Tu privacidad</p>
                        <p className="mt-1 text-xs leading-relaxed text-fg-muted sm:text-sm">
                            Usamos cookies esenciales para mantener tu sesión activa con Google y
                            recordar tus preferencias (tema).{' '}
                            <span className="hidden sm:inline">
                                No hay publicidad ni rastreo de terceros.
                            </span>
                        </p>

                        <button
                            type="button"
                            onClick={() => setExpandido((v) => !v)}
                            className="mt-1 inline-flex items-center gap-1 text-xs text-fg-muted underline-offset-2 transition-colors hover:text-fg hover:underline"
                            aria-expanded={expandido}
                        >
                            Detalle técnico
                            <ChevronDownIcon
                                className={`h-3 w-3 transition-transform duration-200 ${expandido ? 'rotate-180' : ''}`}
                            />
                        </button>
                        {expandido && (
                            <ul className="mt-2 space-y-1 rounded-lg bg-canvas/60 p-3 text-xs text-fg-muted animate-fade-in">
                                <li>
                                    <code className="text-fg">next-auth.session-token</code> ·
                                    esencial · mantiene tu sesión 30 días (httpOnly, secure).
                                </li>
                                <li>
                                    <code className="text-fg">next-auth.csrf-token</code> ·
                                    esencial · protege el login contra CSRF.
                                </li>
                                <li>
                                    <code className="text-fg">theme</code> · preferencia · guarda
                                    si prefieres tema claro u oscuro.
                                </li>
                            </ul>
                        )}

                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <button
                                type="button"
                                onClick={() => decidir('aceptadas')}
                                className="btn btn-primary btn-sm"
                            >
                                Aceptar
                            </button>
                            <button
                                type="button"
                                onClick={() => decidir('esenciales')}
                                className="btn btn-ghost btn-sm"
                            >
                                Solo esenciales
                            </button>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => decidir('esenciales')}
                        className="-mr-1 -mt-1 rounded-md p-1 text-fg-muted transition-colors hover:bg-subtle hover:text-fg"
                        aria-label="Cerrar aviso"
                    >
                        <XMarkIcon className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    )
}
