import prisma from '@/lib/prisma'
import { NextResponse } from 'next/server'

interface RouteParams {
    params: Promise<{ id: string }>
}

export async function GET(request: Request, { params }: RouteParams) {
    try {
        const { id } = await params
        const torneoId = Number(id)
        const { searchParams } = new URL(request.url)
        const categoriaId = Number(searchParams.get('categoriaId'))

        if (!categoriaId) {
            return NextResponse.json(
                { error: "Falta el parámetro categoriaId" },
                { status: 400 }
            )
        }

        const participantes = await prisma.torneo_participantes.findMany({
            where: {
                torneo_id: torneoId,
                categoria_id: categoriaId
            },
            include: {
                jugadores: {
                    include: {
                        clubes: true
                    }
                }
            }
        })

        return NextResponse.json({ participantes })
    } catch (error: any) {
        console.error("Error al obtener participantes:", error)
        return NextResponse.json(
            { error: "Error al obtener participantes", detalles: error.message },
            { status: 500 }
        )
    }
}

export async function POST(request: Request, { params }: RouteParams) {
    try {
        const { id } = await params
        const torneoId = Number(id)
        const { categoriaId, jugadoresIds } = await request.json()

        if (!categoriaId || !Array.isArray(jugadoresIds)) {
            return NextResponse.json(
                { error: "Datos de inscripción inválidos o incompletos" },
                { status: 400 }
            )
        }

        await prisma.$transaction([
            prisma.torneo_participantes.deleteMany({
                where: { torneo_id: torneoId, categoria_id: categoriaId }
            }),
            ...(jugadoresIds.length > 0
                ? [prisma.torneo_participantes.createMany({
                    data: jugadoresIds.map((jugadorId: number) => ({
                        jugador_id: jugadorId,
                        torneo_id: torneoId,
                        categoria_id: categoriaId,
                        seed: 0
                    }))
                })]
                : [])
        ])

        return NextResponse.json({ success: true, message: "Inscripciones actualizadas correctamente" })
    } catch (error: any) {
        console.error("Error al procesar inscripciones:", error)
        return NextResponse.json(
            { error: "Error al guardar inscripciones", detalles: error.message },
            { status: 500 }
        )
    }
}