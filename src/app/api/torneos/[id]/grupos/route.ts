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

        if (!categoriaId) return NextResponse.json({ error: "Falta categoriaId" }, { status: 400 })

        const grupos = await prisma.torneo_grupos.findMany({
            where: { torneo_id: torneoId, categoria_id: categoriaId },
            orderBy: { numero_grupo: 'asc' },
            include: {
                participantes: {
                    orderBy: { posicion: 'asc' },
                    include: {
                        torneo_participantes: {
                            include: {
                                jugadores: {
                                    include: { clubes: true }
                                },
                                miembros: {
                                    orderBy: { orden: 'asc' },
                                    include: { jugadores: { include: { clubes: true } } }
                                }
                            }
                        }
                    }
                }
            }
        })

        return NextResponse.json({ grupos })
    } catch (error: any) {
        return NextResponse.json({ error: "Error al obtener grupos", detalles: error.message }, { status: 500 })
    }
}

export async function POST(request: Request, { params }: RouteParams) {
    try {
        const { id } = await params
        const torneoId = Number(id)
        const { categoriaId, tamañoGrupo = 4 } = await request.json()

        if (!categoriaId) return NextResponse.json({ error: "Datos incompletos" }, { status: 400 })

        const participantes = await prisma.torneo_participantes.findMany({
            where: { torneo_id: torneoId, categoria_id: Number(categoriaId) },
            include: {
                jugadores: true,
                miembros: {
                    orderBy: { orden: 'asc' },
                    include: { jugadores: true }
                }
            }
        })

        if (participantes.length === 0) {
            return NextResponse.json({ error: "No hay jugadores inscritos en esta categoría" }, { status: 400 })
        }

        // En dobles y equipos el seed se calcula con el ELO promedio de sus
        // integrantes; los inscritos antiguos conservan jugador_id como respaldo.
        participantes.sort((a, b) => {
            const eloPromedio = (participante: typeof a) => {
                const integrantes = participante.miembros.length > 0
                    ? participante.miembros.map(m => m.jugadores)
                    : participante.jugadores ? [participante.jugadores] : []
                if (integrantes.length === 0) return 0
                return integrantes.reduce((total, jugador) => total + (jugador.elo ?? 0), 0) / integrantes.length
            }
            return eloPromedio(b) - eloPromedio(a)
        })

        const numGrupos = Math.ceil(participantes.length / tamañoGrupo)
        const gruposTemp: typeof participantes[] = Array.from({ length: numGrupos }, () => [])

        // Calcular tamaños: grupos completos primero, incompletos al final
        const tamañoBase = Math.floor(participantes.length / numGrupos)
        const gruposConExtra = participantes.length % numGrupos

        // gruposConExtra grupos tendrán tamañoBase+1, el resto tamañoBase
        // Los incompletos (menores) van al final → invertimos
        const tamañosPorGrupo = [
            ...Array(gruposConExtra).fill(tamañoBase + 1),       // completos → primero
            ...Array(numGrupos - gruposConExtra).fill(tamañoBase) // incompletos → último
        ]

        // Distribuir con sistema serpiente respetando tamaños
        // Primero asignamos posiciones serpiente globalmente
        const asignaciones: number[] = new Array(participantes.length)
        let idx = 0
        for (let g = 0; g < numGrupos; g++) {
            for (let p = 0; p < tamañosPorGrupo[g]; p++) {
                asignaciones[idx++] = g
            }
        }

        // Reordenar con serpiente: redistribuir los jugadores en orden ELO
        // ronda 0: grupos 0,1,2,...n (izq→der)
        // ronda 1: grupos n,n-1,...0 (der→izq)
        // etc.
        participantes.forEach((participante, index) => {
            const ronda = Math.floor(index / numGrupos)
            const esRondaPar = ronda % 2 === 0
            const posicionEnRonda = index % numGrupos
            const indiceGrupo = esRondaPar
                ? posicionEnRonda
                : (numGrupos - 1 - posicionEnRonda)
            gruposTemp[indiceGrupo].push(participante)
        })

        // Reordenar grupos para que los más completos queden primero
        // (los que tienen más jugadores van al inicio)
        gruposTemp.sort((a, b) => b.length - a.length)

        await prisma.$transaction(async (tx) => {
            const gruposViejos = await tx.torneo_grupos.findMany({
                where: { torneo_id: torneoId, categoria_id: Number(categoriaId) }
            })
            const viejosIds = gruposViejos.map(g => g.id)

            if (viejosIds.length > 0) {
                await tx.torneo_grupo_participantes.deleteMany({ where: { grupo_id: { in: viejosIds } } })
                await tx.torneo_grupos.deleteMany({ where: { id: { in: viejosIds } } })
            }

            for (let i = 0; i < numGrupos; i++) {
                const nuevoGrupo = await tx.torneo_grupos.create({
                    data: {
                        torneo_id: torneoId,
                        categoria_id: Number(categoriaId),
                        numero_grupo: i + 1,
                    }
                })

                if (gruposTemp[i].length > 0) {
                    await tx.torneo_grupo_participantes.createMany({
                        data: gruposTemp[i].map((p, pIndex) => ({
                            grupo_id: nuevoGrupo.id,
                            torneo_participante_id: p.id,
                            posicion: pIndex + 1
                        }))
                    })
                }
            }
        },{
            timeout: 20000
        }
    )

        return NextResponse.json({ success: true, message: "Grupos generados exitosamente" })
    } catch (error: any) {
        console.error(error)
        return NextResponse.json({ error: "Error interno al generar grupos", detalles: error.message }, { status: 500 })
    }
}
