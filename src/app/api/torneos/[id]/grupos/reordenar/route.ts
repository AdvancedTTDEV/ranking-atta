// /api/torneos/[id]/grupos/reordenar/route.ts
import prisma from '@/lib/prisma'
import { NextResponse } from 'next/server'

interface RouteParams {
    params: Promise<{ id: string }>
}

export async function PUT(request: Request, { params }: RouteParams) {
    try {
        const { id } = await params
        const torneoId = Number(id)
        const { grupos } = await request.json()

        if (!grupos || !Array.isArray(grupos)) {
            return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
        }

        await prisma.$transaction(async (tx) => {
            for (const grupo of grupos) {
                // Primero limpia los participantes del grupo
                await tx.torneo_grupo_participantes.deleteMany({
                    where: { grupo_id: grupo.grupoId }
                })
                // Luego inserta en el nuevo orden
                if (grupo.participantes.length > 0) {
                    await tx.torneo_grupo_participantes.createMany({
                        data: grupo.participantes.map((p: { torneo_participante_id: number; posicion: number }) => ({
                            grupo_id: grupo.grupoId,
                            torneo_participante_id: p.torneo_participante_id,
                            posicion: p.posicion
                        }))
                    })
                }
            }
        })

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error(error)
        return NextResponse.json({ error: 'Error al guardar reordenamiento', detalles: error.message }, { status: 500 })
    }
}