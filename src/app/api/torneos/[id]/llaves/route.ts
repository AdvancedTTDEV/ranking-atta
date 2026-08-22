import prisma from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { PosicionManual, calcularClasificacionGrupo } from '@/lib/empates'
import { requireAuth } from '@/lib/auth'

interface Params { params: Promise<{ id: string }> }
const siguientePotenciaDos = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(2, n)))
const nombreRonda = (partidos: number) => ({ 1: 'Campeón', 2: 'Semifinal', 4: 'Cuartos', 8: 'Octavos', 16: '16avos', 32: '32avos' }[partidos] || `Ronda ${partidos}`)

/**
 * Cantidad de clasificados por grupo. Se persiste como convención en
 * cada torneo: si no se puede inferir, el default es 2. Hoy este
 * parámetro se pasa en el body del POST, no se guarda en BD. Si en el
 * futuro se hace persistente, se puede leer de ahí y eliminar este
 * fallback.
 */
const CLASIFICAN_POR_GRUPO_DEFAULT = 2

export async function GET(request: Request, { params }: Params) {
  const unauthorized = await requireAuth()
  if (unauthorized) return unauthorized

  const { id } = await params
  const categoriaId = Number(new URL(request.url).searchParams.get('categoriaId'))
  // ATTA Teams: las tres llaves paralelas (1=Primera categoría, 2=Segunda, 3=Tercera)
  // conviven bajo la misma categoría ancla. Si llega `nivel` filtramos
  // solo esa llave; si no, devolvemos todas (modalidades clásicas).
  const nivelParam = new URL(request.url).searchParams.get('nivel')
  const nivel = nivelParam ? Number(nivelParam) : null
  // Si el cliente pide también los detalles (para abrir el wizard de
  // alineación por partido de llave), incluimos `detalles` con sus
  // jugadores. Por defecto no se incluyen para no inflar la respuesta.
  const incluirDetalles = new URL(request.url).searchParams.get('withDetalles') === 'true'
  // Si el modal manual está abierto, el cliente pide también el pool
  // esperado para mostrarlo. Devolvemos los grupos con sus
  // clasificaciones computadas en servidor (MISMA lógica que POST), así
  // el frontend no recalcula con riesgo de divergir.
  const incluirPool = new URL(request.url).searchParams.get('withPool') === 'true'
  const necesitaPool = incluirPool && categoriaId !== 0

  // PERF: las cuatro consultas son independientes entre sí → una sola
  // tanda en paralelo. Sobre un túnel con RTT alto esto convierte
  // ~4-5 tiempos de ida y vuelta secuenciales en UNO.
  const [partidos, grupos, resultados, grupoParticipantes] = await Promise.all([
    prisma.torneo_partidos_programados.findMany({
      where: {
        torneo_id: Number(id),
        categoria_id: categoriaId,
        fase: 'ELIMINACION',
        ...(nivel ? { nivel_llave: nivel } : {})
      },
      orderBy: [{ ronda_eliminacion: 'asc' }, { posicion_llave: 'asc' }],
      // Traemos `clubes` en dos niveles: para participantes INDIVIDUALES
      // (vía `jugadores.clubes`) y para DOBLES/EQUIPOS (vía
      // `miembros.jugadores.clubes`). El frontend lo necesita para mostrar
      // el club en el pool de siembra y para marcar visualmente choques
      // de club en R1.
      include: {
        participante_local: {
          include: {
            jugadores: { include: { clubes: true } },
            miembros: { include: { jugadores: { include: { clubes: true } } } }
          }
        },
        participante_visitante: {
          include: {
            jugadores: { include: { clubes: true } },
            miembros: { include: { jugadores: { include: { clubes: true } } } }
          }
        },
        ...(incluirDetalles ? {
          detalles: {
            orderBy: { orden: 'asc' },
            include: {
              jugadores: { include: { jugadores: true } },
            },
          },
        } : {}),
      }
    }),
    // Grupos con integrantes y numero_grupo (antes se consultaban DOS
    // veces: una con participantes y otra solo para el número).
    necesitaPool ? prisma.torneo_grupos.findMany({
      where: { torneo_id: Number(id), categoria_id: categoriaId },
      orderBy: { numero_grupo: 'asc' },
      include: {
        participantes: {
          include: {
            torneo_participantes: {
              include: {
                jugadores: { include: { clubes: true } },
                miembros: { include: { jugadores: { include: { clubes: true } } } }
              }
            }
          }
        }
      }
    }) : Promise.resolve([]),
    necesitaPool ? prisma.torneo_partidos_programados.findMany({
      where: {
        torneo_id: Number(id),
        categoria_id: categoriaId,
        grupo_id: { not: null },
        fase: 'GRUPOS',
        estado: 'FINALIZADO'
      },
      include: { sets: true }
    }) : Promise.resolve([]),
    necesitaPool ? prisma.torneo_grupo_participantes.findMany({
      // Filtramos por la relación (grupos de este torneo+categoría) en vez
      // de necesitar los IDs primero: cero roundtrips extra.
      where: { torneo_grupos: { torneo_id: Number(id), categoria_id: categoriaId } },
      select: { grupo_id: true, torneo_participante_id: true, posicion: true }
    }) : Promise.resolve([]),
  ])

  if (!necesitaPool) {
    return NextResponse.json({ partidos })
  }
  if (grupos.length === 0) {
    return NextResponse.json({ partidos, pool: [] })
  }
  const manualPorGrupo = new Map<number, PosicionManual>()
  for (const item of grupoParticipantes) {
    if (item.posicion == null) continue
    const map = manualPorGrupo.get(item.grupo_id) || new Map<number, number>()
    map.set(item.torneo_participante_id, item.posicion)
    manualPorGrupo.set(item.grupo_id, map)
  }
  const pool: { grupoId: number; grupoNumero: number; posicionEnGrupo: number; participante: any }[] = []
  // numero_grupo ya viene dentro de cada fila de grupos (misma consulta).
  const numeroPorGrupo = new Map(grupos.map(g => [g.id, g.numero_grupo]))
  for (const grupo of grupos) {
    const ids = grupo.participantes.map(p => p.torneo_participantes.id)
    const partidosDelGrupo = resultados.filter(p => p.grupo_id === grupo.id)
    const { orden } = calcularClasificacionGrupo(
      ids,
      partidosDelGrupo,
      manualPorGrupo.get(grupo.id) || new Map()
    )
    orden.slice(0, nivel ? 3 : CLASIFICAN_POR_GRUPO_DEFAULT).forEach((participanteId, index) => {
      // En ATTA Teams el pool de cada llave es UNA posición por grupo
      // (nivel 1 → los 1ros, nivel 2 → los 2dos, nivel 3 → los 3ros).
      if (nivel && index + 1 !== nivel) return
      const t = grupo.participantes.find(p => p.torneo_participantes.id === participanteId)?.torneo_participantes
      if (!t) return
      pool.push({
        grupoId: grupo.id,
        grupoNumero: numeroPorGrupo.get(grupo.id) || 0,
        posicionEnGrupo: index + 1,
        participante: t
      })
    })
  }
  return NextResponse.json({ partidos, pool })
}

export async function POST(request: Request, { params }: Params) {
  const unauthorized = await requireAuth()
  if (unauthorized) return unauthorized

  try {
    const { id } = await params
    const torneoId = Number(id)
    // `nivel` solo llega en ATTA Teams: genera UNA llave con los
    // clasificados en esa posición de cada grupo (1=Primera categoría, 2=Segunda, 3=Tercera).
    const { categoriaId, clasificanPorGrupo = 2, vacio = false, nivel = null } = await request.json()
    const nivelLlave = nivel ? Number(nivel) : null
    if (nivelLlave !== null && ![1, 2, 3].includes(nivelLlave)) {
      return NextResponse.json({ error: 'Nivel de llave inválido' }, { status: 400 })
    }
    // En ATTA Teams cada llave toma exactamente 1 clasificado por grupo.
    const clasificanEfectivo = nivelLlave ? 1 : Number(clasificanPorGrupo)
    const grupos = await prisma.torneo_grupos.findMany({
      where: { torneo_id: torneoId, categoria_id: Number(categoriaId) },
      include: { participantes: { include: { torneo_participantes: true } } }
    })
    if (!grupos.length) return NextResponse.json({ error: 'No hay grupos' }, { status: 400 })
    const [totalGrupos, totalFinalizados] = await Promise.all([
      prisma.torneo_partidos_programados.count({ where: { torneo_id: torneoId, categoria_id: Number(categoriaId), grupo_id: { not: null }, fase: 'GRUPOS' } }),
      prisma.torneo_partidos_programados.count({ where: { torneo_id: torneoId, categoria_id: Number(categoriaId), grupo_id: { not: null }, fase: 'GRUPOS', estado: 'FINALIZADO' } })
    ])
    if (totalGrupos === 0) return NextResponse.json({ error: 'Primero genera los partidos de grupos' }, { status: 400 })
    if (totalFinalizados !== totalGrupos) return NextResponse.json({ error: `Faltan ${totalGrupos - totalFinalizados} partidos de grupo por finalizar` }, { status: 400 })

    // Calculamos el cupo contando cuántos clasificados habrá según
    // `clasificanPorGrupo`. Esto es válido tanto para la siembra
    // automática como para `vacio: true` (que también necesita saber
    // cuántos partidos de R1 crear). En modo vacío, los slots se
    // quedan todos en `null` y el usuario los llena arrastrando.
    const totalClasificados = grupos.length * clasificanEfectivo
    if (totalClasificados < 2) return NextResponse.json({ error: 'Se requieren al menos dos clasificados' }, { status: 400 })
    const cupo = siguientePotenciaDos(totalClasificados)
    const byes = cupo - totalClasificados

    // Construimos los cruces de R1. Si NO es modo vacío, sembramos con
    // el orden canónico de grupos (W → ratio sets → ratio puntos →
    // manual). Si ES modo vacío, dejamos todos los slots en `null`
    // para que el usuario los arrastre desde el pool.
    const crucesR1: { local: number | null; visitante: number | null }[] = []
    if (vacio) {
      // Modo vacío: todos los slots de R1 en null. El usuario siembra a mano.
      for (let i = 0; i < cupo / 2; i++) crucesR1.push({ local: null, visitante: null })
    } else {
      const resultados = await prisma.torneo_partidos_programados.findMany({
        where: { torneo_id: torneoId, categoria_id: Number(categoriaId), grupo_id: { not: null }, fase: 'GRUPOS', estado: 'FINALIZADO' },
        include: { sets: true }
      })

      // Cargamos las posiciones manuales que el operador haya asignado
      // (mismas reglas que en GET /partidos). Las agrupamos por grupo para
      // que el desempate respete el orden que el usuario eligió al
      // resolver un empate de triple/cuádruple igualdad.
      const grupoParticipantes = await prisma.torneo_grupo_participantes.findMany({
        where: { grupo_id: { in: grupos.map(g => g.id) } },
        select: { grupo_id: true, torneo_participante_id: true, posicion: true }
      })
      const manualPorGrupo = new Map<number, PosicionManual>()
      for (const item of grupoParticipantes) {
        if (item.posicion == null) continue
        const map = manualPorGrupo.get(item.grupo_id) || new Map<number, number>()
        map.set(item.torneo_participante_id, item.posicion)
        manualPorGrupo.set(item.grupo_id, map)
      }

      // Para cada grupo, computamos la clasificación COMPLETA con la
      // cascada de desempate (W → ratio sets → ratio puntos → manual).
      // Esto es la MISMA lógica que GET /partidos, así que el orden de
      // siembra del bracket coincide con el orden que ve el usuario en
      // la tabla. Si el operador resolvió un triple empate, su orden
      // personalizado se respeta; sin esto, los clasificados con
      // mismas V y diferencia de sets quedarían sembrados en el orden
      // de creación de la BD, no en el del ranking.
      const clasificados = grupos.flatMap(grupo => {
        const ids = grupo.participantes.map(item => item.torneo_participante_id)
        const partidosDelGrupo = resultados.filter(p => p.grupo_id === grupo.id)
        const { orden } = calcularClasificacionGrupo(ids, partidosDelGrupo, manualPorGrupo.get(grupo.id) || new Map())
        // ATTA Teams: de cada grupo entra SOLO el clasificado en la
        // posición del nivel (1º → Primera categoría, 2º → Segunda, 3º → Tercera).
        return nivelLlave ? orden.slice(nivelLlave - 1, nivelLlave) : orden.slice(0, clasificanEfectivo)
      })
      // Distribución de cruces: los BYE se reparten entre los
      // emparejamientos para que los clasificados con bye no queden
      // todos al final (lo que dejaría cruces fantasma en rondas
      // internas). Con N clasificados y B byes (cupo = N + B),
      // asignamos los últimos `byes` clasificados como "con BYE" y
      // los demás los emparejamos en pares reales.
      const reales: number[] = []
      const withBye: number[] = []
      for (let i = 0; i < clasificados.length; i++) {
        if (i < clasificados.length - byes) reales.push(clasificados[i])
        else withBye.push(clasificados[i])
      }
      // Construimos los `cupo / 2` cruces intercalando un cruce BYE
      // cada dos cruces reales (para distribuir los BYE a lo largo
      // del bracket y no juntarlos al final). Si no hay reales, todos
      // son BYE.
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
      // En ATTA Teams solo se regenera la llave del nivel pedido; las
      // otras dos quedan intactas. En modalidades clásicas el borrado
      // por nivel NULL equivale a "todas".
      await tx.torneo_partidos_programados.deleteMany({
        where: {
          torneo_id: torneoId,
          categoria_id: Number(categoriaId),
          fase: 'ELIMINACION',
          ...(nivelLlave ? { nivel_llave: nivelLlave } : { nivel_llave: null })
        }
      })
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
              nivel_llave: nivelLlave,
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
    return NextResponse.json({ success: true, byes, vacio })
  } catch (error: any) { return NextResponse.json({ error: 'Error al generar llaves', detalles: error.message }, { status: 500 }) }
}
