import prisma from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { crucesRoundRobin } from '@/lib/seed'

interface RouteParams { params: Promise<{ id: string }> }

const participantesInclude = {
    miembros: { orderBy: { orden: 'asc' as const }, include: { jugadores: true } },
    jugadores: true,
}

const nombreParticipante = (participante: {
    nombre_personalizado?: string | null
    miembros: { jugadores: { nombre: string } }[]
    jugadores?: { nombre: string } | null
}) =>
    participante.nombre_personalizado?.trim()
    || participante.miembros.map(m => m.jugadores.nombre).join(' / ')
    || participante.jugadores?.nombre
    || 'Participante'

export async function GET(request: Request, { params }: RouteParams) {
    try {
        const { id } = await params
        const torneoId = Number(id)
        const categoriaId = Number(new URL(request.url).searchParams.get('categoriaId'))
        if (!torneoId || !categoriaId) return NextResponse.json({ error: 'Falta torneo o categoría' }, { status: 400 })

        const grupos = await prisma.torneo_grupos.findMany({
            where: { torneo_id: torneoId, categoria_id: categoriaId },
            orderBy: { numero_grupo: 'asc' },
            include: {
                participantes: {
                    orderBy: { posicion: 'asc' },
                    include: { torneo_participantes: { include: participantesInclude } }
                }
            }
        })

        if (grupos.length === 0) return NextResponse.json({ error: 'Primero genera los grupos de esta categoría' }, { status: 400 })
        if (grupos.some(grupo => grupo.participantes.length < 2)) {
            return NextResponse.json({ error: 'Cada grupo necesita al menos dos participantes' }, { status: 400 })
        }

        const cruces: {
            grupo_id: number
            participante_local_id: number
            participante_visitante_id: number
            arbitro_jugador_id: number | null
            local: string
            visitante: string
        }[] = []

        for (const grupo of grupos) {
            const ids = grupo.participantes.map(p => p.torneo_participantes.id)
            const ordenCruces = crucesRoundRobin(ids)
            for (const [localId, visitanteId] of ordenCruces) {
                const local = grupo.participantes.find(p => p.torneo_participantes.id === localId)!.torneo_participantes
                const visitante = grupo.participantes.find(p => p.torneo_participantes.id === visitanteId)!.torneo_participantes
                const idsEnJuego = new Set([
                    ...local.miembros.map(m => m.jugador_id),
                    ...visitante.miembros.map(m => m.jugador_id),
                ])
                const arbitrosDisponibles = grupo.participantes
                    .flatMap(p => p.torneo_participantes.miembros.map(m => m.jugadores))
                    .filter(j => !idsEnJuego.has(j.id))
                cruces.push({
                    grupo_id: grupo.id,
                    participante_local_id: local.id,
                    participante_visitante_id: visitante.id,
                    arbitro_jugador_id: arbitrosDisponibles[0]?.id ?? null,
                    local: nombreParticipante(local),
                    visitante: nombreParticipante(visitante),
                })
            }
        }

        return NextResponse.json({ cruces })
    } catch (error: any) {
        console.error('Error al previsualizar partidos:', error)
        return NextResponse.json({ error: 'Error al previsualizar', detalles: error.message }, { status: 500 })
    }
}
