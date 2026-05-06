import { NextResponse } from 'next/server'
import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'
import { existsSync } from 'fs'

export async function POST(req: Request) {
    try {
        const { jugadores, categoriaNombre, mesAnio, bgBase64 } = await req.json()
        const isProduction = process.env.NODE_ENV === 'production'

        let executablePath: string
        if (isProduction) {
            executablePath = await chromium.executablePath()
        } else {
            const chromeMacPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
            executablePath = existsSync(chromeMacPath) ? chromeMacPath : (process.env.CHROMIUM_PATH || '')
        }

        const browser = await puppeteer.launch({
            args: isProduction ? chromium.args : ['--no-sandbox', '--disable-setuid-sandbox'],
            defaultViewport: { width: 794, height: 1123, deviceScaleFactor: 1 },
            executablePath: executablePath,
            headless: isProduction ? chromium.headless : true,
        })

        const page = await browser.newPage()

        // --- Paginación manual ---
        // Página 1: menos filas porque el header gráfico ocupa espacio
        // Páginas siguientes: más filas porque arrancan directo con la tabla
        const ROWS_FIRST_PAGE = 16
        const ROWS_OTHER_PAGES = 24

        const pages: (typeof jugadores)[] = []
        pages.push(jugadores.slice(0, ROWS_FIRST_PAGE))
        let i = ROWS_FIRST_PAGE
        while (i < jugadores.length) {
            pages.push(jugadores.slice(i, i + ROWS_OTHER_PAGES))
            i += ROWS_OTHER_PAGES
        }

        // Genera el HTML de la tabla para un bloque de jugadores
        const tableRows = (rows: typeof jugadores, startIndex: number) =>
            rows.map((j: any, idx: number) => `
                <tr>
                    <td class="rank">${startIndex + idx + 1}</td>
                    <td>${j.nombre}</td>
                    <td class="pts">${j.elo}</td>
                    <td>${j.clubes?.nombre || '---'}</td>
                </tr>
            `).join('')

        // Genera cada página como un div de exactamente A4 (794×1123px)
        // con la imagen de fondo embebida directamente — sin position:fixed,
        // sin @page, sin headerTemplate. Cada div ES una página.
        const pagesDivs = pages.map((rows, pageIdx) => {
            const isFirst = pageIdx === 0
            const startIndex = pageIdx === 0 ? 0 : ROWS_FIRST_PAGE + (pageIdx - 1) * ROWS_OTHER_PAGES

            return `
            <div class="pdf-page">
                <div class="bg">
                    <img src="${bgBase64}" alt="" />
                </div>
                <div class="page-content ${isFirst ? 'first-page' : 'other-page'}">
                    ${isFirst ? `
                        <div class="page-header">
                            <h1>Ranking Oficial - ${categoriaNombre}</h1>
                            <div class="subtitle">${mesAnio}</div>
                        </div>
                    ` : ''}
                    <div class="table-container">
                        <table class="ranking-table">
                            <thead>
                                <tr>
                                    <th>Pos</th>
                                    <th>Nombre</th>
                                    <th>Puntos</th>
                                    <th>Club</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tableRows(rows, startIndex)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            `
        }).join('')

        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Helvetica', sans-serif;
            background: #000;
        }

        /* Cada .pdf-page es exactamente una hoja A4 en píxeles (96dpi) */
        .pdf-page {
            position: relative;
            width: 794px;
            height: 1123px;
            overflow: hidden;
            page-break-after: always;
        }

        /* Fondo: cubre todo el div de la página */
        .bg {
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            z-index: 0;
        }
        .bg img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }

        /* Contenido encima del fondo */
        .page-content {
            position: relative;
            z-index: 1;
            color: white;
            height: 100%;
            display: flex;
            flex-direction: column;
        }

        /* Primera página: padding-top para esquivar el logo */
        .first-page {
            padding-top: 310px;
            padding-bottom: 40px;
        }

        /* Páginas siguientes: margen superior e inferior simétrico */
        .other-page {
            padding-top: 40px;
            padding-bottom: 40px;
        }

        .page-header {
            text-align: center;
            margin-bottom: 20px;
        }

        h1 {
            font-size: 22px;
            text-transform: uppercase;
            letter-spacing: 2px;
        }

        .subtitle {
            font-size: 14px;
            opacity: 0.85;
            margin-top: 4px;
        }

        .table-container {
            padding: 0 36px;
            flex: 1;
        }

        .ranking-table {
            width: 100%;
            border-collapse: collapse;
            background: rgba(0, 0, 0, 0.45);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 10px;
            overflow: hidden;
        }

        thead {
            background: rgba(255,255,255,0.15);
        }

        th {
            padding: 12px 14px;
            text-align: left;
            font-size: 12px;
            text-transform: uppercase;
            border-bottom: 1px solid rgba(255,255,255,0.2);
        }

        td {
            padding: 9px 14px;
            border-bottom: 1px solid rgba(255,255,255,0.05);
            font-size: 13px;
        }

        tr:last-child td { border-bottom: none; }

        .rank {
            font-weight: bold;
            color: #fbbf24;
            width: 45px;
        }

        .pts { font-weight: 600; }
    </style>
</head>
<body>
    ${pagesDivs}
</body>
</html>
        `

        await page.setContent(htmlContent, { waitUntil: 'networkidle0' })

        const pdf = await page.pdf({
            width: '794px',
            height: '1123px',
            printBackground: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
        })

        await browser.close()

        return new NextResponse(pdf, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename=Ranking_${categoriaNombre.replace(/\s+/g, '_')}.pdf`,
            },
        })

    } catch (error: any) {
        console.error('Puppeteer Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}