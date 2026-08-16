import prisma from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function PATCH(request: Request, context: { params: Promise<{ id: string; partidoId: string }> }) {
  try {
    const { id, partidoId } = await context.params
    const torneoId = Number(id)
    const { ganadorParticipanteId } = await request.json()
    const partido = await prisma.torneo_partidos_programados.findFirst({
      where: { id: Number(partidoId), torneo_id: torneoId, fase: 'ELIMINACION' },
      include: { torneos: { select: { modalidad: true } }, participante_local: { include: { miembros: true } }, participante_visitante: { include: { miembros: true } } }
    })
    if (!partido) return NextResponse.json({ error: 'El partido no está listo' }, { status: 400 })

    if (partido.estado === 'FINALIZADO') return NextResponse.json({ error: 'El partido ya fue registrado' }, { status: 409 })

    // Partido con BYE: uno de los dos participantes es null. El usuario
    // arrastra al participante sembrado como ganador para avanzarlo a la
    // siguiente ronda. No se invoca al SP `procesar_partido` porque no
    // hubo encuentro real; solo se actualiza el resultado y se siembra.
    if (!partido.participante_local_id || !partido.participante_visitante_id) {
      const idSembrado = partido.participante_local_id ?? partido.participante_visitante_id
      if (Number(ganadorParticipanteId) !== idSembrado) {
        return NextResponse.json({ error: 'El ganador debe ser el participante sembrado' }, { status: 400 })
      }
      await prisma.torneo_partidos_programados.update({
        where: { id: partido.id },
        data: { ganador_participante_id: idSembrado, estado: 'FINALIZADO' },
      })
      if (partido.siguiente_partido_id && partido.siguiente_lado) {
        await prisma.torneo_partidos_programados.update({
          where: { id: partido.siguiente_partido_id },
          data: partido.siguiente_lado === 'LOCAL'
            ? { participante_local_id: idSembrado }
            : { participante_visitante_id: idSembrado },
        })
      }
      return NextResponse.json({ success: true, bye: true })
    }

    if (!partido.participante_local || !partido.participante_visitante) return NextResponse.json({ error: 'El partido no está listo' }, { status: 400 })
    if (![partido.participante_local_id, partido.participante_visitante_id].includes(Number(ganadorParticipanteId))) return NextResponse.json({ error: 'El ganador debe ser uno de los dos participantes' }, { status: 400 })
    // Las primeras llaves creadas guardaban R1/R2. Derivamos la ronda desde
    // la cadena de avance para enviar siempre un valor válido al enum antiguo.
    let rondaSp = 'Campeón'
    if (partido.siguiente_partido_id) {
      const siguiente = await prisma.torneo_partidos_programados.findUnique({ where: { id: partido.siguiente_partido_id }, select: { siguiente_partido_id: true } })
      if (siguiente?.siguiente_partido_id) {
        const tercera = await prisma.torneo_partidos_programados.findUnique({ where: { id: siguiente.siguiente_partido_id }, select: { siguiente_partido_id: true } })
        rondaSp = tercera?.siguiente_partido_id ? 'Octavos' : 'Cuartos'
      } else rondaSp = 'Semifinal'
    }
    if (partido.torneos.modalidad === 'INDIVIDUAL') {
      const local = partido.participante_local.miembros[0]?.jugador_id
      const visitante = partido.participante_visitante.miembros[0]?.jugador_id
      const ganador = Number(ganadorParticipanteId) === partido.participante_local_id ? local : visitante
      if (!local || !visitante || !ganador) return NextResponse.json({ error: 'Faltan jugadores' }, { status: 400 })
      // Forzamos la collation de la sesión a la del ENUM de la tabla
      // para que las comparaciones internas del SP no mezclen colaciones.
      await prisma.$executeRawUnsafe(`SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;`)
      await prisma.$executeRawUnsafe(`CALL procesar_partido(${local}, ${visitante}, ${ganador}, ${torneoId}, '${rondaSp}', NULL)`)
    }
    await prisma.torneo_partidos_programados.update({ where: { id: partido.id }, data: { ganador_participante_id: Number(ganadorParticipanteId), estado: 'FINALIZADO' } })
    if (partido.siguiente_partido_id && partido.siguiente_lado) await prisma.torneo_partidos_programados.update({ where: { id: partido.siguiente_partido_id }, data: partido.siguiente_lado === 'LOCAL' ? { participante_local_id: Number(ganadorParticipanteId) } : { participante_visitante_id: Number(ganadorParticipanteId) } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error en PATCH llaves:', error)
    return NextResponse.json({ error: 'No se pudo registrar el ganador', detalles: error.message }, { status: 500 })
  }}
