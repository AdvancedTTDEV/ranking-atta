/**
 * Caché GET en memoria para el navegador (stale-while-revalidate).
 *
 * - Primera visita: va a la red y guarda.
 * - Visitas siguientes: devuelve la copia AL INSTANTE y revalida por
 *   detrás, así cambiar de opción/categoría nunca muestra spinner.
 * - Tras una mutación: pedir con `{ forzar: true }` (o invalidar antes)
 *   para obligar red.
 * - Duplicados: si dos componentes piden la misma URL a la vez, comparten
 *   una única petición en vuelo.
 */
const cache = new Map<string, unknown>()
const enVuelo = new Map<string, Promise<unknown>>()

async function revalidar<T>(url: string): Promise<T> {
    const promesa = (async () => {
        try {
            const r = await fetch(url)
            const d = await r.json()
            if (!r.ok) throw new Error(d.error || d.message || `Error ${r.status}`)
            cache.set(url, d)
            return d as T
        } finally {
            enVuelo.delete(url)
        }
    })()
    enVuelo.set(url, promesa)
    return promesa
}

/** Vistazo sincrónico a la caché (para decidir si mostrar spinner). */
export function obtenerCache<T>(url: string): T | undefined {
    return cache.get(url) as T | undefined
}

export async function fetchCache<T>(url: string, opts?: { forzar?: boolean }): Promise<T> {
    if (!opts?.forzar) {
        const hit = cache.get(url)
        if (hit !== undefined) {
            // Revalidación silenciosa: cuando termine actualiza la caché;
            // quien pintó desde ella puede releerla más adelante.
            revalidar<T>(url).catch(() => {})
            return hit as T
        }
    }
    return (enVuelo.get(url) ?? revalidar<T>(url)) as Promise<T>
}

/** Descarta entradas cuyo URL contiene el fragmento dado. */
export function invalidarFetchCache(fragmento: string) {
    for (const k of [...cache.keys()]) {
        if (k.includes(fragmento)) cache.delete(k)
    }
}

/** Precarga en paralelo sin esperar resultados (warma la caché). */
export function precargar(...urls: string[]) {
    urls.forEach(u => { fetchCache(u).catch(() => {}) })
}

// ── Invalidación automática por mutaciones ──────────────────────────────────
// Un interceptador de fetch detecta POST/PUT/PATCH/DELETE hacia /api/*,
// deduce el recurso ("/api/jugadores", "/api/torneos"…) y avisa a los
// suscriptores para que las tablas montadas se revaliden solas: el usuario
// nunca tiene que refrescar a mano tras un cambio.

type OyenteCambios = (fragmento: string) => void
const oyentes = new Set<OyenteCambios>()

/** Se entera de mutaciones cuyo recurso contenga el fragmento dado. */
export function suscribirseACambios(oyente: OyenteCambios): () => void {
    oyentes.add(oyente)
    return () => { oyentes.delete(oyente) }
}

let instalado = false

/**
 * Envuelve window.fetch UNA vez (llamar desde el proveedor cliente raíz).
 * Tras cualquier mutación exitosa contra /api/* invalida las entradas de
 * caché del recurso y notifica a los hooks montados.
 */
export function instalarInterceptadorFetch() {
    if (instalado || typeof window === 'undefined') return
    instalado = true

    const fetchOriginal = window.fetch.bind(window)
    window.fetch = async (input, init) => {
        const respuesta = await fetchOriginal(input as RequestInfo, init)
        try {
            const metodo = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
            const ruta = input instanceof Request
                ? new URL(input.url).pathname
                : new URL(String(input), location.origin).pathname
            if (metodo !== 'GET' && respuesta.ok && ruta.startsWith('/api/') && oyentes.size >= 0) {
                // Recurso a nivel de colección: /api/torneos/49/llaves → "/api/torneos".
                const partes = ruta.split('/').filter(Boolean)
                const fragmento = '/' + partes.slice(0, 2).join('/')
                for (const k of [...cache.keys()]) {
                    if (k.startsWith(fragmento)) cache.delete(k)
                }
                oyentes.forEach(o => { try { o(fragmento) } catch { /* aislado */ } })
            }
        } catch { /* nunca romper el fetch original */ }
        return respuesta
    }
}
