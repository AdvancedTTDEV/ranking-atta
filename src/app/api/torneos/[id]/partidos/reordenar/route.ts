import prisma from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string }> }

/**
 * PUT /api/torneos/[id]/partidos/reordenar
 *
 * Reordena los partidos de la fase de GRUPOS dentro de UN grupo.
 * El cliente envía el array `orden` con los IDs de partido en el orden
 * deseado (de arriba a abajo). El backend renumera el campo `orden`
 * para que coincida con la posición del array.
 *
 * Validaciones:
 * 1. Auth requerida.
 * 2. categoriaId, grupoId y array `orden` no-vacío requerido.
 * 3. Los IDs enviados deben coincidir EXACTAMENTE con los partidos
 *    actuales del grupo (no se pueden añadir ni quitar).
 * 4. Ningún partido del grupo puede estar FINALIZADO; si lo está,
 *    devuelve 409: ya empezó la fase, no se puede reordenar.
 *
 * Persistencia en dos pasadas dentro de $transaction:
 * - Fase 1: shift a `orden = -(index+1)` para no chocar con la
 *   constraint `@@unique([grupo_id, orden])`.
 * - Fase 2: aplica `orden = index+1` según el array del cliente.
 */
export async function PUT(request: Request, { params }: RouteParams) {
    const unauthorized = await requireAuth()
    if (unauthorized) return unauthorized

    try {
        const { id } = await params
        const torneoId = Number(id)
        const body = await request.json() as {
            categoriaId: number
            grupoId: number
            orden: number[]
        }

        if (!torneoId || !body.categoriaId || !body.grupoId) {
            return NextResponse.json({ error: 'Falta torneo, categoría o grupo' }, { status: 400 })
        }
        if (!Array.isArray(body.orden) || body.orden.length === 0) {
            return NextResponse.json({ error: 'Falta el array de orden' }, { status: 400 })
        }
        if (body.orden.some(id => typeof id !== 'number')) {
            return NextResponse.json({ error: 'IDs de partido inválidos' }, { status: 400 })
        }

        const existentes = await prisma.torneo_partidos_programados.findMany({
            where: {
                torneo_id: torneoId,
                categoria_id: Number(body.categoriaId),
                grupo_id: Number(body.grupoId),
                fase: 'GRUPOS'
            },
            select: { id: true, estado: true }
        })

        if (existentes.length === 0) {
            return NextResponse.json({
                error: 'No hay partidos en este grupo. Genera los cruces primero'
            }, { status: 400 })
        }

        const idsExistentes = new Set(existentes.map(p => p.id))
        const idsEnviados = new Set(body.orden)
        if (idsExistentes.size !== idsEnviados.size) {
            return NextResponse.json({
                error: 'La cantidad de partidos enviados no coincide con el grupo'
            }, { status: 400 })
        }
        for (const id of idsEnviados) {
            if (!idsExistentes.has(id)) {
                return NextResponse.json({
                    error: `El partido ${id} no pertenece a este grupo`
                }, { status: 400 })
            }
        }

        if (existentes.some(p => p.estado === 'FINALIZADO')) {
            return NextResponse.json({
                error: 'Este grupo ya tiene partidos finalizados; no se puede reordenar'
            }, { status: 409 })
        }

        // Doble pasada: primero negativo, luego positivo. Evita chocar con
        // el `@@unique([grupo_id, orden])` al intercambiar filas.
        await prisma.$transaction([
            ...body.orden.map((partidoId, index) =>
                prisma.torneo_partidos_programados.update({
                    where: { id: partidoId },
                    data: { orden: -(index + 1) }
                })
            ),
            ...body.orden.map((partidoId, index) =>
                prisma.torneo_partidos_programados.update({
                    where: { id: partidoId },
                    data: { orden: index + 1 }
                })
            )
        ])

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Error al reordenar partidos:', error)
        return NextResponse.json({
            error: 'Error al guardar el nuevo orden',
            detalles: error.message
        }, { status: 500 })
    }
}
