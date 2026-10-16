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
import { descargarBlob } from './descargar-archivo'

export interface DocImpresion {
    titulo: string
    /** CSS del documento, incluidas reglas @page para la impresión. */
    estilos: string
    /** Markup interno (sin <html>/<body>). */
    cuerpo: string
    /** Ancho lógico (px) recomendado para el PNG; `descargarPngDeDoc` lo usa si no se pasa otro. */
    anchoSugerido?: number
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
            .hoja{background:${c.canvas};padding:16px}
            .cabecera{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:2px 2px 10px;border-bottom:2px solid ${c.headerBorder};margin-bottom:12px}
            .logo{height:44px;object-fit:contain;${oscuro ? 'background:#FFFFFF;border-radius:12px;padding:4px 6px;' : ''}}
            .titulo-central{flex:1;text-align:center}
            .titulo-torneo{font-size:20px;font-weight:800;font-style:normal;line-height:1.1;color:${c.fg};letter-spacing:-.3px}
            .titulo-sub{font-size:11px;color:${c.fgMuted};margin-top:3px;letter-spacing:.8px;text-transform:uppercase}
            .rejilla{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;align-items:start}
            /* Tarjeta de grupo idéntica al modal: card con header delineado
               (borde inferior azul de marca) para que no se funda con el fondo. */
            .grupo{background:${c.surface};border:1.5px solid ${c.lineStrong};border-radius:10px;overflow:hidden;page-break-inside:avoid;${oscuro ? 'box-shadow:0 1px 3px rgba(0,0,0,.45);' : ''}}
            .grupo-head{display:flex;justify-content:space-between;align-items:center;background:${c.subtle};border-bottom:2px solid #3B82F6;padding:6px 9px}
            .grupo-titulo{font-weight:800;font-size:11.5px;letter-spacing:1.2px;text-transform:uppercase;color:${c.fg}}
            .grupo-count{font-weight:600;font-size:9.5px;color:${c.fgMuted};background:${c.canvas};border:1px solid ${c.lineStrong};border-radius:999px;padding:1px 8px}
            table{width:100%;border-collapse:collapse}
            td{padding:5px 9px;vertical-align:top}
            tr + tr td{border-top:1px solid ${c.line}}
            .num{width:22px;font-family:'Courier New',monospace;font-weight:bold;font-size:11px;color:${c.muted}}
            .nom{font-weight:700;font-size:12px;line-height:1.25;color:${c.fg}}
            ul.miembros{list-style:none;margin:2px 0 0;padding:0;font-size:10.5px;color:${oscuro ? '#CBD5E1' : '#334155'};line-height:1.35}
            ul.miembros li:before{content:"· ";color:${c.muted}}
            ul.miembros .serie{color:${c.muted};font-style:italic}
            .club{text-align:right;color:${c.fgMuted};font-size:10.5px;white-space:nowrap}
            .pie{margin-top:12px;text-align:right;font-size:10px;color:${c.muted};font-style:italic}
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
// LLAVES · estilo "hairline" (solo PNG, siempre oscuro)
// ─────────────────────────────────────────────────────────────────────────────

const HL = { fondo: '#0B1120', oro: '#E3B341', azul: '#4A90E2', cuadro: '#2F6FB5', texto: '#E5E7EB', tenue: '#64748B', ok: '#34D399' }
const HL_SLOT = 20 // alto de cada renglón (línea de nombre)
const HL_GAP = 12 // aire entre partidos de la primera ronda
const HL_CENTRO = 110 // ancho reservado al logo central (modo espejado)
const HL_LOGO = 84

interface NodoHL { p: PartidoLlaveDoc; hijos: (NodoHL | null)[]; prof: number }

/** Árbol desde la final: el partido i de la ronda r se alimenta de los partidos 2i y 2i+1 de la ronda previa. */
function arbolDesde(rondas: RondaLlaveDoc[], r: number, i: number, prof: number): NodoHL {
    const hijos = r === 0 ? [null, null] : [2 * i, 2 * i + 1].map(j => j < rondas[r - 1].partidos.length ? arbolDesde(rondas, r - 1, j, prof + 1) : null)
    return { p: rondas[r].partidos[i], hijos, prof }
}
const profMax = (n: NodoHL): number => Math.max(n.prof, ...n.hijos.map(h => (h ? profMax(h) : 0)))

type EstadoHL = 'g' | 'p' | null

/**
 * Llaves "hairline": líneas de 1px, nombres en mayúsculas SOBRE la línea,
 * conectores en ángulo recto y cuadritos en los nodos. Con >= 8 cupos se
 * espeja (oro a la izquierda, azul a la derecha, logo ATTA al centro); si no,
 * un solo sentido izquierda→derecha.
 */
export function construirDocLlavesHairline(params: Omit<ParamsLlavesDoc, 'oscuro'>): DocImpresion {
    const { torneoNombre, categoriaNombre, etiquetaNivel, rondas } = params
    const k = rondas.length
    const subtitulo = `Llaves de eliminación${categoriaNombre ? ` · Categoría ${escaparHtml(categoriaNombre)}` : ''}${etiquetaNivel ? ` · ${escaparHtml(etiquetaNivel)}` : ''}`
    if (k === 0 || rondas[k - 1].partidos.length === 0) {
        return { titulo: `Llaves · ${torneoNombre}`, estilos: '', cuerpo: `<div style="color:${HL.texto};padding:20px">Sin llaves</div>`, anchoSugerido: 480 }
    }
    const raiz = arbolDesde(rondas, k - 1, 0, 0)
    const espejado = k >= 3 && rondas[0].partidos.length >= 4 && raiz.hijos[0] != null && raiz.hijos[1] != null
    // Columnas desde la hoja más profunda (prof = D) hasta la raíz (prof = 0).
    const D = profMax(raiz)
    const colW = D <= 4 ? 135 : D === 5 ? 112 : 96
    const fs = colW >= 125 ? 10 : colW >= 105 ? 9 : 8.5
    const maxChars = Math.floor((colW - 8) / (fs * 0.66 + 0.3))
    const SW = (D + 1) * colW // x local del nodo raíz (o ancho de cada mitad)

    const partes: string[] = []
    let cursor = 0
    const recortar = (t: string) => { const u = t.toUpperCase(); return u.length > maxChars ? u.slice(0, maxChars - 1) + '…' : u }

    /** Línea de xa→xb (coordenadas locales, dir=-1 las espeja respecto a x0) con el nombre encima. */
    const linea = (dir: 1 | -1, x0: number, xa: number, xb: number, y: number, nombre: string | null, esperando: boolean, estado: EstadoHL, color: string) => {
        const a = x0 + dir * xa, b = x0 + dir * xb
        partes.push(`<path d="M${a} ${y}H${b}" stroke="${color}" stroke-width="1" fill="none"/>`)
        if (!nombre && esperando) return
        const marca = estado === 'g' ? `<tspan fill="${HL.ok}" dx="3">✓</tspan>` : ''
        const fill = !nombre || estado === 'p' ? HL.tenue : HL.texto
        partes.push(`<text x="${a + dir * 2}" y="${y - 4}" text-anchor="${dir === 1 ? 'start' : 'end'}" font-size="${fs}" font-weight="${estado === 'g' ? 700 : 500}" letter-spacing=".3" fill="${fill}"${nombre ? '' : ' font-style="italic"'}>${escaparHtml(nombre ? recortar(nombre) : 'BYE')}${marca}</text>`)
    }

    /** Dibuja el subárbol y devuelve la Y de su salida. */
    const dibujar = (n: NodoHL, dir: 1 | -1, x0: number, color: string): number => {
        const xv = (D - n.prof + 1) * colW
        const gana = n.p.finalizado ? n.p.ganaLocal : null
        const lados: { nombre: string | null; esp: boolean; estado: EstadoHL }[] = [
            { nombre: n.p.localNombre, esp: !!n.p.localEsperando, estado: gana == null ? null : gana ? 'g' : 'p' },
            { nombre: n.p.visitanteNombre, esp: !!n.p.visitanteEsperando, estado: gana == null ? null : gana ? 'p' : 'g' },
        ]
        const ys = lados.map((l, i) => {
            const h = n.hijos[i]
            let y: number
            if (h) y = dibujar(h, dir, x0, color)
            else { cursor += HL_SLOT; y = cursor }
            linea(dir, x0, xv - colW, xv, y, l.nombre, l.esp, l.estado, color)
            return y
        })
        if (!n.hijos[0] && !n.hijos[1]) cursor += HL_GAP
        const mid = (ys[0] + ys[1]) / 2
        partes.push(`<path d="M${x0 + dir * xv} ${ys[0]}V${ys[1]}" stroke="${color}" stroke-width="1" fill="none"/>`)
        partes.push(`<rect x="${x0 + dir * xv - 3.5}" y="${mid - 3.5}" width="7" height="7" fill="${HL.cuadro}"/>`)
        return mid
    }

    const f = raiz.p
    const campeon = f.finalizado && f.ganaLocal != null ? (f.ganaLocal ? f.localNombre : f.visitanteNombre) : null
    const imgLogo = (left: number, top: number) =>
        `<img src="/logo.jpg" alt="ATTA" style="position:absolute;left:${left}px;top:${top}px;width:${HL_LOGO}px;height:${HL_LOGO}px;object-fit:contain;background:#fff;border-radius:12px;padding:4px"/>`

    let W: number, H: number, extra: string
    if (espejado) {
        W = 2 * SW + HL_CENTRO
        // La final no es un nodo: sus dos entradas son las salidas de cada mitad.
        const mitad = (i: 0 | 1, dir: 1 | -1, x0: number, color: string) => {
            cursor = 0
            const y = dibujar(raiz.hijos[i] as NodoHL, dir, x0, color)
            const estado: EstadoHL = !f.finalizado || f.ganaLocal == null ? null : f.ganaLocal === (i === 0) ? 'g' : 'p'
            linea(dir, x0, SW - colW, SW, y, i === 0 ? f.localNombre : f.visitanteNombre, i === 0 ? !!f.localEsperando : !!f.visitanteEsperando, estado, color)
            return { y, alto: cursor }
        }
        const izq = mitad(0, 1, 0, HL.oro)
        const der = mitad(1, -1, W, HL.azul)
        H = Math.max(izq.alto, der.alto)
        const cy = (izq.y + der.y) / 2
        extra = imgLogo(W / 2 - HL_LOGO / 2, cy - HL_LOGO / 2)
            + (campeon ? `<div style="position:absolute;left:${W / 2 - 80}px;width:160px;top:${cy + HL_LOGO / 2 + 6}px;text-align:center;font-size:10px;font-weight:800;letter-spacing:.8px;color:#F59E0B">★ ${escaparHtml(recortar(campeon))}</div>` : '')
    } else {
        const salida = 150
        const ancho = SW + salida + 12 + HL_LOGO
        W = Math.max(ancho, 560)
        const x0 = (W - ancho) / 2
        const y = dibujar(raiz, 1, x0, HL.oro)
        H = cursor
        linea(1, x0, SW, SW + salida, y, campeon, true, campeon ? 'g' : null, HL.oro)
        extra = imgLogo(x0 + SW + salida + 12, y - HL_LOGO / 2)
    }
    H = Math.round(Math.max(H, HL_LOGO + 2 * HL_GAP))
    W = Math.round(W)

    const cuerpo = `
        <header class="hl-cab">
            <img class="hl-logo" src="/templates/escudo-panama.png" alt="Alcaldía de Panamá"/>
            <div class="hl-tit"><div class="hl-t1">${escaparHtml(torneoNombre)}</div><div class="hl-t2">${subtitulo}</div></div>
            <img class="hl-logo" src="/logo.jpg" alt="ATTA"/>
        </header>
        <div class="hl-bracket" style="width:${W}px;height:${H}px">
            <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">${partes.join('')}</svg>
            ${extra}
        </div>
        <div class="pie">Generado el ${fechaLarga()}</div>`

    return {
        titulo: `Llaves · ${torneoNombre}`,
        estilos: `
            *{box-sizing:border-box}
            body{font-family:-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${HL.texto};-webkit-font-smoothing:antialiased}
            .hoja{background:${HL.fondo};padding:20px}
            .hl-cab{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:12px;margin-bottom:14px;border-bottom:1px solid #1E293B}
            .hl-logo{height:40px;width:40px;object-fit:contain;background:#fff;border-radius:8px;padding:3px}
            .hl-tit{flex:1;text-align:center}
            .hl-t1{font-size:18px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#fff;line-height:1.15}
            .hl-t2{font-size:10px;color:#94A3B8;margin-top:4px;letter-spacing:1px;text-transform:uppercase}
            .hl-bracket{position:relative;margin:0 auto}
            .hl-bracket svg{display:block}
            .pie{margin-top:10px;text-align:right;font-size:9px;color:${HL.tenue};font-style:italic}
        `,
        cuerpo,
        anchoSugerido: W + 40,
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

const leerComoDataUrl = (blob: Blob) => new Promise<string | null>(resolver => {
    const lector = new FileReader()
    lector.onload = () => resolver(String(lector.result))
    lector.onerror = () => resolver(null)
    lector.readAsDataURL(blob)
})

/** fetch → blob → data URL; si falla (CORS/red), dibuja una <img> CORS en un canvas. */
async function srcADataUrl(src: string): Promise<string | null> {
    try {
        const respuesta = await fetch(src)
        if (respuesta.ok) {
            const dataUrl = await leerComoDataUrl(await respuesta.blob())
            if (dataUrl) return dataUrl
        }
    } catch { /* se prueba el canvas */ }
    return new Promise<string | null>(resolver => {
        const im = new Image()
        im.crossOrigin = 'anonymous'
        im.onload = () => {
            try {
                const c = document.createElement('canvas')
                c.width = im.naturalWidth
                c.height = im.naturalHeight
                c.getContext('2d')!.drawImage(im, 0, 0)
                resolver(c.toDataURL('image/png'))
            } catch { resolver(null) }
        }
        im.onerror = () => resolver(null)
        im.src = src
    })
}

/** Escudo con iniciales: sustituye a un logo que no se pudo cargar (nunca queda vacío). */
function placeholderLogo(alt: string): string {
    const iniciales = alt.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'A'
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><path d="M8 8h80v50c0 18-20 28-40 34C28 86 8 76 8 58z" fill="#1E293B" stroke="#64748B" stroke-width="3"/><text x="48" y="58" text-anchor="middle" font-family="Arial,sans-serif" font-size="30" font-weight="700" fill="#E2E8F0">${escaparHtml(iniciales)}</text></svg>`
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/**
 * Convierte todas las <img> del contenedor a data URLs ANTES de capturar.
 * html-to-image incrusta los recursos de forma asíncrona y a veces captura
 * antes de terminar: los logos salían vacíos en el PNG. Inline explícito
 * (con 1 reintento y placeholder de respaldo) = resultado determinista.
 */
async function incrustarImagenesComoDataUrl(raiz: HTMLElement): Promise<void> {
    const imagenes = Array.from(raiz.querySelectorAll('img'))
    await Promise.all(imagenes.map(async img => {
        img.removeAttribute('onerror')
        img.style.visibility = 'visible'
        const src = img.getAttribute('src')
        if (!src) return
        let dataUrl = src.startsWith('data:') ? src : null
        for (let intento = 0; !dataUrl && intento < 2; intento++) dataUrl = await srcADataUrl(src)
        img.src = dataUrl ?? placeholderLogo(img.alt)
        try { await img.decode() } catch { /* el placeholder cubre el caso de datos corruptos */ }
        if (!img.naturalWidth) { img.src = placeholderLogo(img.alt); try { await img.decode() } catch { /* sin más respaldo */ } }
    }))
}

/**
 * Renderiza el documento en un contenedor offscreen de ancho FIJO y lo
 * convierte en PNG (pixelRatio 2). El fondo se pasa por parámetro: blanco
 * para documentos de impresión, canvas oscuro (#0B1120) para los docs que
 * espejan el modo oscuro de la app (llaves, grupos).
 */
/**
 * Los estilos de los documentos incluyen resets globales (`html,body`,
 * `body`, `*`) pensados para la ventana de impresión, donde el doc vive
 * solo. Al renderizar el PNG offscreen el <style> se inyecta en EL
 * documento vivo: sin este saneo esas reglas filtran a la app y se ve
 * un «salto» de fuentes/tamaños/fondo durante la captura.
 */
function estilosParaPng(css: string): string {
    return css
        .replace(/@page[^}]+\}/g, '')
        .replace(/html\s*,\s*body\s*\{[^}]*\}/g, '')
        .replace(/(^|\})\s*body\s*\{([^}]*)\}/g, '$1.hoja{$2}')
        .replace(/(^|\})\s*\*\s*\{[^}]*\}/g, '$1.hoja,.hoja *{box-sizing:border-box}')
}

export async function descargarPngDeDoc(doc: DocImpresion, anchoPx: number | null, nombreArchivo: string, fondo: string = '#ffffff'): Promise<void> {
    anchoPx = anchoPx ?? doc.anchoSugerido ?? 900
    const contenedor = document.createElement('div')
    contenedor.setAttribute('aria-hidden', 'true')
    contenedor.style.cssText = `position:fixed;left:-20000px;top:0;width:${anchoPx}px;background:${fondo};`
    // El onerror inline oculta el logo si falla; aquí lo gestiona incrustarImagenesComoDataUrl.
    contenedor.innerHTML = `<style>${estilosParaPng(doc.estilos)}</style><div class="hoja">${doc.cuerpo.replace(/\sonerror="[^"]*"/g, '')}</div>`
    document.body.appendChild(contenedor)
    suprimirRuidoCssRules()
    try {
        const objetivo = contenedor.querySelector('.hoja') as HTMLElement
        // Logos y demás imágenes fijados como data URL antes del render.
        await incrustarImagenesComoDataUrl(objetivo)
        const { toPng } = await import('html-to-image')
        const opciones = { backgroundColor: fondo, pixelRatio: 2, skipFonts: true }
        // Pasada de calentamiento (truco conocido de html-to-image: la primera
        // captura a veces sale sin imágenes/estilos en Safari); se descarta.
        await toPng(objetivo, opciones).catch(() => null)
        const dataUrl = await toPng(objetivo, opciones)
        // Las data: URLs no descargan en móvil (iOS Safari bloquea
        // window.open('data:') y Chrome Android ignora `download` con
        // URLs gigantes): convertimos a Blob, que funciona en todas.
        const blob = await (await fetch(dataUrl)).blob()
        descargarBlob(blob, nombreArchivo)
    } finally {
        contenedor.remove()
    }
}
