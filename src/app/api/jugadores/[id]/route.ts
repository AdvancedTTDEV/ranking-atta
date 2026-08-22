import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const unauthorized = await requireAuth()
    if (unauthorized) return unauthorized

    const { id } = await params;
    const jugadorId = parseInt(id);

    const body = await request.json();

    if (isNaN(jugadorId)) {
        return NextResponse.json({ error: 'ID de jugador inválido' }, { status: 400 });
    }

    try {
        const jugadorActualizado = await prisma.jugadores.update({
            where: { id: jugadorId },
            data: body,
        });

        return NextResponse.json(jugadorActualizado);
    } catch (error: any) {
        console.error('Error al actualizar jugador:', error);
        return NextResponse.json({ error: 'Error al actualizar jugador' }, { status: 500 });
    }
}
