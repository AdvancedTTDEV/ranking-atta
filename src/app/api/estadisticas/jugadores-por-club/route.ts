import prisma from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

export async function GET() {
  const unauthorized = await requireAuth()
  if (unauthorized) return unauthorized

  try {
    const jugadoresPorClub = await prisma.clubes.findMany({
      select: {
        nombre: true,
        _count: {
          select: { jugadores: true }
        }
      }
    });
    
    return NextResponse.json(jugadoresPorClub.map((club: { nombre: string, _count: { jugadores: number } }) => ({
      club: club.nombre,
      jugadores: club._count.jugadores
    })));
  } catch (error) {
    return NextResponse.json(
      { message: "Error al obtener estadísticas" },
      { status: 500 }
    );
  }
}