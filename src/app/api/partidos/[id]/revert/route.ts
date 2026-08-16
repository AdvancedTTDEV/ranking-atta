import prisma from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST(
    request: Request,
    context: { params: Promise<{ id: string }> }
) {
    try {
        // Await the params to get the actual values
        const params = await context.params
        const partidoId = parseInt(params.id)

        if (isNaN(partidoId)) {
            return NextResponse.json(
                { error: 'ID inválido' },
                { status: 400 }
            )
        }

        // Forzamos la collation de la sesión a la del ENUM de la tabla
        // para que las comparaciones internas del SP (ronda_alcanzada = v_ronda)
        // no mezclen utf8mb4_unicode_ci con utf8mb4_0900_ai_ci.
        await prisma.$executeRawUnsafe(`SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;`)

        await prisma.$executeRawUnsafe(`
      CALL revertir_partido(${partidoId});
    `)

        return NextResponse.json({
            message: 'Partido revertido exitosamente'
        })

    } catch (error: any) {
        console.error('Error al revertir:', error)
        return NextResponse.json(
            { error: 'Error al revertir el partido', details: error.message },
            { status: 500 }
        )
    }
}