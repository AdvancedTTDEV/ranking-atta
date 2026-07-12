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
    const byes = cupo - clasificados.length // participantes que quedan con BYE en R1
    // Distribución de cruces: los BYE se reparten entre los emparejamientos
    // para que los clasificados con bye no queden todos al final (lo que
    // dejaría cruces fantasma en rondas internas). Con N clasificados y
    // B byes (cupo = N + B), asignamos los últimos `byes` clasificados
    // como "con BYE" y los demás los emparejamos en pares reales.
    const crucesR1: { local: number | null; visitante: number | null }[] = []
    {
      const reales: number[] = []
      const withBye: number[] = []
      for (let i = 0; i < clasificados.length; i++) {
        if (i < clasificados.length - byes) reales.push(clasificados[i])
        else withBye.push(clasificados[i])
      }
      // Construimos los `cupo / 2` cruces intercalando un cruce BYE cada
      // dos cruces reales (para distribuir los BYE a lo largo del bracket
      // y no juntarlos al final). Si no hay reales, todos son BYE.
      const total = cupo / 2
      let rIdx = 0
      let bIdx = 0
      for (let i = 0; i < total; i++) {
        const quedanRealesPares = (reales.length - rIdx) >= 2
        if (bIdx < withBye.length && (i % 2 === 1 || !quedanRealesPares)) {
          crucesR1.push({ local: withBye[bIdx++], visitante: null })
        } else if (quedanRealesPares) {
          crucesR1.push({ local: reales[rIdx++], visitante: reales[rIdx++] })
        } else {
          // quedan reales sueltos y no quedan BYE: imposible porque
          // reales.length + byes = cupo, pero por seguridad
          crucesR1.push({ local: reales[rIdx++] ?? null, visitante: null })
        }
      }
    }
    await prisma.$transaction(async tx => {
      await tx.torneo_partidos_programados.deleteMany({ where: { torneo_id: torneoId, categoria_id: Number(categoriaId), fase: 'ELIMINACION' } })
      const rondas: { id: number }[][] = []
      let partidosRonda = cupo / 2
      let ronda = 0
      while (partidosRonda >= 1) {
        const creados: { id: number }[] = []
        for (let posicion = 0; posicion < partidosRonda; posicion++) {
          let local: number | null = null
          let visitante: number | null = null
          if (ronda === 0) {
            local = crucesR1[posicion]?.local ?? null
            visitante = crucesR1[posicion]?.visitante ?? null
          }
          // IMPORTANTE: ningún partido se finaliza automáticamente, ni
          // siquiera los cruces con un solo participante (BYE). El usuario
          // decide cuándo confirmar cada resultado arrastrando al ganador,
          // igual que con cualquier otro partido. Esto evita que un BYE en
          // R1 cierre el resto del bracket sin que el usuario lo haya
          // pedido.
          const creado = await tx.torneo_partidos_programados.create({
            data: {
              torneo_id: torneoId,
              categoria_id: Number(categoriaId),
              participante_local_id: local,
              participante_visitante_id: visitante,
              ganador_participante_id: null,
              fase: 'ELIMINACION',
              ronda_eliminacion: nombreRonda(partidosRonda),
              posicion_llave: posicion + 1,
              estado: 'PENDIENTE',
            }
          })
          creados.push({ id: creado.id })
        }
        rondas.push(creados); partidosRonda /= 2; ronda++
      }
      // Enlazar cada partido con su siguiente. La siembra del ganador en
      // la siguiente ronda la hace el PATCH al confirmar el resultado.
      for (let r = 0; r < rondas.length - 1; r++) {
        for (let i = 0; i < rondas[r].length; i++) {
          const actual = rondas[r][i]
          const siguiente = rondas[r + 1][Math.floor(i / 2)]
          const lado: 'LOCAL' | 'VISITANTE' = i % 2 === 0 ? 'LOCAL' : 'VISITANTE'
          await tx.torneo_partidos_programados.update({
            where: { id: actual.id },
            data: { siguiente_partido_id: siguiente.id, siguiente_lado: lado },
          })
        }
      }
    }, { timeout: 30_000 })
    return NextResponse.json({ success: true, byes })
  } catch (error: any) { return NextResponse.json({ error: 'Error al generar llaves', detalles: error.message }, { status: 500 }) }
}
