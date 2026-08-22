'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { suscribirseACambios } from '@/lib/fetchCache'

/**
 * Hook de carga de datos con:
 * - Cancelación: si la URL cambia rápido (paginación, filtros), la respuesta
 *   vieja se descarta y nunca pisa a la nueva.
 * - `refresh()` para recargar tras una mutación sin recargar la página.
 * - `actualizar()` para parchear el estado local (updates optimistas).
 *
 * Implementación: todo el ciclo de vida del request vive DENTRO del efecto
 * (controlador local + flag `cancelado`). Así ningún rechazo puede escapar
 * como promesa sin manejar, ni en StrictMode (mount→unmount→mount) ni al
 * desmontar el componente con un request en vuelo.
 */
/**
 * Caché en memoria compartida por TODAS las instancias del hook, clave =
 * URL. Al montar un componente con una URL ya visitada pinta los datos
 * cacheados AL INSTANTE (sin spinner) y revalida en segundo plano. Las
 * mutaciones llaman refresh(), que fuerza red ignorando la caché.
 */
const cacheGlobal = new Map<string, unknown>()

export function useRecurso<T>(url: string | null) {
    const [datos, setDatos] = useState<T | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [tick, setTick] = useState(0)

    // refresh(): incrementa `tick` para relanzar el efecto. Es síncrono y
    // seguro de pasar como callback a eventos/hijos.
    const refresh = useCallback(() => setTick(t => t + 1), [])

    useEffect(() => {
        if (!url) return

        const controller = new AbortController()
        let cancelado = false

        // Stale-while-revalidate SIEMPRE: si hay copia en caché (de esta
        // sesión o de una visita previa a la sección) se pinta al instante
        // y la red solo revalida por detrás. refresh() fuerza revalidación
        // pero nunca borra lo que ya hay en pantalla.
        const cacheado = cacheGlobal.get(url) as T | undefined
        if (cacheado !== undefined) {
            setDatos(cacheado)
            setError(null)
            setIsLoading(false)
        } else {
            setIsLoading(true)
            setError(null)
        }

        ;(async () => {
            try {
                const res = await fetch(url, { signal: controller.signal })
                if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`)
                const json = (await res.json()) as T
                cacheGlobal.set(url, json)
                if (!cancelado) setDatos(json)
            } catch (e: any) {
                // Cualquier forma de cancelación se traga en silencio:
                // AbortError clásico o señal ya marcada como abortada.
                if (cancelado || controller.signal.aborted || e?.name === 'AbortError') return
                // Con datos cacheados visibles, un fallo de revalidación no
                // debe reventar la UI: solo se reporta si no hay nada que mostrar.
                if (cacheGlobal.get(url) === undefined) setError(e?.message ?? 'Error de conexión')
            } finally {
                if (!cancelado) setIsLoading(false)
            }
        })()

        return () => {
            cancelado = true
            controller.abort()
        }
    }, [url, tick])

    /** Parchea los datos actuales sin re-fetch (update optimista). */
    const actualizar = useCallback((fn: (prev: T | null) => T | null) => {
        setDatos(prev => fn(prev))
    }, [])

    // ── Auto-revalidación: si cualquier mutación (en esta u otra sección)
    // toca el recurso de esta URL, refrescamos EN SILENCIO: la tabla se
    // actualiza sola, sin spinners ni refresco manual.
    const urlRef = useRef(url)
    urlRef.current = url

    const revalidarSilenciosa = useCallback(async () => {
        const actual = urlRef.current
        if (!actual) return
        try {
            const res = await fetch(actual)
            if (!res.ok) return
            const json = (await res.json()) as T
            cacheGlobal.set(actual, json)
            setDatos(json)
        } catch { /* silencioso: ya hay datos en pantalla */ }
    }, [])

    useEffect(() => {
        // El fragmento llega como "/api/<recurso>"; si nuestra URL empieza
        // igual, el cambio nos concierne.
        return suscribirseACambios(fragmento => {
            const actual = urlRef.current
            if (actual && actual.startsWith(fragmento)) revalidarSilenciosa()
        })
    }, [revalidarSilenciosa])

    return { datos, setDatos, isLoading, error, refresh, actualizar }
}
