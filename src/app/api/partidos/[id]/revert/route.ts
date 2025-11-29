import prisma from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const partidoId = parseInt(params.id)

        if (isNaN(partidoId)) {
            return NextResponse.json(
                { error: 'ID inválido' },
                { status: 400 }
            )
        }

        await prisma.$executeRawUnsafe(`
      CALL revertir_partido(${partidoId});
    `)

        return NextResponse.json({ message: 'Partido revertido exitosamente' })

    } catch (error: any) {
        console.error('Error al revertir:', error)
        return NextResponse.json(
            { error: 'Error al revertir el partido', details: error.message },
            { status: 500 }
        )
    }
}
