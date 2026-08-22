import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function POST(req: NextRequest) {
    const unauthorized = await requireAuth()
    if (unauthorized) return unauthorized

    try {
        const { jugadores, nuevaCategoriaId, motivo } = await req.json()

        if (!['Ascenso', 'Descenso', 'Ajuste'].includes(motivo)) {
            return NextResponse.json(
                { error: 'Motivo inválido' },
                { status: 400 }
            )
        }

        for (const jugador of jugadores) {
            await prisma.$executeRaw`
                CALL cambiar_categoria_jugador(
                    ${Number(jugador.id)},
                    ${Number(nuevaCategoriaId)},
                    ${motivo}
                )
            `
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error al cambiar categoría:', error)
        return NextResponse.json(
            { error: 'Error al ejecutar el procedimiento' },
            { status: 500 }
        )
    }
}