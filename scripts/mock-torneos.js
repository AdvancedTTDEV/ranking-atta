/**
 * Datos de prueba para el flujo de torneos. SOLO contra la BD de
 * desarrollo (hopper). Aborta si la URL apunta a producción (caboose).
 *
 *  1) Crea un torneo INDIVIDUAL completo: 24 jugadores mock, 4 grupos
 *     (serpentina por ELO) y todos los cruces round-robin pendientes.
 *     Sin llaves: se generan vacías solas al abrir el modal.
 *
 *  2) Al torneo ATTA_TEAMS más reciente le inscribe 14 equipos mock de
 *     3 jugadores con series mixtas válidas (regla ATTA), bajo la
 *     categoría ancla "primera". NO crea grupos ni partidos ni llaves:
 *     ese flujo se prueba a mano desde cero.
 */
const fs = require('fs')
const path = require('path')

// ── Cargar DATABASE_URL del .env (un script node no lo lee solo) ──
if (!process.env.DATABASE_URL) {
    const envPath = path.join(__dirname, '..', '.env')
    if (fs.existsSync(envPath)) {
        for (const linea of fs.readFileSync(envPath, 'utf8').split('\n')) {
            const m = linea.match(/^\s*DATABASE_URL\s*=\s*"?(.+?)"?\s*$/)
            if (m && !process.env.DATABASE_URL) process.env.DATABASE_URL = m[1]
        }
    }
}
if (!process.env.DATABASE_URL) throw new Error('Sin DATABASE_URL en el entorno ni en .env')
if (/caboose/i.test(process.env.DATABASE_URL)) {
    throw new Error('La URL apunta a PRODUCCIÓN (caboose). Abortado por seguridad.')
}
console.log('BD objetivo:', process.env.DATABASE_URL.replace(/\/\/[^@]*@/, '//***@'))

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// ── Nombres ficticios (nada parecido a los reales) ──
const NOMBRES = [
    'Adalberto Montenegro', 'Berenice Solís', 'Camilo Zeballos', 'Dalia Escobar',
    'Efraín Bustamante', 'Fabiola Quintero', 'Gerardo Villalaz', 'Helena Mendieta',
    'Ismael Carvajal', 'Jacqueline Ordóñez', 'Kendall Palacios', 'Lucinda Ferrer',
    'Marlon Aguilera', 'Nidia Castrellón', 'Osvaldo Tejada', 'Priscila Barrios',
    'Quirino Saldaña', 'Rosaura Ibáñez', 'Salvador Pineda', 'Teodora Valdés',
    'Ulises Madrigal', 'Verónica Estrada', 'Wenceslao Ríos', 'Ximena Delgado',
    'Yolanda Peralta', 'Zacarías Fuentes', 'Aurelio Cisneros', 'Blanca Ledesma',
    'Casimiro Robles', 'Dulce María Anaya', 'Emiliano Zarate', 'Fernanda Ocampo',
    'Gustavo Adolfo Peña', 'Hortensia Silva', 'Ignacio Bernal', 'Josefa Lara',
    'Kirby Andrade', 'Leandro Muñoz', 'Mireya Campos', 'Norberto Gallegos',
    'Ofelia Cedeño', 'Pancho Villa-Rivas', 'Ramona Iglesias', 'Sergio Tuñón',
]

async function main() {
    const categorias = await prisma.categorias.findMany()
    const catPorNombre = Object.fromEntries(categorias.map(c => [c.nombre, c]))
    const primera = catPorNombre['primera']
    const segunda = catPorNombre['segunda']
    const tercera = catPorNombre['tercera']
    const cuarta = catPorNombre['cuarta']
    if (!primera || !segunda || !tercera || !cuarta) throw new Error('Faltan las 4 categorías en la BD')

    const clubes = await prisma.clubes.findMany({ orderBy: { id: 'asc' } })
    if (clubes.length < 2) throw new Error('Se necesitan al menos 2 clubes existentes')

    let cursorNombres = 0
    const siguienteNombre = () => NOMBRES[cursorNombres++ % NOMBRES.length]

    async function crearJugador(clubIdx, categoriaId, elo) {
        return prisma.jugadores.create({
            data: {
                nombre: siguienteNombre(),
                elo,
                club_id: clubes[clubIdx % clubes.length].id,
                categoria_id: categoriaId,
            }
        })
    }

    // ═══════════════════════════════════════════════════════════
    // 1) TORNEO INDIVIDUAL COMPLETO
    // ═══════════════════════════════════════════════════════════
    const individualesPrevios = await prisma.torneos.findMany({ where: { nombre: { startsWith: 'Mock ·' } }, select: { id: true } })
    for (const t of individualesPrevios) await prisma.torneos.delete({ where: { id: t.id } })

    const torneoInd = await prisma.torneos.create({
        data: {
            nombre: 'Mock · Copa Individual de Prueba',
            fecha: new Date(),
            ubicacion: 'Gimnasio Mock',
            modalidad: 'INDIVIDUAL',
            abierto: false,
        }
    })
    await prisma.torneo_categorias.create({ data: { torneo_id: torneoInd.id, categoria_id: primera.id } })

    // 24 jugadores todos "primera", ELO descendente con ruido
    const jugadoresInd = []
    for (let i = 0; i < 24; i++) {
        const elo = 1980 - i * 22 + ((i * 7) % 11)
        const j = await crearJugador(i, primera.id, elo)
        jugadoresInd.push(j)
    }
    const participantesInd = []
    for (let i = 0; i < jugadoresInd.length; i++) {
        const tp = await prisma.torneo_participantes.create({
            data: { torneo_id: torneoInd.id, jugador_id: jugadoresInd[i].id, categoria_id: primera.id, seed: i + 1 }
        })
        participantesInd.push(tp)
    }

    // 4 grupos, serpentina por ELO
    const G = 4
    const ordenados = [...participantesInd] // ya quedaron creados en orden de ELO desc
    const filas = Array.from({ length: G }, () => [])
    ordenados.forEach((tp, i) => {
        const ronda = Math.floor(i / G)
        let col = i % G
        if (ronda % 2 === 1) col = G - 1 - col
        filas[col].push(tp)
    })
    const gruposInd = []
    for (let g = 0; g < G; g++) {
        const grupo = await prisma.torneo_grupos.create({
            data: { torneo_id: torneoInd.id, categoria_id: primera.id, numero_grupo: g + 1 }
        })
        gruposInd.push(grupo)
        for (let pos = 0; pos < filas[g].length; pos++) {
            await prisma.torneo_grupo_participantes.create({
                data: { grupo_id: grupo.id, torneo_participante_id: filas[g][pos].id, posicion: pos + 1 }
            })
        }
    }

    // Round-robin dentro de cada grupo, todo pendiente
    let cruces = 0
    for (let g = 0; g < G; g++) {
        const fila = filas[g]
        let orden = 1
        for (let i = 0; i < fila.length; i++) {
            for (let jx = i + 1; jx < fila.length; jx++) {
                await prisma.torneo_partidos_programados.create({
                    data: {
                        torneo_id: torneoInd.id,
                        categoria_id: primera.id,
                        grupo_id: gruposInd[g].id,
                        participante_local_id: fila[i].id,
                        participante_visitante_id: fila[jx].id,
                        orden,
                        fase: 'GRUPOS',
                        estado: 'PENDIENTE',
                    }
                })
                orden++
                cruces++
            }
        }
    }
    console.log(`✔ Torneo individual "${torneoInd.nombre}" (id ${torneoInd.id}): 24 jugadores, ${G} grupos, ${cruces} partidos pendientes`)

    // ═══════════════════════════════════════════════════════════
    // 2) ATTA TEAMS: equipos mock hasta inscripción
    // ═══════════════════════════════════════════════════════════
    let atta = await prisma.torneos.findFirst({
        where: { modalidad: 'ATTA_TEAMS' },
        orderBy: { id: 'desc' },
    })
    if (!atta) {
        atta = await prisma.torneos.create({
            data: {
                nombre: 'Mock · Torneo ATTA Teams',
                fecha: new Date(),
                ubicacion: 'Gimnasio Mock',
                modalidad: 'ATTA_TEAMS',
                abierto: false,
            }
        })
        await prisma.torneo_categorias.create({ data: { torneo_id: atta.id, categoria_id: primera.id } })
        console.log(`ℹ No había torneo ATTA Teams; creé "${atta.nombre}" (id ${atta.id})`)
    } else {
        // Limpieza: dejamos el torneo solo con inscripción nueva (borra
        // participantes/grupos/partidos previos vía cascadas).
        await prisma.torneo_partidos_programados.deleteMany({ where: { torneo_id: atta.id } })
        await prisma.torneo_grupos.deleteMany({ where: { torneo_id: atta.id } })
        await prisma.torneo_participantes.deleteMany({ where: { torneo_id: atta.id } })
    }

    // Series válidas según regla ATTA: (≤1 primera y ≤1 segunda) o
    // (0 primera y ≤2 segunda); resto 3ra/4ta. Rotamos patrones.
    const patrones = [
        ['primera', 'segunda', 'tercera'],
        ['primera', 'cuarta', 'tercera'],
        ['segunda', 'segunda', 'tercera'],
        ['segunda', 'tercera', 'cuarta'],
        ['primera', 'tercera', 'cuarta'],
        ['tercera', 'tercera', 'cuarta'],
        ['segunda', 'cuarta', 'tercera'],
    ]
    const ELO_SERIE = { primera: 1900, segunda: 1700, tercera: 1500, cuarta: 1300 }

    const TOTAL_EQUIPOS = 14
    let equiposCreados = 0
    for (let e = 0; e < TOTAL_EQUIPOS; e++) {
        const patron = patrones[e % patrones.length]
        const miembros = []
        for (let m = 0; m < patron.length; m++) {
            const catId = catPorNombre[patron[m]].id
            const jugador = await crearJugador(e + m + 1, catId, ELO_SERIE[patron[m]] - ((e * 3 + m * 5) % 40))
            miembros.push(jugador)
        }
        const tp = await prisma.torneo_participantes.create({
            data: {
                torneo_id: atta.id,
                jugador_id: miembros[0].id, // representante (compatibilidad)
                categoria_id: primera.id,   // ancla ATTA Teams
            }
        })
        for (let m = 0; m < miembros.length; m++) {
            await prisma.torneo_participante_miembros.create({
                data: { torneo_participante_id: tp.id, jugador_id: miembros[m].id, orden: m + 1 }
            })
        }
        equiposCreados++
    }
    console.log(`✔ Torneo ATTA Teams "${atta.nombre}" (id ${atta.id}): ${equiposCreados} equipos inscriptos (sin grupos ni llaves)`)
}

main()
    .catch(e => { console.error('ERROR:', e.message); process.exitCode = 1 })
    .finally(() => prisma.$disconnect())
