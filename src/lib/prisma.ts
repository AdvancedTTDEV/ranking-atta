import { PrismaClient } from '@prisma/client'

// Nota: antes había un middleware $use que forzaba `collation_connection`
// en cada query raw. Desde la actualización de Prisma (6.19) ese API ya no
// existe en runtime, así que el fix de collation vive dentro de los stored
// procedures (ver fix_revertir_partido.sql: SET collation_connection +
// COLLATE explícito en cada comparación contra ENUM).
const prismaClientSingleton = () => new PrismaClient()

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prisma ?? prismaClientSingleton()

if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma

// Add connection health check
prisma.$connect()
  .then(() => console.log('✅ Database connected'))
  .catch((err: unknown) => console.error('❌ Database connection error:', err))

export default prisma
