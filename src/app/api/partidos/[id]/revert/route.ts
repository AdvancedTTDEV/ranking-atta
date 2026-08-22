import prisma from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

export async function POST(
    request: Request,
    context: { params: Promise<{ id: string }> }
) {
    const unauthorized = await requireAuth()
    if (unauthorized) return unauthorized

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

        await prisma.$executeRaw`CALL revertir_partido(${partidoId});`

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