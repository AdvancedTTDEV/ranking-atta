import prisma from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

export async function GET() {
  const unauthorized = await requireAuth()
  if (unauthorized) return unauthorized

  try {
    const categorias = await prisma.categorias.findMany({
      orderBy: { nombre: 'asc' }
    })
    return NextResponse.json(categorias)
  } catch (error) {
    console.error(error)
    return NextResponse.json(
        { error: 'Error al obtener categorías' },
        { status: 500 }
    )
  }
}
