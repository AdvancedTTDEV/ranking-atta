/**
 * Descarga de archivos cross-browser con soporte iOS.
 *
 * El patrón `<a download href={blob}>` funciona en Chrome/Firefox/Safari
 * desktop, pero en iOS falla de varias formas:
 *
 *  - `<a download>` se ignora para data:/blobs según versión → abre pestaña.
 *  - `window.open(blobUrl)` tras trabajo asíncrono se bloquea como popup
 *    y NO pasa nada (síntoma: "no guarda nada ni en Safari ni en Chrome").
 *
 * Estrategia en `descargarBlob`:
 *  1) Web Share API con archivos (iOS 15+/Android/Edge): abre la hoja
 *     nativa del sistema con "Guardar imagen" / "Guardar en Archivos".
 *     Es la única vía 100% confiable en iOS.
 *  2) Fallback desktop/iOS viejo: `<a download>` programático; en iOS,
 *     apertura en nueva pestaña (con rescate si el popup fue bloqueado).
 */
const esIOS = () => {
    if (typeof navigator === 'undefined') return false
    const ua = navigator.userAgent
    if (/iPad|iPhone|iPod/.test(ua)) return true
    // iPadOS 13+ se identifica como Mac con touch
    return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1
}

type NavigatorConShare = Navigator & {
    canShare?: (data: ShareData) => boolean
    share?: (data: ShareData) => Promise<void>
}

export function descargarArchivo(url: string, nombreArchivo: string): void {
    if (esIOS()) {
        // iOS Safari ignora `<a download>`. Abrimos en nueva pestaña —
        // Safari muestra un botón de "Guardar" en su visor.
        const win = window.open(url, '_blank')
        if (!win) {
            // Popup bloqueado (común tras awaits): enlace sintético como último recurso.
            const enlace = document.createElement('a')
            enlace.href = url
            enlace.target = '_blank'
            enlace.rel = 'noopener'
            document.body.appendChild(enlace)
            enlace.click()
            enlace.remove()
        }
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

/** Igual que `descargarArchivo` pero recibiendo un Blob. En iOS usa la hoja nativa de compartir. */
export function descargarBlob(blob: Blob, nombreArchivo: string): void {
    const url = URL.createObjectURL(blob)
    const liberar = () => setTimeout(() => URL.revokeObjectURL(url), esIOS() ? 30_000 : 1000)

    // 1) Hoja nativa de compartir con archivos ("Guardar imagen" en iOS).
    const nav = (typeof navigator !== 'undefined' ? navigator : undefined) as NavigatorConShare | undefined
    if (nav?.share && nav.canShare) {
        try {
            const archivo = new File([blob], nombreArchivo, {
                type: blob.type || 'application/octet-stream',
            })
            if (nav.canShare({ files: [archivo] })) {
                nav.share({ files: [archivo], title: nombreArchivo })
                    .catch(() => { /* el usuario cerró la hoja: no es un fallo */ })
                    .finally(liberar)
                return
            }
        } catch {
            // Navegador raro: caemos al fallback clásico.
        }
    }

    // 2) Fallback clásico por plataforma.
    try {
        descargarArchivo(url, nombreArchivo)
    } finally {
        liberar()
    }
}
