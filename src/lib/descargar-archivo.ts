/**
 * Descarga de archivos cross-browser con fallback para iOS Safari.
 *
 * El patrón `<a download href={blob}>` funciona en Chrome/Firefox/Safari
 * desktop, pero en iOS Safari (móvil y desktop) tiene dos problemas:
 *
 *  - Para `Blob` URLs, `link.download` se ignora si el archivo no es
 *    una imagen (p.ej. PDFs) — Safari abre el archivo en una pestaña
 *    nueva en lugar de descargarlo.
 *  - Para `data:` URLs (data-URLs), `link.download` siempre se ignora
 *    en iOS Safari: la imagen se abre en una pestaña.
 *
 * Estrategia:
 *  - Chrome/Firefox/desktop: `<a download href={blob}>` programático
 *    (mismo patrón que ya usa el código).
 *  - iOS Safari: `window.open(blobUrl, '_blank')` para que Safari lo
 *    abra; el usuario hace long-press → "Guardar" (imagen) o usa la
 *    opción de descarga del visor PDF (Safari iOS 13+ tiene un botón
 *    "Guardar" en el visor).
 *
 * El segundo parámetro `nombreArchivo` es la sugerencia del nombre
 * que Chrome/Firefox respetan; iOS lo ignora (usa el nombre derivado
 * de la URL).
 */
const isIOS = () => {
    if (typeof navigator === 'undefined') return false
    const ua = navigator.userAgent
    if (/iPad|iPhone|iPod/.test(ua)) return true
    // iPadOS 13+ se identifica como Mac con touch
    return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1
}

export function descargarArchivo(url: string, nombreArchivo: string): void {
    if (isIOS()) {
        // iOS Safari ignora `<a download>`. Abrimos en nueva pestaña —
        // Safari muestra un botón de "Guardar" en su visor.
        window.open(url, '_blank')
        return
    }

    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = nombreArchivo
    enlace.rel = 'noopener'
    // Para data: URLs en Firefox hace falta que esté en el DOM
    document.body.appendChild(enlace)
    enlace.click()
    setTimeout(() => {
        document.body.removeChild(enlace)
    }, 100)
}

/** Igual que `descargarArchivo` pero recibiendo un Blob. */
export function descargarBlob(blob: Blob, nombreArchivo: string): void {
    const url = URL.createObjectURL(blob)
    try {
        descargarArchivo(url, nombreArchivo)
    } finally {
        // Si iOS abrió una pestaña, el navegador aún referencia el blob;
        // liberamos al rato para no acumular memoria. Si la pestaña está
        // abierta y Safari aún renderiza, mantener un poco más.
        setTimeout(() => URL.revokeObjectURL(url), isIOS() ? 30_000 : 100)
    }
}
