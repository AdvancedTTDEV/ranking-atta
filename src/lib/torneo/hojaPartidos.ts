'use client'

/**
 * **Hoja de partidos** — documento carta vertical (mismo formato que la
 * hoja de encuentros impresa) con los juegos a disputar de un encuentro:
 * etiqueta del cruce («A vs X», «B+C vs Y+Z»), nombres reales por lado,
 * casillas de sets LLENABLES A MANO (Set 1..5 + total, dos líneas por
 * casilla: arriba ABC / abajo XYZ) y el árbitro con su equipo.
 *
 * Dos fuentes de alineación según el contexto:
 *  - Wizard: la asignación ABC/XYZ del estado actual (`LetrasHoja` armada ahí).
 *  - Lista del grupo: derivada de los `detalles[].jugadores` ya guardados
 *    en BD con `alineacionDesdeDetalles` (convención LOCAL = ABC, igual a
 *    como el wizard relee las alineaciones guardadas).
 */
import { abrirImpresion, type DocImpresion } from '@/lib/documentos-torneo'
import {
    MATCHUPS_DOBLES, MATCHUPS_EQUIPOS,
    type LetraLocal, type LetraVisitante,
} from './matchups'

export interface JugadorHoja { id: number; nombre: string }

/** Alineación resuelta: jugador por letra en cada lado. */
export interface LetrasHoja {
    abc: Partial<Record<LetraLocal, JugadorHoja>>
    xyz: Partial<Record<LetraVisitante, JugadorHoja>>
}

export interface ArbitroHoja { nombre: string; equipo: string | null }

export interface HojaPartidosParams {
    torneoNombre: string
    categoria: string
    modalidad: 'DOBLES' | 'EQUIPOS'
    /** Orden del encuentro dentro del grupo (para "Encuentro #N"). */
    encuentroOrden?: number
    nombreEquipoAbc: string
    nombreEquipoXyz: string
    alineacion: LetrasHoja
    arbitro?: ArbitroHoja | null
}

const escaparHtml = (texto: string) =>
    texto.replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c] || c
    ))

interface DetalleAlineacion {
    orden: number
    tipo: 'DOBLES' | 'INDIVIDUAL'
    jugadores: { jugador_id: number; lado: 'LOCAL' | 'VISITANTE'; orden: number; jugadores: { id: number; nombre: string } }[]
}

/**
 * Deriva la alineación por letras desde los detalles YA GUARDADOS de un
 * partido. Cada detalle corresponde al matchup de su posición (orden),
 * y los jugadores de cada lado, ordenados, se zippean con las letras del
 * cruce. Convención: lado LOCAL del partido = equipo ABC.
 */
export function alineacionDesdeDetalles(
    detalles: DetalleAlineacion[],
    modalidad: 'DOBLES' | 'EQUIPOS',
): LetrasHoja | null {
    const matchups = modalidad === 'DOBLES' ? MATCHUPS_DOBLES : MATCHUPS_EQUIPOS
    const abc: LetrasHoja['abc'] = {}
    const xyz: LetrasHoja['xyz'] = {}
    let hayAlguno = false

    const relevantes = (modalidad === 'DOBLES'
        ? detalles.filter(d => d.tipo === 'DOBLES')
        : detalles.slice().sort((a, b) => a.orden - b.orden))

    relevantes.forEach((detalle, idx) => {
        const matchup = matchups[idx]
        if (!matchup) return
        const letrasLoc = Array.isArray(matchup.cruces.local) ? matchup.cruces.local : [matchup.cruces.local]
        const letrasVis = Array.isArray(matchup.cruces.visitante) ? matchup.cruces.visitante : [matchup.cruces.visitante]
        const locales = detalle.jugadores.filter(j => j.lado === 'LOCAL').sort((a, b) => a.orden - b.orden)
        const visitas = detalle.jugadores.filter(j => j.lado === 'VISITANTE').sort((a, b) => a.orden - b.orden)
        letrasLoc.forEach((letra, i) => {
            const jp = locales[i]
            if (!jp) return
            abc[letra] = { id: jp.jugador_id || jp.jugadores.id, nombre: jp.jugadores.nombre }
            hayAlguno = true
        })
        letrasVis.forEach((letra, i) => {
            const jp = visitas[i]
            if (!jp) return
            xyz[letra] = { id: jp.jugador_id || jp.jugadores.id, nombre: jp.jugadores.nombre }
            hayAlguno = true
        })
    })

    return hayAlguno ? { abc, xyz } : null
}

/** Casilla de set llenable a mano: dos líneas apiladas (ABC arriba, XYZ abajo). */
function celdaSets(claseExtra = ''): string {
    const slot = (tag: string) => `
        <div class="slot">
            <i>${tag}</i>
            <span class="linea"></span>
        </div>`
    return `<td class="col-set ${claseExtra}">${slot('A')}${slot('X')}</td>`
}

export function construirDocHojaPartidos({
    torneoNombre, categoria, modalidad, encuentroOrden, nombreEquipoAbc, nombreEquipoXyz, alineacion, arbitro,
}: HojaPartidosParams): DocImpresion {
    const matchups = modalidad === 'DOBLES' ? MATCHUPS_DOBLES : MATCHUPS_EQUIPOS

    const listaLado = (
        letras: readonly string[],
        pool: Partial<Record<string, JugadorHoja>>,
    ) => `<ul class="jugadores">${letras.map(letra => {
        const j = pool[letra]
        return `<li>
            <span class="letra">${escaparHtml(letra)}</span>
            <span class="nom-jug">${j ? escaparHtml(j.nombre) : '—'}</span>
        </li>`
    }).join('')}</ul>`

    const filasJuegos = matchups.map((m, idxM) => {
        const letrasLoc = Array.isArray(m.cruces.local) ? m.cruces.local : [m.cruces.local]
        const letrasVis = Array.isArray(m.cruces.visitante) ? m.cruces.visitante : [m.cruces.visitante]
        return `<tr>
            <td class="col-num">${idxM + 1}</td>
            <td class="col-cruce">
                <span class="tipo">${m.tipo === 'DOBLES' ? 'Dobles' : 'Individual'}</span>
                <b>${escaparHtml(m.etiqueta)}</b>
            </td>
            <td class="col-lado">${listaLado(letrasLoc as readonly string[], alineacion.abc)}</td>
            <td class="col-lado">${listaLado(letrasVis as readonly string[], alineacion.xyz)}</td>
            ${celdaSets()}${celdaSets()}${celdaSets()}${celdaSets()}${celdaSets()}
            ${celdaSets('col-total')}
        </tr>`
    }).join('')

    const bloqueArbitro = arbitro?.nombre?.trim()
        ? `Árbitro: <b>${escaparHtml(arbitro.nombre)}</b>${
            arbitro.equipo ? ` <span class="de">· de ${escaparHtml(arbitro.equipo)}</span>` : ''}`
        : 'Árbitro: <span class="linea-arbitro"></span>'

    return {
        titulo: `Hoja de partidos · ${nombreEquipoAbc} vs ${nombreEquipoXyz}`,
        estilos: `
            @page{size:letter portrait;margin:8mm}
            *{box-sizing:border-box}
            html,body{margin:0;padding:0;background:#ffffff}
            body{font-family:Arial,sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased}
            /* Tamaño carta exacto: 850×1100 px = 8.5×11 pulgadas (100 px/in),
               capturado a pixelRatio 2 → PNG 1700×2200 (200 DPI).
               Al IMPRIMIR, el papel manda: la hoja se vuelve fluida para
               que quepa en carta con los márgenes de @page. */
            .hoja{background:#ffffff;padding:36px 42px;width:850px;height:1100px;display:flex;flex-direction:column}
            @media print{.hoja{width:100%;height:auto;padding:0}}
            .cabecera{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:4px 8px 10px;border-bottom:2.5px solid #0f172a}
            .logo{height:58px;object-fit:contain}
            .titulo-central{flex:1;text-align:center}
            .titulo-principal{font-size:26px;font-weight:bold;font-style:italic;letter-spacing:1px;line-height:1.05}
            .titulo-sub{font-size:11.5px;color:#475569;margin-top:2px;letter-spacing:.5px}
            .encuentro-linea{display:flex;align-items:center;justify-content:center;gap:9px;margin-top:12px;font-size:16px}
            .equipo-nombre{font-weight:bold}
            .equipo-chip{display:inline-block;border:2px solid #0f172a;border-radius:6px;padding:1px 7px;font-size:11px;font-weight:bold;letter-spacing:1px;background:#f1f5f9}
            .equipo-chip.xyz{background:#fef3c7}
            .vs{color:#64748b;font-family:'Courier New',monospace;font-weight:bold}
            .serie{margin-top:12px;page-break-inside:avoid}
            .serie-head{display:flex;align-items:center;justify-content:space-between;gap:10px;border:2.5px solid #0f172a;padding:6px 12px;background:#f8fafc}
            .serie-titulo{font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#334155}
            .serie-arbitro{font-size:14px;color:#334155}
            .serie-arbitro b{color:#0f172a;font-size:15px}
            .serie-arbitro .de{color:#64748b;font-style:italic;font-size:13px}
            .linea-arbitro{display:inline-block;width:150px;border-bottom:2px solid #94a3b8;height:13px}
            table.juegos{width:100%;border-collapse:collapse}
            table.juegos th,table.juegos td{border:2px solid #0f172a;padding:6px 8px;vertical-align:middle}
            table.juegos thead th{background:#f1f5f9;text-align:center;font-size:11px;letter-spacing:.4px;text-transform:uppercase;color:#0f172a}
            th.col-num,td.col-num{width:30px;text-align:center;background:#f8fafc;font-weight:bold;font-size:17px}
            th.col-cruce,td.col-cruce{width:104px;text-align:center;background:#f8fafc}
            td.col-cruce .tipo{display:block;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.7px;margin-bottom:1px}
            td.col-cruce b{font-family:'Courier New',monospace;font-size:13px}
            td.col-lado ul.jugadores{list-style:none;margin:0;padding:0}
            td.col-lado li{display:flex;align-items:center;gap:6px;padding:2px 0}
            td.col-lado li+li{border-top:1px dashed #cbd5e1}
            .letra{flex:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border:1.5px solid #0f172a;border-radius:5px;font-weight:bold;font-size:12px;background:#ffffff}
            .nom-jug{font-size:13px;font-weight:600;line-height:1.25}
            th.col-set{width:66px;background:#eef2f7}
            th.col-total{width:74px;background:#eef2f7}
            td.col-set{padding:6px 7px}
            td.col-set .slot{display:flex;align-items:flex-end;gap:5px;margin:7px 0}
            td.col-set .slot i{flex:none;width:14px;font-style:normal;font-size:10px;font-weight:bold;color:#94a3b8;text-align:center;padding-bottom:2px}
            td.col-set .slot .linea{flex:1;border-bottom:2.5px solid #94a3b8;height:34px}
            td.col-total{background:#f8fafc}
            td.col-total .slot i{color:#334155;width:16px}
            td.col-total .slot .linea{height:36px}
            tfoot td{background:#eef2f7;border-top:2.5px solid #0f172a}
            tfoot .serie-total-label{text-align:right;font-size:11px;font-weight:bold;letter-spacing:.8px;text-transform:uppercase;color:#334155}
            .leyenda-sets{margin-top:6px;font-size:10.5px;color:#64748b;font-style:italic;text-align:right}
            .pie-nota{margin-top:10px;font-size:12px;color:#475569;text-align:right;font-style:italic;padding:0 6px}
            .pie-nota b{color:#0f172a}
            /* En página carta fija, las firmas se anclan al pie de la hoja. */
            .pie-firmas{margin-top:auto;padding-top:28px;display:flex;justify-content:flex-end;gap:34px;padding-left:6px;padding-right:6px}
            .firma-bloque{width:36%;text-align:center}
            .firma-linea{border-bottom:2px solid #0f172a;height:30px}
            .firma-label{font-size:11px;color:#475569;margin-top:3px;font-style:italic}
        `,
        cuerpo: `
            <header class="cabecera">
                <img class="logo" src="/logo.jpg" alt="ATTA" onerror="this.style.visibility='hidden'" />
                <div class="titulo-central">
                    <div class="titulo-principal">ATTA Teams</div>
                    <div class="titulo-sub">${escaparHtml(torneoNombre)} · ${escaparHtml(categoria)}${modalidad === 'DOBLES' ? ' · Dobles' : ''}</div>
                </div>
                <img class="logo" src="/templates/escudo-panama.png" alt="Alcaldía de Panamá" onerror="this.style.visibility='hidden'" />
            </header>
            <div class="encuentro-linea">
                <span class="equipo-chip">ABC</span><span class="equipo-nombre">${escaparHtml(nombreEquipoAbc)}</span>
                <span class="vs">vs</span>
                <span class="equipo-nombre">${escaparHtml(nombreEquipoXyz)}</span><span class="equipo-chip xyz">XYZ</span>
            </div>
            <section class="serie">
                <div class="serie-head">
                    <span class="serie-titulo">${encuentroOrden != null ? `Encuentro #${encuentroOrden}` : 'Serie'} · ${matchups.length} juego${matchups.length === 1 ? '' : 's'}</span>
                    <span class="serie-arbitro">${bloqueArbitro}</span>
                </div>
                <table class="juegos">
                    <thead>
                        <tr>
                            <th class="col-num">#</th>
                            <th class="col-cruce">Juego</th>
                            <th class="col-lado">ABC · ${escaparHtml(nombreEquipoAbc)}</th>
                            <th class="col-lado">XYZ · ${escaparHtml(nombreEquipoXyz)}</th>
                            <th class="col-set">S1</th><th class="col-set">S2</th><th class="col-set">S3</th><th class="col-set">S4</th><th class="col-set">S5</th>
                            <th class="col-total">Sets</th>
                        </tr>
                    </thead>
                    <tbody>${filasJuegos}</tbody>
                    <tfoot>
                        <tr>
                            <td colspan="9" class="serie-total-label">Juegos ganados · serie ABC / XYZ</td>
                            ${celdaSets('col-total')}
                        </tr>
                    </tfoot>
                </table>
                <div class="leyenda-sets">En cada casilla anota arriba los puntos de ABC y abajo los de XYZ.</div>
            </section>
            <div class="pie-nota">Los juegos se juegan en el orden listado. Anota los puntos de cada set con formato <b>ABC / XYZ</b>.</div>
            <footer class="pie-firmas">
                <div class="firma-bloque">
                    <div class="firma-linea"></div>
                    <div class="firma-label">Firma del árbitro</div>
                </div>
                <div class="firma-bloque">
                    <div class="firma-linea"></div>
                    <div class="firma-label">Firma del capitán del equipo ganador</div>
                </div>
            </footer>
        `,
    }
}

/** Abre el diálogo de impresión del navegador con la hoja (carta
 *  vertical; desde ahí también se puede guardar como PDF). Devuelve
 *  false si el navegador bloqueó la ventana emergente. */
export function imprimirHojaPartidos(params: HojaPartidosParams): boolean {
    return abrirImpresion(construirDocHojaPartidos(params))
}
