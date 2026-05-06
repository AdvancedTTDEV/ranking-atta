import prisma from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const page = Number(searchParams.get('page') || 1)
    const limit = Number(searchParams.get('limit') || 10)
    const all = searchParams.get('all') === 'true'

    const skip = (page - 1) * limit

    const [torneos, total] = await Promise.all([
      prisma.torneos.findMany({
        ...(all ? {} : { skip, take: limit }),
        orderBy: {
          fecha: 'desc' // 🔥 IMPORTANTE (más recientes primero)
        },
        include: {
          torneo_categorias: {
            include: {
              categorias: true
            }
          }
        }
      }),
      prisma.torneos.count()
    ])

    return NextResponse.json({ torneos, total })
  } catch (error) {
    return NextResponse.json(
        { message: "Error al obtener torneos" },
        { status: 500 }
    )
  }
}

// ... (resto del código POST permanece igual)

export async function POST(request: Request) {
  const data = await request.json()
  
  try {
    const nuevoTorneo = await prisma.torneos.create({
      data: {
        nombre: data.nombre,
        fecha: new Date(data.fecha),
        ubicacion: data.ubicacion,
        torneo_categorias: {
          create: data.categorias.map((catId: number) => ({
            categoria_id: catId
          }))
        }
      }
    })
    return NextResponse.json(nuevoTorneo, { status: 201 })
  } catch (error: any) {
    return NextResponse.json(
      { message: "Error al crear torneo", error: error.message },
      { status: 500 }
    )
  }
}