'use client'

import { useEffect, useState } from 'react'

const MENSAJES_DEFAULT = [
    'Conectando con la base de datos…',
    'Despertando el servidor…',
    'Sincronizando datos del club…',
    'Casi listo…',
]

interface Props {
    /** Encabezado fijo encima del estado. */
    titulo?: string
    /** Mensajes de estado que rotan mientras carga. */
    mensajes?: string[]
    /** Intento actual (para los puntitos de progreso). */
    intento?: number
    /** Total de intentos antes de rendirse. */
    totalIntentos?: number
    /** Versión inline compacta (para botones/filas). */
    compacto?: boolean
}

/**
 * Pantalla de carga centrada: anillos concéntricos girando + punto que
 * late, mensaje de estado rotativo y puntos de intento. Se usa en el gate
 * del dashboard ("cargando base de datos") y en accesos largos.
 */
export default function CargandoPantalla({
    titulo = 'Preparando todo',
    mensajes = MENSAJES_DEFAULT,
    intento,
    totalIntentos,
    compacto = false,
}: Props) {
    const [indice, setIndice] = useState(0)

    useEffect(() => {
        if (mensajes.length < 2) return
        const t = setInterval(() => setIndice(i => (i + 1) % mensajes.length), 2200)
        return () => clearInterval(t)
    }, [mensajes.length])

    const anillos = (
        <div className={`relative ${compacto ? 'h-8 w-8' : 'h-16 w-16'}`} aria-hidden="true">
            <span className="absolute inset-0 rounded-full border-[3px] border-line" />
            <span className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-brand animate-spin [animation-duration:1.1s]" />
            {!compacto && (
                <span className="absolute inset-[7px] rounded-full border-2 border-transparent border-b-brand/60 animate-spin [animation-direction:reverse] [animation-duration:1.7s]" />
            )}
            <span
                className={`absolute inset-0 m-auto rounded-full bg-brand ${
                    compacto ? 'h-1.5 w-1.5' : 'h-2.5 w-2.5 animate-ping'
                }`}
            />
            {!compacto && (
                <span className="absolute inset-0 m-auto h-2 w-2 rounded-full bg-brand" />
            )}
        </div>
    )

    if (compacto) {
        return (
            <span className="inline-flex items-center gap-2">
                {anillos}
                <span className="text-sm text-fg-muted">{mensajes[indice]}</span>
            </span>
        )
    }

    return (
        <div role="status" aria-live="polite"
            className="flex flex-col items-center justify-center gap-5 py-14 text-center animate-fade-in"
        >
            {anillos}
            <div>
                <p className="text-sm font-semibold tracking-wide text-fg">{titulo}</p>
                <p key={indice} className="mt-1 text-xs text-fg-muted animate-fade-in">
                    {mensajes[indice]}
                </p>
            </div>
            {totalIntentos != null && totalIntentos > 0 && (
                <div className="flex items-center gap-1.5">
                    {Array.from({ length: totalIntentos }).map((_, i) => (
                        <span
                            key={i}
                            className={`h-1.5 rounded-full transition-all duration-500 ${
                                i < (intento ?? 0)
                                    ? 'w-4 bg-brand'
                                    : i === intento
                                        ? 'w-4 bg-brand/50 animate-pulse'
                                        : 'w-1.5 bg-line'
                            }`}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
