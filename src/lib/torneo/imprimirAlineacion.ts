'use client'

/**
 * Genera la **Hoja de alineación EN BLANCO** tamaño carta, vertical.
 *
 * Cada hoja es GENÉRICA: no tiene un equipo predefinido. La usan los
 * capitanes para anotar a mano el nombre de su equipo, el capitán, y
 * qué jugador va en cada posición A, B, C (mitad superior) o X, Y, Z
 * (mitad inferior). Después el operador corta la hoja en 2 por la línea
 * de puntos y reparte 1 medio-papel a cada capitán.
 *
 * Layout (vertical, 1 página CARTA por hoja):
 *
 *   ┌──────────────────────────────────┐
 *   │  [logo ATTA]   ATTA Teams  [logo] │   ← cabecera
 *   │       Torneo · Categoría          │
 *   ├──────────────────────────────────┤
 *   │  MITAD SUPERIOR (ABC)            │
 *   │   Etiqueta grande: ABC           │
 *   │   ┌───┬────────────────┬──────┐  │
 *   │   │ A │  Nombre ____   │ ID _ │  │
 *   │   │ B │  Nombre ____   │ ID _ │  │
 *   │   │ C │  Nombre ____   │ ID _ │  │
 *   │   └───┴────────────────┴──────┘  │
 *   │   Nombre equipo: ______          │
 *   │   Capitán: ______  Firma: ______ │
 *   ├ ─ ─ ─ ─ ✂ cortar ─ ─ ─ ─ ─ ─ ─ ─ ┤   ← línea de corte
 *   │  MITAD INFERIOR (XYZ)            │
 *   │   Etiqueta grande: XYZ           │
 *   │   … misma estructura con X, Y, Z │
 *   │   Nombre equipo: ______          │
 *   │   Capitán: ______  Firma: ______ │
 *   ├──────────────────────────────────┤
 *   │  Firma capitán equipo ganador    │
 *   └──────────────────────────────────┘
 *
 * Las hojas se imprimen una por partido (`imprimirAlineacionesBatch` con
 * `cantidadPartidos` = total de partidos de la fase de grupos). Cada
 * partido = 1 página vertical = 2 medios-papeles.
 *
 * NOTA: Solo hay 3 letras (A, B, C / X, Y, Z). Si un equipo tiene más
 * de 3 integrantes, los sobrantes NO juegan esta fase; si tiene menos,
 * uno se queda sin jugar. Independientemente de la modalidad (DOBLES
 * o EQUIPOS) la hoja es la misma: 3 filas por mitad.
 */

import { MATCHUPS_DOBLES, MATCHUPS_EQUIPOS } from './matchups'

const LETRAS_LOCALES = ['A', 'B', 'C'] as const
const LETRAS_VISITANTES = ['X', 'Y', 'Z'] as const

type ModalidadHoja = 'DOBLES' | 'EQUIPOS'

/** Tira informativa con el ORDEN de los partidos de la serie ATTA, para
 *  que el capitán sepa qué posiciones juegan en cada juego. Es solo
 *  referencia visual: no altera el resto de la hoja. */
function bloqueOrdenPartidos(modalidad: ModalidadHoja): string {
    const items = modalidad === 'DOBLES' ? MATCHUPS_DOBLES : MATCHUPS_EQUIPOS
    return `
        <div class="orden-partidos">
            <span class="orden-titulo">Orden:</span>
            ${items.map((m, i) => `<span class="orden-item"><b>${i + 1}</b>${escaparHtml(m.etiqueta)}</span>`).join('')}
        </div>
    `
}

function escaparHtml(texto: string): string {
    return texto.replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c] || c
    ))
}

interface BloqueMitadArgs {
    titulo: 'ABC' | 'XYZ'
    letras: readonly string[]
    modalidad: ModalidadHoja
}

/** Bloque de una mitad: tabla con filas A..C o X..Z + zona nombre/capitán. */
function bloqueMitad({ titulo, letras, modalidad }: BloqueMitadArgs): string {
    const filas = letras.map(letra => `
        <tr>
            <td class="col-pos"><b>${letra}</b></td>
            <td class="col-jug"><span class="linea"></span></td>
            <td class="col-id"><span class="linea"></span></td>
        </tr>
    `).join('')
    return `
        <section class="mitad">
            <div class="mitad-titulo">${titulo}</div>
            <table class="alineacion">
                <thead>
                    <tr>
                        <th class="col-pos"></th>
                        <th class="col-jug">Nombre del jugador</th>
                        <th class="col-id">ID</th>
                    </tr>
                </thead>
                <tbody>${filas}</tbody>
            </table>
            <div class="mitad-info">
                <div class="info-fila">
                    <span class="info-label">Nombre de equipo</span>
                    <span class="info-bloque"></span>
                </div>
                <div class="info-fila">
                    <span class="info-label">Capitán</span>
                    <span class="info-bloque info-corto"></span>
                    <span class="info-label-sec">Firma:</span>
                    <span class="info-bloque info-firma"></span>
                </div>
            </div>
            ${bloqueOrdenPartidos(modalidad)}
        </section>
    `
}

interface BloqueHojaArgs {
    torneo: { nombre: string }
    categoria: string
    modalidad: ModalidadHoja
}

function bloqueHoja({ torneo, categoria, modalidad }: BloqueHojaArgs): string {
    return `
        <section class="page">
            <header class="cabecera">
                <img class="logo logo-izq" src="/logo.jpg" alt="ATTA" onerror="this.style.visibility='hidden'" />
                <div class="cabecera-titulo">
                    <div class="titulo-principal">ATTA Teams</div>
                    <div class="titulo-sub">${escaparHtml(torneo.nombre)} · ${escaparHtml(categoria)}</div>
                </div>
                <img class="logo logo-der" src="/templates/escudo-panama.png" alt="Alcaldía de Panamá" onerror="this.style.visibility='hidden'" />
            </header>
            ${bloqueMitad({ titulo: 'ABC', letras: LETRAS_LOCALES, modalidad })}
            <div class="corte">
                <span class="corte-linea"></span>
                <span class="corte-icono">✂ cortar</span>
                <span class="corte-linea"></span>
            </div>
            ${bloqueMitad({ titulo: 'XYZ', letras: LETRAS_VISITANTES, modalidad })}
            <footer class="pie-firmas">
                <div class="firma-bloque">
                    <div class="firma-linea"></div>
                    <div class="firma-label">Firma del capitán del equipo ganador</div>
                </div>
            </footer>
        </section>
    `
}

const CSS_HOJA = `
    /* Tamaño CARTA vertical (8.5"×11"), márgenes 6mm para que la
     * impresora no recorte nada. Tipografía grande para que el
     * capitán pueda escribir a mano con comodidad. */
    @page{size:letter portrait;margin:6mm}
    html,body{width:8.5in;height:11in;margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,sans-serif;color:#0f172a;margin:0;padding:0}
    .page{width:100%;height:100%;padding:0;display:flex;flex-direction:column;page-break-after:always}
    .page:last-child{page-break-after:auto}
    .cabecera{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border-bottom:2px solid #0f172a}
    .logo{height:60px;object-fit:contain}
    .cabecera-titulo{flex:1;text-align:center}
    .titulo-principal{font-size:24px;font-style:italic;font-weight:bold;letter-spacing:1px}
    .titulo-sub{font-size:12px;color:#475569;margin-top:1px;letter-spacing:.5px}
    .mitad{flex:1;padding:8px 8px 108px;display:flex;flex-direction:column;position:relative;overflow:hidden}
    .mitad-titulo{font-size:36px;font-weight:bold;text-align:center;letter-spacing:6px;color:#0f172a;margin-bottom:4px}
    table.alineacion{width:100%;border-collapse:collapse;margin-bottom:6px}
    table.alineacion th,table.alineacion td{border:1.8px solid #0f172a;padding:0;font-size:14px;vertical-align:middle}
    table.alineacion thead th{background:#f1f5f9;height:22px;text-align:center;font-size:12px;letter-spacing:.5px;font-weight:bold}
    th.col-pos,td.col-pos{width:40px;text-align:center;background:#f8fafc}
    td.col-pos b{font-size:22px;font-weight:bold}
    td.col-jug{padding:4px 8px;min-height:50px}
    td.col-id{width:120px;padding:4px 8px}
    .linea{display:block;width:100%;min-height:42px;border-bottom:2.5px solid #94a3b8;margin:2px 0}
    .mitad-info{display:grid;grid-template-columns:1fr;gap:4px;padding:0 4px}
    .info-fila{display:flex;align-items:center;gap:8px;font-size:13px;color:#334155}
    .info-label{font-weight:bold;color:#0f172a;width:140px;letter-spacing:.5px}
    .info-label-sec{font-weight:bold;color:#0f172a;margin-left:auto;letter-spacing:.5px}
    .info-bloque{flex:1;border-bottom:2px solid #94a3b8;height:24px;margin-left:4px}
    .info-corto{flex:0 1 220px}
    .info-firma{flex:0 0 180px}
    .corte{display:flex;align-items:center;gap:6px;padding:6px 8px;color:#94a3b8}
    .corte-linea{flex:1;border-top:2px dashed #94a3b8}
    .corte-icono{font-size:11px;letter-spacing:1px;font-style:italic;color:#64748b;white-space:nowrap}
    /* Fija al fondo de CADA mitad (no de la página): aunque la tabla
     * desborde, la tira siempre queda visible dentro del área imprimible. */
    /* Lista VERTICAL: un renglón por juego (1 arriba, 5 abajo), que es
     * como la gente lee una secuencia. Anclada al fondo de CADA mitad
     * para que siempre quede visible dentro del área imprimible. */
    .orden-partidos{position:absolute;left:8px;right:8px;bottom:4px;border-top:1.5px dashed #cbd5e1;padding-top:5px;padding-left:6px;padding-right:4px;background:#ffffff}
    .orden-titulo{display:block;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;color:#0f172a;margin-bottom:2px}
    .orden-item{display:flex;align-items:center;font-size:10.5px;font-weight:600;color:#334155;white-space:nowrap;padding:1px 0}
    .orden-item b{flex:0 0 auto;display:inline-block;background:#f1f5f9;border:1.5px solid #0f172a;border-radius:4px;padding:0 4px;margin-right:6px;font-size:9.5px;color:#0f172a;min-width:13px;text-align:center}
    .pie-firmas{padding:6px 8px 4px}
    .firma-bloque{width:60%;margin-left:auto;text-align:center}
    .firma-linea{border-bottom:2px solid #0f172a;height:32px}
    .firma-label{font-size:11px;color:#475569;margin-top:2px;font-style:italic}
    @media print{body{padding:0}}
`

interface ImprimirHojaArgs {
    /** Torneo (para mostrar el nombre en la cabecera). */
    torneo: { nombre: string }
    /** Categoría del torneo (para mostrar en el subtítulo). */
    categoria: string
    /** Modalidad: define el «Orden de partidos» impreso. Default EQUIPOS. */
    modalidad?: ModalidadHoja
}

/**
 * Abre una ventana nueva con UNA hoja de alineación en blanco y lanza
 * el diálogo de impresión. Devuelve `false` si el navegador bloqueó el
 * popup (el caller debe mostrar un toast).
 */
export function imprimirHojaAlineacion(args: ImprimirHojaArgs): boolean {
    const ventana = window.open('', '_blank', 'width=900,height=1200')
    if (!ventana) return false

    ventana.document.write(`<!doctype html><html><head><title>Hoja de alineación · ${escaparHtml(args.torneo.nombre)}</title><style>${CSS_HOJA}</style></head><body>${bloqueHoja({ modalidad: 'EQUIPOS', ...args })}<script>window.onload=()=>window.print()<\/script></body></html>`)
    ventana.document.close()
    return true
}

interface ImprimirAlineacionesBatchArgs {
    torneo: { nombre: string }
    categoria: string
    /** Cantidad de hojas a imprimir (= partidos que necesitan alineación). */
    cantidadPartidos: number
    /** Modalidad: define el «Orden de partidos» impreso. Default EQUIPOS. */
    modalidad?: ModalidadHoja
}

/**
 * Abre una sola ventana con TODAS las hojas de alineación de la fase
 * de grupos. Cada hoja es 1 página vertical (= 1 partido = 2 medios
 * cortables). El operador imprime todo de una sola vez, corta por la
 * línea punteada y reparte 1 medio a cada capitán.
 */
export function imprimirAlineacionesBatch(args: ImprimirAlineacionesBatchArgs): boolean {
    const { torneo, categoria, cantidadPartidos, modalidad = 'EQUIPOS' } = args
    if (cantidadPartidos <= 0) return false

    const paginas = Array.from({ length: cantidadPartidos }, () =>
        bloqueHoja({ torneo, categoria, modalidad })
    ).join('')

    const ventana = window.open('', '_blank', 'width=900,height=1200')
    if (!ventana) return false

    ventana.document.write(`<!doctype html><html><head><title>Hojas de alineación · ${escaparHtml(torneo.nombre)}</title><style>${CSS_HOJA}</style></head><body>${paginas}<script>window.onload=()=>window.print()<\/script></body></html>`)
    ventana.document.close()
    return true
}
