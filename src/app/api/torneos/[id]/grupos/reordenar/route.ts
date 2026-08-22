import prisma from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

interface RouteParams {
    params: Promise<{ id: string }>
}

export async function PUT(request: Request, { params }: RouteParams) {
    const unauthorized = await requireAuth()
    if (unauthorized) return unauthorized

    try {
        const { id } = await params
        const torneoId = Number(id)

        const { categoriaId, grupos } = await request.json()

        if (!categoriaId || !Array.isArray(grupos)) {
            return NextResponse.json(
                { error: 'Datos inválidos' },
                { status: 400 }
            )
        }

        await prisma.$transaction(async (tx) => {

            // Obtener grupos existentes
            const gruposBD = await tx.torneo_grupos.findMany({
                where: {
                    torneo_id: torneoId,
                    categoria_id: categoriaId
                },
                select: {
                    id: true,
                    numero_grupo: true
                }
            })

            const gruposMap = new Map(
                gruposBD.map(g => [g.id, g])
            )

            const idsFrontend = grupos
                .filter((g: any) => g.grupoId)
                .map((g: any) => g.grupoId)

            // -----------------------------
            // Eliminar grupos borrados
            // -----------------------------

            const idsEliminar = gruposBD
                .filter(g => !idsFrontend.includes(g.id))
                .map(g => g.id)

            if (idsEliminar.length > 0) {

                await tx.torneo_grupo_participantes.deleteMany({
                    where: {
                        grupo_id: {
                            in: idsEliminar
                        }
                    }
                })

                await tx.torneo_grupos.deleteMany({
                    where: {
                        id: {
                            in: idsEliminar
                        }
                    }
                })

            }

            // -----------------------------
            // Limpiar participantes existentes
            // -----------------------------

            if (idsFrontend.length > 0) {
                await tx.torneo_grupo_participantes.deleteMany({
                    where: {
                        grupo_id: {
                            in: idsFrontend
                        }
                    }
                })
            }

            // Todos los inserts se harán juntos
            const participantesCrear: any[] = []

            // -----------------------------
            // Crear / actualizar grupos
            // -----------------------------

            for (const grupo of grupos) {

                let grupoId = grupo.grupoId

                // Grupo nuevo
                if (!grupoId) {

                    const nuevo = await tx.torneo_grupos.create({
                        data: {
                            torneo_id: torneoId,
                            categoria_id: categoriaId,
                            numero_grupo: grupo.numeroGrupoTemporal
                        }
                    })

                    grupoId = nuevo.id

                } else {

                    const grupoBD = gruposMap.get(grupoId)

                    if (
                        grupo.numeroGrupoTemporal &&
                        grupoBD &&
                        grupoBD.numero_grupo !== grupo.numeroGrupoTemporal
                    ) {

                        await tx.torneo_grupos.update({
                            where: {
                                id: grupoId
                            },
                            data: {
                                numero_grupo: grupo.numeroGrupoTemporal
                            }
                        })

                    }

                }

                grupo.participantes.forEach((p: any) => {

                    participantesCrear.push({
                        grupo_id: grupoId,
                        torneo_participante_id: p.torneo_participante_id,
                        posicion: p.posicion
                    })

                })

            }

            // -----------------------------
            // Un solo INSERT
            // -----------------------------

            if (participantesCrear.length > 0) {

                await tx.torneo_grupo_participantes.createMany({
                    data: participantesCrear
                })

            }

        }, {
            timeout: 20000
        })

        return NextResponse.json({
            success: true
        })

    } catch (error: any) {

        console.error(error)

        return NextResponse.json({
            error: 'Error al guardar reordenamiento',
            detalles: error.message
        }, {
            status: 500
        })

    }
}