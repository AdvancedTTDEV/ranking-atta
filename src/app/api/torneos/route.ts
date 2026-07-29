import prisma from '@/lib/prisma'
import type { torneo_modalidad } from '@prisma/client'
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
          id: 'desc' // 🔥 más recientes primero (por id de inserción,
          //             ya que `fecha` es la fecha del torneo, no la
          //             de creación, y varios torneos creados el mismo
          //             día empatan y MySQL no garantiza el orden)
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

    // `abierto` indica que el torneo admite cualquier categoría. Tiene
    // tres orígenes posibles: modalidad DOBLES/EQUIPOS, columna `abierto`
    // persistida (torneos INDIVIDUAL marcados como abiertos al crearlos),
    // o presencia de la categoría "primera" entre las asignadas.
    const torneosConAbierto = torneos.map(t => ({
      ...t,
      abierto: Boolean(t.abierto) || t.modalidad === 'DOBLES' || t.modalidad === 'EQUIPOS' || t.torneo_categorias.some(tc => tc.categorias.nombre === 'primera'),
    }))

    return NextResponse.json({ torneos: torneosConAbierto, total })
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
  const modalidadesValidas = ['INDIVIDUAL', 'DOBLES', 'EQUIPOS']
  const modalidad = (data.modalidad || 'INDIVIDUAL') as torneo_modalidad
  const abierto = Boolean(data.abierto)

  if (!modalidadesValidas.includes(modalidad)) {
    return NextResponse.json({ message: 'Modalidad de torneo inválida' }, { status: 400 })
  }

  try {
    // Para dobles, por equipos y para individuales marcados como "abierto"
    // se asignan TODAS las categorías. Para individuales no abiertos se
    // respetan las categorías marcadas en el formulario.
    let categoriasAsignadas: number[] = Array.isArray(data.categorias) ? data.categorias : []
    if (modalidad === 'DOBLES' || modalidad === 'EQUIPOS' || abierto) {
      const todas = await prisma.categorias.findMany({ select: { id: true } })
      categoriasAsignadas = todas.map(c => c.id)
    }

    if (categoriasAsignadas.length === 0) {
      return NextResponse.json(
        { message: 'Selecciona al menos una categoría' },
        { status: 400 }
      )
    }

    const nuevoTorneo = await prisma.torneos.create({
      data: {
        nombre: data.nombre,
        fecha: new Date(data.fecha),
        ubicacion: data.ubicacion,
        modalidad,
        abierto,
        torneo_categorias: {
          create: categoriasAsignadas.map((catId: number) => ({
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
