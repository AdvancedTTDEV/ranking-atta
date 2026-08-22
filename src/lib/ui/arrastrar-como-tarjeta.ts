'use client'

/**
 * Arrastre estilo kanban: en vez del screenshot plano que el navegador
 * toma por defecto (un «PNG fantasma» cuadrado y opaco), clona el nodo
 * origen fuera de pantalla con estilos elevados — sombra profunda, leve
 * rotación, bordes redondeados — y lo registra como imagen de arrastre.
 *
 * Uso: llamar PRIMERO dentro de `onDragStart`. Si un ancestro tiene
 * `data-arraastre`, se usa ESE elemento como tarjeta visual (útil cuando
 * el drag inicia desde un handle pequeño pero se quiere llevar la
 * tarjeta completa). Sin atributo, se clona `e.currentTarget`.
 */
export function arrastrarComoTarjeta(e: React.DragEvent): void {
    const actual = e.currentTarget as HTMLElement | null
    const tarjeta = (actual?.closest?.('[data-arraastre]') as HTMLElement | null) ?? actual
    if (!tarjeta || typeof e.dataTransfer?.setDragImage !== 'function') return

    const rect = tarjeta.getBoundingClientRect()
    const clon = tarjeta.cloneNode(true) as HTMLElement
    // IDs duplicados fuera; el clon es decorativo.
    clon.removeAttribute('id')
    clon.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'))
    clon.setAttribute('aria-hidden', 'true')
    clon.style.cssText += [
        'position:fixed',
        'top:-10000px',
        'left:0',
        `width:${Math.round(rect.width)}px`,
        'margin:0',
        'pointer-events:none',
        'box-shadow:0 24px 48px rgba(0,0,0,.5), 0 8px 16px rgba(0,0,0,.35)',
        'border-radius:14px',
        'transform:rotate(1.5deg)',
        'opacity:.98',
    ].join(';')
    document.body.appendChild(clon)
    try {
        e.dataTransfer.setDragImage(
            clon,
            Math.round(Math.min(48, rect.width / 2)),
            Math.round(Math.min(30, rect.height / 2)),
        )
    } catch {
        // Navegador sin setDragImage: cae al comportamiento por defecto.
    }
    // El snapshot ya fue tomado: eliminar el clon para no dejar basura.
    window.setTimeout(() => clon.remove(), 150)
}
