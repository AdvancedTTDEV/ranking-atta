/**
 * Marca las 8 migraciones como aplicadas en la BD a la que apunta .env
 * (debe ser HOPPER / dev, NO caboose / prod).
 *
 * Uso:
 *   node scripts/mark-migrations-applied.js
 *
 * ⚠ El script aborta si DATABASE_URL contiene "caboose" (caboose = prod).
 *   El commit 1772b7c en main ya marcó las 8 migraciones como aplicadas
 *   en prod manualmente; no se debe correr dos veces allá.
 *
 * Por qué existe: el build de Vercel Preview corre
 *   prisma migrate deploy && next build
 * Si el _prisma_migrations de hopper no tiene las 8 filas, prisma intenta
 * aplicar la migración 20260820130000_atta_teams y falla con
 *   Error: The values [ATTA_TEAMS] for the enum modalidad are already in use
 * porque el esquema actual de hopper ya tiene esa columna con ese enum,
 * pero el historial de migraciones está desincronizado.
 *
 * Solución: INSERT IGNORE en _prisma_migrations con el nombre y el
 * checksum de cada migración. Es idempotente.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { PrismaClient } = require('@prisma/client')

if (!process.env.DATABASE_URL) {
    const envPath = path.join(__dirname, '..', '.env')
    if (fs.existsSync(envPath)) {
        for (const linea of fs.readFileSync(envPath, 'utf8').split('\n')) {
            const m = linea.match(/^\s*DATABASE_URL\s*=\s*"?(.+?)"?\s*$/)
            if (m && !process.env.DATABASE_URL) process.env.DATABASE_URL = m[1]
        }
    }
}
if (!process.env.DATABASE_URL) {
    console.error('Sin DATABASE_URL en el entorno ni en .env')
    process.exit(1)
}
if (/caboose/i.test(process.env.DATABASE_URL)) {
    console.error('La URL apunta a PRODUCCIÓN (caboose). Abortado por seguridad.')
    console.error('Este script es para HOPPER (dev) solamente.')
    process.exit(1)
}
console.log('BD objetivo:', process.env.DATABASE_URL.replace(/\/\/[^@]*@/, '//***@'))

const MIGRATIONS_DIR = path.join(__dirname, '..', 'prisma', 'migrations')

/** Calcula el checksum Prisma del SQL de una migración. El algoritmo
 *  que usa Prisma es sha256 sobre el contenido del archivo de migración. */
function checksumDeMigracion(migrationName) {
    const dir = path.join(MIGRATIONS_DIR, migrationName)
    const sql = fs.readFileSync(path.join(dir, 'migration.sql'), 'utf8')
    return crypto.createHash('sha256').update(sql).digest('hex')
}

async function main() {
    const dirs = fs.readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
        .sort()

    const prisma = new PrismaClient()
    try {
        // Comprobar que la tabla existe. prisma migrate deploy la crea
        // la primera vez; si no existe, fallamos con un mensaje claro.
        const existe = await prisma.$queryRawUnsafe(
            "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_NAME = '_prisma_migrations'"
        )
        if (!Array.isArray(existe) || existe.length === 0) {
            console.error('La tabla _prisma_migrations no existe. Corre primero `prisma migrate deploy` una vez para que Prisma la cree.')
            process.exit(1)
        }

        let aplicadas = 0
        let yaExistian = 0
        for (const name of dirs) {
            const checksum = checksumDeMigracion(name)
            // INSERT IGNORE en MySQL omite filas que violan el PRIMARY KEY
            // o UNIQUE; _prisma_migrations tiene UNIQUE(migration_name).
            const result = await prisma.$executeRawUnsafe(
                `INSERT IGNORE INTO _prisma_migrations
                    (id, checksum, finished_at, migration_name, logs,
                     rolled_back_at, started_at, applied_steps_count)
                 VALUES (?, ?, NOW(), ?, NULL, NULL, NOW(), 1)`,
                crypto.randomUUID().replace(/-/g, ''),
                checksum,
                name
            )
            if (result === 1) {
                console.log(`  + ${name}  (registrada)`)
                aplicadas++
            } else {
                console.log(`  = ${name}  (ya estaba)`)
                yaExistian++
            }
        }

        console.log(`\nListo. ${aplicadas} registradas, ${yaExistian} ya estaban.`)
    } finally {
        await prisma.$disconnect()
    }
}

main().catch(err => {
    console.error('Error:', err.message)
    process.exit(1)
})
