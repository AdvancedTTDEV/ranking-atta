import prisma from '@/lib/prisma'

interface OpcionesByes {
    torneoId: number
    categoriaId: number
    /** ATTA Teams: scopea a la llave del nivel (1=Primera categoría, 2=Segunda, 3=Tercera). */
    nivelLlave?: number | null
}

/**
 * Resuelve los PASES DIRECTOS (byes) del bracket de eliminación.
 *
 * Un partido con un solo participante cuyo lado vacío ya no puede
 * llenarse (su partido fuente no existe o finalizó sin ganador) es un
 * walkover: se finaliza automáticamente y el presente avanza a la ronda
 * siguiente. Los partidos completamente vacíos cuyas dos fuentes están
 * muertas se marcan finalizados sin ganador. Todo en cascada hasta que
 * no quede nada por resolver.
 *
 * NO toca el ranking ELO: un pase directo no es un partido jugado.
 */
export async function resolverByesLlave({ torneoId, categoriaId, nivelLlave = null }: OpcionesByes) {
    const filtroNivel = nivelLlave ? { nivel_llave: nivelLlave } : {}

    const todos = await prisma.torneo_partidos_programados.findMany({
        where: {
            torneo_id: torneoId,
            categoria_id: categoriaId,
            fase: 'ELIMINACION',
            ...filtroNivel,
        },
        select: {
            id: true,
            participante_local_id: true,
            participante_visitante_id: true,
            estado: true,
            ganador_participante_id: true,
            siguiente_partido_id: true,
            siguiente_lado: true,
        },
    })

    /** Fuente que alimenta el lado dado de un partido (puede no existir). */
    const fuenteDe = (partidoId: number, lado: string) =>
        todos.find(s => s.siguiente_partido_id === partidoId && s.siguiente_lado === lado)

    /**
     * Una fuente "muerta" ya no puede producir ganador: no existe
     * (primera ronda) o finalizó sin ganador (era ella misma un hueco).
     */
    const muerta = (s?: { estado: string; ganador_participante_id: number | null }) =>
        !s || (s.estado === 'FINALIZADO' && s.ganador_participante_id === null)

    // Punto fijo: cada pasada resuelve al menos una carta; las rondas
    // nunca superan ~6 así que 8 vueltas sobra.
    let cambio = true
    let vueltas = 0
    while (cambio && vueltas < 8) {
        cambio = false
        vueltas++

        for (const p of todos) {
            if (p.estado === 'FINALIZADO') continue

            const llenaLocal = p.participante_local_id !== null
            const llenaVisitante = p.participante_visitante_id !== null

            // ── Partido muerto: ambos lados vacíos para siempre ──
            if (!llenaLocal && !llenaVisitante) {
                if (!muerta(fuenteDe(p.id, 'LOCAL')) || !muerta(fuenteDe(p.id, 'VISITANTE'))) continue
                await prisma.torneo_partidos_programados.update({
                    where: { id: p.id },
                    data: { estado: 'FINALIZADO', sets_local: 0, sets_visitante: 0 },
                })
                p.estado = 'FINALIZADO'
                cambio = true
                continue
            }

            // Ambos llenos: juego normal, nada que resolver aquí.
            if (llenaLocal === llenaVisitante) continue

            // ── Walkover: un participante y el hueco ya no se llena ──
            const ladoVacio = llenaLocal ? 'VISITANTE' : 'LOCAL'
            if (!muerta(fuenteDe(p.id, ladoVacio))) continue

            const ganadorId = llenaLocal ? p.participante_local_id! : p.participante_visitante_id!
            await prisma.torneo_partidos_programados.update({
                where: { id: p.id },
                data: {
                    ganador_participante_id: ganadorId,
                    sets_local: 0,
                    sets_visitante: 0,
                    estado: 'FINALIZADO',
                },
            })
            if (p.siguiente_partido_id && p.siguiente_lado) {
                await prisma.torneo_partidos_programados.update({
                    where: { id: p.siguiente_partido_id },
                    data: p.siguiente_lado === 'LOCAL'
                        ? { participante_local_id: ganadorId }
                        : { participante_visitante_id: ganadorId },
                })
                const siguiente = todos.find(x => x.id === p.siguiente_partido_id)
                if (siguiente) {
                    if (p.siguiente_lado === 'LOCAL') siguiente.participante_local_id = ganadorId
                    else siguiente.participante_visitante_id = ganadorId
                }
            }
            p.estado = 'FINALIZADO'
            p.ganador_participante_id = ganadorId
            cambio = true
        }
    }
}
