/**
 * Documentos de impresión y exportación generados desde DATOS, no desde el
 * DOM en pantalla. Así el resultado es idéntico en escritorio y móvil:
 * fondo claro fijo, ancho fijo y tipografías propias, sin que afecten el
 * modo oscuro ni el ancho del dispositivo.
 *
 * Dos salidas por documento:
 *  - `abrirImpresion`: ventana nueva con @page y print() automático.
 *  - `descargarPngDeDoc`: render offscreen a ancho fijo + html-to-image.
 */

export interface DocImpresion {
    titulo: string
    /** CSS del documento, incluidas reglas @page para la impresión. */
    estilos: string
    /** Markup interno (sin <html>/<body>). */
    cuerpo: string
}

const escaparHtml = (texto: string) =>
    texto.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c] || c))

const fechaLarga = () =>
    new Date().toLocaleDateString('es-PA', { day: '2-digit', month: 'long', year: 'numeric' })

/** Cabecera institucional compartida por todos los documentos. */
const cabecera = (torneoNombre: string, subtitulo: string) => `
    <header class="cabecera">
        <img class="logo" src="/logo.jpg" alt="ATTA" onerror="this.style.visibility='hidden'"/>
        <div class="titulo-central">
            <div class="titulo-torneo">${escaparHtml(torneoNombre)}</div>
            <div class="titulo-sub">${subtitulo}</div>
        </div>
        <img class="logo" src="/templates/escudo-panama.png" alt="Alcaldía de Panamá" onerror="this.style.visibility='hidden'"/>
    </header>`

const pie = `<div class="pie">Generado el ${fechaLarga()}</div>`

// ─────────────────────────────────────────────────────────────────────────────
// PALETAS (modo oscuro de la app vs claro para impresión)
// ─────────────────────────────────────────────────────────────────────────────

const PAL_OSCURO = {
    canvas: '#0B1120',
    surface: '#111827',
    subtle: '#1E293B',
    line: '#1E293B',
    lineStrong: '#334155',
    fg: '#F1F5F9',
    fgMuted: '#94A3B8',
    muted: '#64748B',
    headerBorder: '#334155',
    successText: '#34D399',
    successBg: '#064E3B',
    successClub: '#6EE7B7',
    warningBg: '#78350F',
    warningText: '#FBBF24',
    dashLine: '#475569',
} as const

const PAL_CLARO = {
    canvas: '#FFFFFF',
    surface: '#FFFFFF',
    subtle: '#F1F5F9',
    line: '#E2E8F0',
    lineStrong: '#CBD5E1',
    fg: '#0F172A',
    fgMuted: '#475569',
    muted: '#94A3B8',
    headerBorder: '#0F172A',
    successText: '#047857',
    successBg: '#ECFDF5',
    successClub: '#065F46',
    warningBg: '#FEF3C7',
    warningText: '#B45309',
    dashLine: '#CBD5E1',
} as const

/** Detecta el tema con el que se generará el "screenshot": el modo de la app
 *  (clase `dark` en <html>) o, en su defecto, el del sistema operativo. */
export function prefiereModoOscuro(): boolean {
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) return true
    if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return true
}

// ─────────────────────────────────────────────────────────────────────────────
// GRUPOS
// ─────────────────────────────────────────────────────────────────────────────

export interface GrupoDocParticipante {
    nombre: string
    club: string | null
    /** Solo individual: ID del jugador. */
    idIndividual?: number | null
    /** Solo equipos/parejas: integrantes con su serie (si se conoce). */
    integrantes?: { nombre: string; serie: string | null }[]
}

export interface GrupoDoc {
    numero: number
    participantes: GrupoDocParticipante[]
}

export interface ParamsGruposDoc {
    torneoNombre: string
    categoriaNombre: string
    esEquipo: boolean
    /** Palabra para el contador: "jugadores" | "parejas" | "equipos". */
    palabraParticipantes: string
    grupos: GrupoDoc[]
    /** true (default): espeja el modo oscuro del modal. false: versión clara para impresión. */
    oscuro?: boolean
}

export function construirDocGrupos(params: ParamsGruposDoc): DocImpresion {
    const { torneoNombre, categoriaNombre, esEquipo, palabraParticipantes, grupos, oscuro = true } = params
    const c = oscuro ? PAL_OSCURO : PAL_CLARO

    const tarjetas = grupos.map(grupo => {
        const filas = grupo.participantes.map((p, i) => {
            const club = p.club ?? '—'
            const integrantes = esEquipo && p.integrantes && p.integrantes.length > 0
                ? `<ul class="miembros">${p.integrantes.map(m =>
                    `<li>${escaparHtml(m.nombre)}${m.serie ? ` <span class="serie">(${escaparHtml(m.serie)})</span>` : ''}</li>`
                ).join('')}</ul>`
                : ''
            return `<tr>
                <td class="num">${i + 1}</td>
                <td><div class="nom">${escaparHtml(p.nombre)}</div>${integrantes}</td>
                <td class="club">${escaparHtml(club)}</td>
            </tr>`
        }).join('')
        return `
        <section class="grupo">
          <div class="grupo-head">
            <span class="grupo-titulo">Grupo ${grupo.numero}</span>
            <span class="grupo-count">${grupo.participantes.length} ${escaparHtml(palabraParticipantes)}</span>
          </div>
          <table><tbody>${filas}</tbody></table>
        </section>`
    }).join('')

    const subtitulo = `Distribución de grupos${categoriaNombre ? ` · Categoría ${escaparHtml(categoriaNombre)}` : ''}`

    return {
        titulo: `Grupos · ${torneoNombre}`,
        estilos: `
            @page{size:letter portrait;margin:10mm}
            *{box-sizing:border-box}
            html,body{margin:0;padding:0;background:${c.canvas}}
            body{font-family:-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${c.fg};-webkit-font-smoothing:antialiased}
            .hoja{background:${c.canvas};padding:24px}
            .cabecera{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:6px 4px 12px;border-bottom:2px solid ${c.headerBorder};margin-bottom:16px}
            .logo{height:72px;object-fit:contain;${oscuro ? 'background:#FFFFFF;border-radius:12px;padding:6px 8px;' : ''}}
            .titulo-central{flex:1;text-align:center}
            .titulo-torneo{font-size:26px;font-weight:800;font-style:normal;line-height:1.1;color:${c.fg};letter-spacing:-.3px}
            .titulo-sub{font-size:13px;color:${c.fgMuted};margin-top:4px;letter-spacing:.8px;text-transform:uppercase}
            .rejilla{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
            /* Tarjeta de grupo idéntica al modal: card con header delineado
               (borde inferior azul de marca) para que no se funda con el fondo. */
            .grupo{background:${c.surface};border:1.5px solid ${c.lineStrong};border-radius:10px;overflow:hidden;page-break-inside:avoid;${oscuro ? 'box-shadow:0 1px 3px rgba(0,0,0,.45);' : ''}}
            .grupo-head{display:flex;justify-content:space-between;align-items:center;background:${c.subtle};border-bottom:2px solid #3B82F6;padding:8px 11px}
            .grupo-titulo{font-weight:800;font-size:13px;letter-spacing:1.2px;text-transform:uppercase;color:${c.fg}}
            .grupo-count{font-weight:600;font-size:10.5px;color:${c.fgMuted};background:${c.canvas};border:1px solid ${c.lineStrong};border-radius:999px;padding:2px 9px}
            table{width:100%;border-collapse:collapse}
            td{padding:7px 11px;vertical-align:top}
            tr + tr td{border-top:1px solid ${c.line}}
            .num{width:26px;font-family:'Courier New',monospace;font-weight:bold;font-size:12px;color:${c.muted}}
            .nom{font-weight:700;font-size:13.5px;line-height:1.25;color:${c.fg}}
            ul.miembros{list-style:none;margin:3px 0 0;padding:0;font-size:11.5px;color:${oscuro ? '#CBD5E1' : '#334155'};line-height:1.45}
            ul.miembros li:before{content:"· ";color:${c.muted}}
            ul.miembros .serie{color:${c.muted};font-style:italic}
            .club{text-align:right;color:${c.fgMuted};font-size:11.5px;white-space:nowrap}
            .pie{margin-top:18px;text-align:right;font-size:11px;color:${c.muted};font-style:italic}
            @media print{.hoja{padding:0}}
        `,
        cuerpo: `${cabecera(torneoNombre, subtitulo)}<div class="rejilla">${tarjetas}</div>${pie}`,
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// LLAVES
// ─────────────────────────────────────────────────────────────────────────────

export interface PartidoLlaveDoc {
    /** null = cupo vacío (pase directo o cruce futuro). */
    localNombre: string | null
    localClub: string | null
    /** El cupo vacío local aún espera al ganador de otro partido. */
    localEsperando?: boolean
    /** null = cupo vacío (pase directo o cruce futuro). */
    visitanteNombre: string | null
    visitanteClub: string | null
    /** El cupo vacío visitante aún espera al ganador de otro partido. */
    visitanteEsperando?: boolean
    finalizado: boolean
    /** true = ganó local, false = ganó visitante, null = sin resultado. */
    ganaLocal: boolean | null
}

export interface RondaLlaveDoc {
    nombre: string
    partidos: PartidoLlaveDoc[]
}

export interface ParamsLlavesDoc {
    torneoNombre: string
    categoriaNombre: string
    /** Ej: "Primera categoría (1º)" para ATTA Teams; null en modalidades clásicas. */
    etiquetaNivel: string | null
    rondas: RondaLlaveDoc[]
    /** true (default): espeja el modo oscuro del modal. false: versión clara para impresión. */
    oscuro?: boolean
}

/**
 * Espeja el diseño del modal en pantalla: mitades espejadas con la final al
 * centro y tarjetas idénticas a la LlaveCard (ganador resaltado, campeón con
 * banner ámbar). Respeta el modo de la compu: oscuro por defecto, claro al
 * imprimir.
 */
export function construirDocLlaves(params: ParamsLlavesDoc): DocImpresion {
    const { torneoNombre, categoriaNombre, etiquetaNivel, rondas, oscuro = true } = params
    const c = oscuro ? PAL_OSCURO : PAL_CLARO

    const filaLado = (nombre: string | null, club: string | null, esperando: boolean, esGanador: boolean | null, finalizado: boolean) => {
        // Misma regla que la página: un cupo vacío que aún puede recibir a
        // alguien es "Por definir"; si su fuente cerró (o no existe) es BYE.
        const etiquetaVacio = esperando ? 'Por definir' : 'BYE'
        const clase = finalizado ? (esGanador === true ? 'ganador' : esGanador === false ? 'perdedor' : '') : ''
        return `<div class="lado ${clase}${!nombre ? ' vacio' : ''}">
            <div class="lado-info">
                <span class="lado-nombre">${finalizado && esGanador === true ? '<span class="check">✔</span>' : ''}${escaparHtml(nombre ?? etiquetaVacio)}</span>
                ${club ? `<span class="lado-club">${escaparHtml(club)}</span>` : ''}
            </div>
        </div>`
    }

    const tarjetaHtml = (p: PartidoLlaveDoc, esFinal = false) => {
        const lNull = p.localNombre == null
        const vNull = p.visitanteNombre == null
        const ambosVacios = lNull && vNull
        const ganador = p.ganaLocal === true ? p.localNombre : p.ganaLocal === false ? p.visitanteNombre : null
        let pie = ''
        if (p.finalizado && ganador) {
            // Igual que la página: banner de campeón ámbar en la final,
            // caja verde «Ganador» en el resto.
            pie = esFinal
                ? `<div class="campeon">★ Campeón: ${escaparHtml(ganador)}</div>`
                : `<div class="pie-card"><span class="g">Ganador: ${escaparHtml(ganador)}</span></div>`
        } else if (!p.finalizado && !ambosVacios) {
            pie = `<div class="pie-card"><span class="lbl">Ganador:</span><span class="linea"></span></div>`
        }
        return `<div class="card${p.finalizado ? ' fin' : ''}">
            ${filaLado(p.localNombre, p.localClub, !!p.localEsperando, p.ganaLocal === true ? true : p.ganaLocal === false ? false : null, p.finalizado)}
            ${filaLado(p.visitanteNombre, p.visitanteClub, !!p.visitanteEsperando, p.ganaLocal === true ? false : p.ganaLocal === false ? true : null, p.finalizado)}
            ${pie}
        </div>`
    }

    const columnaHtml = (ronda: { nombre: string; partidos: PartidoLlaveDoc[] }) => `
        <div class="col">
            <h3>${escaparHtml(ronda.nombre)}</h3>
            <div class="partidos">${ronda.partidos.map(t => tarjetaHtml(t)).join('')}</div>
        </div>`

    const k = rondas.length
    const rondaFinal = rondas[k - 1]
    const previas = rondas.slice(0, k - 1)
    const corte = (n: number) => Math.ceil(n / 2)
    // Mitades espejadas: la derecha muestra las rondas en orden inverso para
    // converger hacia la final, igual que BracketLayout en pantalla.
    const mitadIzq = previas.map(r => ({ nombre: r.nombre, partidos: r.partidos.slice(0, corte(r.partidos.length)) }))
    const mitadDer = previas.map(r => ({ nombre: r.nombre, partidos: r.partidos.slice(corte(r.partidos.length)) })).reverse()

    const subtitulo = `Llaves de eliminación${categoriaNombre ? ` · Categoría ${escaparHtml(categoriaNombre)}` : ''}${etiquetaNivel ? ` · ${escaparHtml(etiquetaNivel)}` : ''}`
    const cuerpoBracket = `
        <div class="bracket">
            <div class="mitad">${mitadIzq.map(columnaHtml).join('')}</div>
            <div class="col final-col">
                <h3>★ ${escaparHtml(rondaFinal?.nombre ?? '')}</h3>
                <div class="partidos centro">${rondaFinal?.partidos.map(t => tarjetaHtml(t, true)).join('') ?? ''}</div>
            </div>
            <div class="mitad">${mitadDer.map(columnaHtml).join('')}</div>
        </div>`

    return {
        titulo: `Llaves · ${torneoNombre}`,
        estilos: `
            @page{size:A4 landscape;margin:10mm}
            *{box-sizing:border-box}
            html,body{margin:0;padding:0;background:${c.canvas}}
            body{font-family:-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${c.fg};-webkit-font-smoothing:antialiased}
            .hoja{background:${c.canvas};padding:20px}
            .cabecera{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:4px 4px 12px;border-bottom:2px solid ${c.headerBorder};margin-bottom:16px}
            .logo{height:58px;object-fit:contain;${oscuro ? 'background:#FFFFFF;border-radius:12px;padding:5px 7px;' : ''}}
            .titulo-central{flex:1;text-align:center}
            .titulo-torneo{font-size:22px;font-weight:800;font-style:normal;line-height:1.1;color:${c.fg};letter-spacing:-.3px}
            .titulo-sub{font-size:12px;color:${c.fgMuted};margin-top:4px;letter-spacing:.8px;text-transform:uppercase}
            .bracket{display:flex;gap:14px;align-items:center}
            .mitad{flex:1;display:flex;gap:14px;align-items:stretch;min-width:0}
            .col{flex:1;min-width:0;display:flex;flex-direction:column}
            .col h3{text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.4px;color:${c.fgMuted};margin:0 0 10px;padding-bottom:5px;border-bottom:2px solid ${c.lineStrong}}
            .partidos{flex:1;display:flex;flex-direction:column;justify-content:space-around;gap:12px}
            .partidos.centro{justify-content:center}
            .final-col{width:250px;flex:none}
            .final-col h3{color:${oscuro ? '#F59E0B' : '#B45309'};border-bottom-color:${c.warningBg};font-size:12px}
            .card{border:1.5px solid ${c.lineStrong};border-radius:9px;background:${c.surface};overflow:hidden;page-break-inside:avoid;${oscuro ? 'box-shadow:0 1px 3px rgba(0,0,0,.45);' : ''}}
            .card.fin{border-color:${oscuro ? '#10B981' : '#059669'};border-left:4px solid ${oscuro ? '#10B981' : '#059669'}}
            .lado{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 11px;min-height:36px}
            .lado + .lado{border-top:1px solid ${c.line}}
            .lado.ganador{background:${c.successBg}}
            .lado.perdedor{color:${c.muted}}
            .lado-info{min-width:0;display:flex;flex-direction:column}
            .lado-nombre{font-weight:700;font-size:13px;line-height:1.25;color:${c.fg};overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
            .lado.ganador .lado-nombre{color:${c.successText}}
            .lado.perdedor .lado-nombre{font-weight:500;color:${c.muted}}
            .lado.vacio .lado-nombre{font-weight:600;font-style:italic;color:${c.fgMuted};letter-spacing:.8px;font-size:11.5px}
            .check{color:${c.successText};font-weight:800;margin-right:3px}
            .lado-club{font-size:10px;color:${c.muted};margin-top:1px}
            .lado.ganador .lado-club{color:${c.successClub}}
            .pie-card{display:flex;align-items:center;gap:6px;border-top:1.5px dashed ${c.dashLine};margin:0 9px;padding:5px 2px 7px}
            .pie-card .g{font-size:10.5px;font-weight:700;color:${c.successText};letter-spacing:.3px}
            .pie-card .lbl{font-size:10px;font-weight:600;color:${c.muted};text-transform:uppercase;letter-spacing:.6px}
            .pie-card .linea{flex:1;border-bottom:1.2px solid ${c.dashLine};height:11px}
            .campeon{display:flex;align-items:center;justify-content:center;gap:5px;margin:8px;padding:7px 6px;background:${c.warningBg};color:${c.warningText};font-size:12px;font-weight:800;letter-spacing:.4px;border-radius:7px;text-transform:uppercase}
            .pie{margin-top:14px;text-align:right;font-size:10.5px;color:${c.muted};font-style:italic}
            @media print{.hoja{padding:0}}
        `,
        cuerpo: `${cabecera(torneoNombre, subtitulo)}${cuerpoBracket}${pie}`,
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SALIDAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Abre una ventana con el documento y lanza el diálogo de impresión.
 * Devuelve false si el navegador bloqueó la ventana emergente.
 */
export function abrirImpresion(doc: DocImpresion): boolean {
    const ventana = window.open('', '_blank', 'width=1100,height=1400')
    if (!ventana) return false
    ventana.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${escaparHtml(doc.titulo)}</title><style>${doc.estilos}</style></head><body><div class="hoja">${doc.cuerpo}</div><script>window.onload=()=>window.print()<\/script></body></html>`)
    ventana.document.close()
    return true
}

let suprimiendoRuidoConsola = false
/** html-to-image toca cssRules de hojas cross-origin y ensucia la consola. */
function suprimirRuidoCssRules() {
    if (suprimiendoRuidoConsola) return
    suprimiendoRuidoConsola = true
    const originalError = console.error
    console.error = (...args: unknown[]) => {
        if (String(args[0]).includes('cssRules')) return
        originalError(...args)
    }
}

/**
 * Convierte todas las <img> del contenedor a data URLs ANTES de capturar.
 * html-to-image incrusta los recursos de forma asíncrona y a veces captura
 * antes de terminar: los logos salían vacíos en el PNG. Inline explícito =
 * resultado determinista.
 */
async function incrustarImagenesComoDataUrl(raiz: HTMLElement): Promise<void> {
    const imagenes = Array.from(raiz.querySelectorAll('img'))
    await Promise.all(imagenes.map(async img => {
        const src = img.getAttribute('src')
        if (!src || src.startsWith('data:')) return
        try {
            const respuesta = await fetch(src)
            if (!respuesta.ok) return
            const blob = await respuesta.blob()
            const dataUrl = await new Promise<string | null>(resolver => {
                const lector = new FileReader()
                lector.onload = () => resolver(String(lector.result))
                lector.onerror = () => resolver(null)
                lector.readAsDataURL(blob)
            })
            if (dataUrl) {
                img.src = dataUrl
                img.removeAttribute('onerror')
            }
        } catch { /* se conserva el src original */ }
    }))
}

/**
 * Renderiza el documento en un contenedor offscreen de ancho FIJO y lo
 * convierte en PNG (pixelRatio 2). El fondo se pasa por parámetro: blanco
 * para documentos de impresión, canvas oscuro (#0B1120) para los docs que
 * espejan el modo oscuro de la app (llaves, grupos).
 */
export async function descargarPngDeDoc(doc: DocImpresion, anchoPx: number, nombreArchivo: string, fondo: string = '#ffffff'): Promise<void> {
    const contenedor = document.createElement('div')
    contenedor.setAttribute('aria-hidden', 'true')
    contenedor.style.cssText = `position:fixed;left:-20000px;top:0;width:${anchoPx}px;background:${fondo};`
    contenedor.innerHTML = `<style>${doc.estilos.replace(/@page[^}]+\}/g, '')}</style><div class="hoja">${doc.cuerpo}</div>`
    document.body.appendChild(contenedor)
    suprimirRuidoCssRules()
    try {
        const objetivo = contenedor.querySelector('.hoja') as HTMLElement
        // Logos y demás imágenes fijados como data URL antes del render.
        await incrustarImagenesComoDataUrl(objetivo)
        const { toPng } = await import('html-to-image')
        const dataUrl = await toPng(objetivo, { backgroundColor: fondo, pixelRatio: 2, skipFonts: true })
        const enlace = document.createElement('a')
        enlace.download = nombreArchivo
        enlace.href = dataUrl
        enlace.click()
    } finally {
        contenedor.remove()
    }
}
