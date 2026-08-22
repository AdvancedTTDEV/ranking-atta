import prisma from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

export async function GET(request: Request) {
  const unauthorized = await requireAuth()
  if (unauthorized) return unauthorized

  try {
    const { searchParams } = new URL(request.url)
    const all = searchParams.get('all') === 'true'
    const page = Number(searchParams.get('page') || 1)
    const categoriaId = searchParams.get('categoriaId')
    const limit = Number(searchParams.get('limit') || 10)
    const skip = (page - 1) * limit


    // Filtro por categoría
    const where = categoriaId ? { categoria_id: Number(categoriaId) } : {}

    // Si se solicita todos los registros
    if (all) {
      const jugadores = await prisma.jugadores.findMany({
        where,
        select: {
          id: true,
          nombre: true,
          categoria_id: true,
          categorias: true,
          elo: true
        },
        orderBy: {
          nombre: 'asc'
        }
      })
      return NextResponse.json({jugadores: jugadores ?? []})
    }

    // Paginación normal
    const [jugadores, total] = await Promise.all([
      prisma.jugadores.findMany({
        skip,
        take: limit,
        include: {
          clubes: true,
          categorias: true,
        },
      }),
      prisma.jugadores.count()
    ])

    return NextResponse.json({ jugadores, total })
  } catch (error) {
    console.error('Error fetching jugadores:', error)
    return NextResponse.json(
      { error: "Error al obtener jugadores" },
      { status: 500 }
    )
  }
}


export async function POST(request: Request) {
  const unauthorized = await requireAuth()
  if (unauthorized) return unauthorized

  try {
    const data = await request.json()
    
    const nuevoJugador = await prisma.jugadores.create({
      data: {
        nombre: data.nombre,
        club_id: Number(data.club_id),
        categoria_id: Number(data.categoria_id),
        elo: data.elo || 1000,
      },
      include: {
        clubes: true,
        categorias: true,
      }
    })
    return NextResponse.json(nuevoJugador, { status: 201 })
  } catch (error: any) {
    console.error('Error creating jugador:', error)
    
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: "Ya existe un jugador con este nombre" },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { error: "Error al crear jugador" },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  const unauthorized = await requireAuth()
  if (unauthorized) return unauthorized

  try {
    const data = await request.json()

    // Actualización múltiple: transacción única — o se aplican todos los
    // cambios de categoría o ninguno (evita estados mixtos a mitad de lista).
    if (Array.isArray(data)) {
      const actualizados = await prisma.$transaction(
        data.map(jugador =>
          prisma.jugadores.update({
            where: { id: jugador.id },
            data: { categoria_id: jugador.categoria_id }
          })
        )
      )
      return NextResponse.json(actualizados)
    }

    // Actualización individual
    const updatedJugador = await prisma.jugadores.update({
      where: { id: data.id },
      data: {
        categoria_id: data.categoria_id
      }
    })

    return NextResponse.json(updatedJugador)
  } catch (error) {
    console.error('Error updating jugador:', error)
    return NextResponse.json(
        { error: "Error al actualizar jugador" },
        { status: 500 }
    )
  }
}