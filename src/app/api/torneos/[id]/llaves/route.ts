import prisma from '@/lib/prisma'
import { NextResponse } from 'next/server'

interface Params { params: Promise<{ id: string }> }
const siguientePotenciaDos = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(2, n)))
const nombreRonda = (partidos: number) => ({ 1: 'Campeón', 2: 'Semifinal', 4: 'Cuartos', 8: 'Octavos', 16: '16avos', 32: '32avos' }[partidos] || `Ronda ${partidos}`)

export async function GET(request: Request, { params }: Params) {
  const { id } = await params
  const categoriaId = Number(new URL(request.url).searchParams.get('categoriaId'))
  const partidos = await prisma.torneo_partidos_programados.findMany({
    where: { torneo_id: Number(id), categoria_id: categoriaId, fase: 'ELIMINACION' },
    orderBy: [{ ronda_eliminacion: 'asc' }, { posicion_llave: 'asc' }],
    include: { participante_local: { include: { miembros: { include: { jugadores: true } } } }, participante_visitante: { include: { miembros: { include: { jugadores: true } } } } }
  })
  return NextResponse.json({ partidos })
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const torneoId = Number(id)
    const { categoriaId, clasificanPorGrupo = 2 } = await request.json()
    const grupos = await prisma.torneo_grupos.findMany({ where: { torneo_id: torneoId, categoria_id: Number(categoriaId) }, include: { participantes: { include: { torneo_participantes: true } } } })
    if (!grupos.length) return NextResponse.json({ error: 'No hay grupos' }, { status: 400 })
    const [totalGrupos, totalFinalizados] = await Promise.all([
      prisma.torneo_partidos_programados.count({ where: { torneo_id: torneoId, categoria_id: Number(categoriaId), grupo_id: { not: null }, fase: 'GRUPOS' } }),
      prisma.torneo_partidos_programados.count({ where: { torneo_id: torneoId, categoria_id: Number(categoriaId), grupo_id: { not: null }, fase: 'GRUPOS', estado: 'FINALIZADO' } })
    ])
    if (totalGrupos === 0) return NextResponse.json({ error: 'Primero genera los partidos de grupos' }, { status: 400 })
    if (totalFinalizados !== totalGrupos) return NextResponse.json({ error: `Faltan ${totalGrupos - totalFinalizados} partidos de grupo por finalizar` }, { status: 400 })
    const resultados = await prisma.torneo_partidos_programados.findMany({ where: { torneo_id: torneoId, categoria_id: Number(categoriaId), grupo_id: { not: null }, fase: 'GRUPOS', estado: 'FINALIZADO' } })
    const clasificados = grupos.flatMap(grupo => {
      const ids = grupo.participantes.map(item => item.torneo_participante_id)
      const tabla = ids.map(idParticipante => ({ id: idParticipante, victorias: resultados.filter(p => p.ganador_participante_id === idParticipante).length, sets: resultados.filter(p => p.participante_local_id === idParticipante).reduce((n,p) => n + p.sets_local - p.sets_visitante, 0) + resultados.filter(p => p.participante_visitante_id === idParticipante).reduce((n,p) => n + p.sets_visitante - p.sets_local, 0) }))
      return tabla.sort((a,b) => b.victorias - a.victorias || b.sets - a.sets).slice(0, clasificanPorGrupo).map(item => item.id)
    })
    if (clasificados.length < 2) return NextResponse.json({ error: 'Se requieren al menos dos clasificados' }, { status: 400 })
    const cupo = siguientePotenciaDos(clasificados.length)
    await prisma.$transaction(async tx => {
      await tx.torneo_partidos_programados.deleteMany({ where: { torneo_id: torneoId, categoria_id: Number(categoriaId), fase: 'ELIMINACION' } })
      const rondas: { id: number }[][] = []
      let partidosRonda = cupo / 2
      let ronda = 0
      while (partidosRonda >= 1) {
        const creados: { id: number }[] = []
        for (let posicion = 0; posicion < partidosRonda; posicion++) {
          const local = ronda === 0 ? clasificados[posicion * 2] ?? null : null
          const visitante = ronda === 0 ? clasificados[posicion * 2 + 1] ?? null : null
          const creado = await tx.torneo_partidos_programados.create({ data: { torneo_id: torneoId, categoria_id: Number(categoriaId), participante_local_id: local, participante_visitante_id: visitante, fase: 'ELIMINACION', ronda_eliminacion: nombreRonda(partidosRonda), posicion_llave: posicion + 1 } })
          creados.push({ id: creado.id })
        }
        rondas.push(creados); partidosRonda /= 2; ronda++
      }
      for (let r = 0; r < rondas.length - 1; r++) for (let i = 0; i < rondas[r].length; i++) await tx.torneo_partidos_programados.update({ where: { id: rondas[r][i].id }, data: { siguiente_partido_id: rondas[r + 1][Math.floor(i / 2)].id, siguiente_lado: i % 2 === 0 ? 'LOCAL' : 'VISITANTE' } })
    }, { timeout: 20_000 })
    return NextResponse.json({ success: true })
  } catch (error: any) { return NextResponse.json({ error: 'Error al generar llaves', detalles: error.message }, { status: 500 }) }
}
