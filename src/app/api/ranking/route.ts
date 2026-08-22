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
    const limit = Number(searchParams.get('limit') || 10)
    const categoriaId = searchParams.get('categoriaId')
    const nombre = searchParams.get('nombre')?.trim()
    const skip = (page - 1) * limit

    // Filtro por categoría y búsqueda por nombre (parcial, sin acentos).
    const where = {
      ...(categoriaId ? { categoria_id: Number(categoriaId) } : {}),
      ...(nombre
        ? { nombre: { contains: nombre } }
        : {}),
    }

    if (all) {
      const jugadores = await prisma.jugadores.findMany({
        where,
        select: {
          id: true,
          nombre: true,
          clubes: true,
          categorias: true,
          elo: true
        },
        orderBy: {
          elo: 'desc'
        }
      })
      return NextResponse.json({jugadores: jugadores ?? []})
    }

    const [jugadores, total] = await Promise.all([
      prisma.jugadores.findMany({
        where,
        skip,
        take: limit,
        include: {
          clubes: true,
          categorias: true,
        },
        orderBy: {
          elo: 'desc',
        }
      }),
      prisma.jugadores.count({ where })
    ])

    return NextResponse.json({ jugadores, total })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
        { error: 'Error al obtener ranking' },
        { status: 500 }
    )
  }
}