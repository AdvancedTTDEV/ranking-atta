import prisma from '@/lib/prisma'
import { NextResponse } from 'next/server'

/**
 * Permite reordenar manualmente las posiciones de los participantes de un
 * grupo cuando el sistema no puede desempatar automáticamente (mismo W,
 * mismo ratio de sets, mismo ratio de puntos).
 *
 * El cliente envía el orden FINAL deseado (no un delta). Por ejemplo, si
 * tres participantes estaban empatados en 2°, 3°, 4° y el usuario decide
 * que el orden es [B, A, C], envía:
 *   { posiciones: [
 *     { participante_id: B, posicion: 1 },
 *     { participante_id: A, posicion: 2 },
 *     { participante_id: C, posicion: 3 },
 *   ] }
 *
 * Esto actualiza la columna `posicion` de `torneo_grupo_participantes`,
 * que es la que usa el sembrado de las llaves (ver `llaves/route.ts`).
 */
interface RouteParams {
    params: Promise<{ id: string; grupoId: string }>
}

export async function PUT(request: Request, { params }: RouteParams) {
    try {
        const { id, grupoId } = await params
        const torneoId = Number(id)
        const grupoIdNum = Number(grupoId)
        if (!torneoId || !grupoIdNum) {
            return NextResponse.json({ error: 'Falta torneo o grupo' }, { status: 400 })
        }
        const { posiciones } = await request.json() as {
            posiciones: { participante_id: number; posicion: number }[]
        }
        if (!Array.isArray(posiciones) || posiciones.length === 0) {
            return NextResponse.json({ error: 'Falta el array de posiciones' }, { status: 400 })
        }
        if (posiciones.some(p => !Number.isInteger(p.participante_id) || !Number.isInteger(p.posicion) || p.posicion < 1)) {
            return NextResponse.json({ error: 'Posiciones inválidas' }, { status: 400 })
        }
        // Detectar duplicados: dos participantes no pueden compartir posición
        // final en el mismo grupo (la posición es 1, 2, 3, ...).
        const setPosiciones = new Set(posiciones.map(p => p.posicion))
        if (setPosiciones.size !== posiciones.length) {
            return NextResponse.json({ error: 'Hay posiciones duplicadas' }, { status: 400 })
        }

        // Verificamos que el grupo pertenece al torneo y que todos los
        // participantes están efectivamente en él (defensa en profundidad).
        const grupo = await prisma.torneo_grupos.findFirst({
            where: { id: grupoIdNum, torneo_id: torneoId },
            include: { participantes: { select: { torneo_participante_id: true } } }
        })
        if (!grupo) {
            return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })
        }
        const idsValidos = new Set(grupo.participantes.map(p => p.torneo_participante_id))
        for (const item of posiciones) {
            if (!idsValidos.has(item.participante_id)) {
                return NextResponse.json({
                    error: `El participante ${item.participante_id} no pertenece al grupo ${grupoIdNum}`
                }, { status: 400 })
            }
        }

        // Sentinela: `posicion_manual = posicion + 1000`. La diferencia
        // con el sembrado inicial (que asigna 1..N sin offset) le permite
        // al GET distinguir "el operador tocó este grupo" de "el sembrado
        // automático asignó 1..N". Al renderizar la clasificación, el GET
        // resta 1000 antes de devolver el valor al frontend.
        const OFFSET_MANUAL = 1000
        await prisma.$transaction(
            posiciones.map(item =>
                prisma.torneo_grupo_participantes.update({
                    where: {
                        grupo_id_torneo_participante_id: {
                            grupo_id: grupoIdNum,
                            torneo_participante_id: item.participante_id
                        }
                    },
                    data: { posicion: item.posicion + OFFSET_MANUAL }
                })
            )
        )

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Error al reordenar posiciones:', error)
        return NextResponse.json({ error: 'Error al guardar el orden', detalles: error.message }, { status: 500 })
    }
}
