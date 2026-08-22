import prisma from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

/**
 * GET /api/h2h?a=ID1&b=ID2
 *
 * Cara a cara real entre DOS jugadores: todos los partidos en los que se
 * enfrentaron (en cualquiera de las dos direcciones), el marcador global y
 * los datos base de ambos para comparar perfiles.
 */
export async function GET(request: Request) {
    const unauthorized = await requireAuth()
    if (unauthorized) return unauthorized

    const { searchParams } = new URL(request.url)
    const a = Number(searchParams.get('a'))
    const b = Number(searchParams.get('b'))
    if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0 || a === b) {
        return NextResponse.json({ error: 'Parámetros inválidos: se requieren dos IDs distintos' }, { status: 400 })
    }

    try {
        const [jugadorA, jugadorB] = await Promise.all([
            prisma.jugadores.findUnique({
                where: { id: a },
                select: { id: true, nombre: true, elo: true, clubes: { select: { nombre: true } }, categorias: { select: { nombre: true } } },
            }),
            prisma.jugadores.findUnique({
                where: { id: b },
                select: { id: true, nombre: true, elo: true, clubes: { select: { nombre: true } }, categorias: { select: { nombre: true } } },
            }),
        ])
        if (!jugadorA || !jugadorB) {
            return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 })
        }

        const partidos = await prisma.partidos.findMany({
            where: {
                OR: [
                    { AND: [{ jugador1_id: a }, { jugador2_id: b }] },
                    { AND: [{ jugador1_id: b }, { jugador2_id: a }] },
                ],
            },
            orderBy: { id: 'desc' },
            include: {
                jugadores_partidos_ganador_idTojugadores: { select: { id: true, nombre: true } },
                torneos: { select: { nombre: true } },
            },
        })

        let victoriasA = 0
        let victoriasB = 0
        const duelos = partidos.map((p) => {
            if (p.ganador_id === a) victoriasA += 1
            else if (p.ganador_id === b) victoriasB += 1
            return {
                id: p.id,
                fecha: p.fecha?.toISOString() ?? null,
                torneoNombre: p.torneos?.nombre ?? '',
                ganadorId: p.ganador_id,
                ganadorNombre: p.jugadores_partidos_ganador_idTojugadores?.nombre ?? '',
            }
        })

        return NextResponse.json({
            jugadorA,
            jugadorB,
            resumen: { jugados: partidos.length, victoriasA, victoriasB },
            duelos,
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: 'Error al calcular el cara a cara' }, { status: 500 })
    }
}
