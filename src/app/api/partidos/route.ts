import prisma from '@/lib/prisma'
import {NextResponse} from 'next/server'
import type {partidos_ronda} from '@prisma/client'
import {requireAuth} from '@/lib/auth'

const mapRondas: Record<partidos_ronda, string> = {
    Grupos: "Grupos",
    Treintaydoavos: "32avos",
    Dieciseisavos: "16avos",
    Octavos: "Octavos",
    Cuartos: "Cuartos",
    Semifinal: "Semifinal",
    Final: "Final",
    Campe_n: "Campeón"
};

function mapEnumToRondaValor(valor: partidos_ronda | null): string {
    if (!valor) return "N/A";
    return mapRondas[valor];
}


export async function GET(request: Request) {
    const unauthorized = await requireAuth()
    if (unauthorized) return unauthorized

    try {
        const {searchParams} = new URL(request.url)
        const page = Number(searchParams.get('page') || 1)
        const limit = Number(searchParams.get('limit') || 10)
        const skip = (page - 1) * limit
        const torneoiD = searchParams.get('torneo_id')
        const q = searchParams.get('q')?.trim()

        // Filtro por torneo y búsqueda por nombre de cualquiera de los dos
        // jugadores (parcial; la collation de MySQL ignora mayúsculas/acentos).
        const where = {
            ...(torneoiD ? { torneo_id: Number(torneoiD) } : {}),
            ...(q
                ? {
                      OR: [
                          { jugadores_partidos_jugador1_idTojugadores: { nombre: { contains: q } } },
                          { jugadores_partidos_jugador2_idTojugadores: { nombre: { contains: q } } },
                      ],
                  }
                : {}),
        }

        const [partidos, total] = await Promise.all([
            prisma.partidos.findMany({
                where,
                skip,
                take: limit,
                include: {
                    jugadores_partidos_jugador1_idTojugadores: true,
                    jugadores_partidos_jugador2_idTojugadores: true,
                    jugadores_partidos_ganador_idTojugadores: true,
                    torneos: true
                },
                orderBy: {
                    id: 'desc'
                }
            }),
            prisma.partidos.count({where})
        ]);

        const partidosFormateados = partidos.map(partido => ({
            id: partido.id,
            jugador1Nombre: partido.jugadores_partidos_jugador1_idTojugadores?.nombre ?? 'N/A',
            jugador2Nombre: partido.jugadores_partidos_jugador2_idTojugadores?.nombre ?? 'N/A',
            ganadorNombre: partido.jugadores_partidos_ganador_idTojugadores?.nombre ?? 'N/A',
            torneoNombre: partido.torneos?.nombre ?? 'N/A',
            fecha: partido.fecha ? new Date(partido.fecha).toLocaleDateString() : 'N/A',
            ronda: mapEnumToRondaValor(partido.ronda)
        }));

        return NextResponse.json({partidos: partidosFormateados, total});
    } catch (error: any) {
        console.error('Error al obtener los partidos:', {
            message: error.message,
            stack: error.stack,
        });

        return NextResponse.json(
            {error: "Error al obtener los partidos", details: error.message},
            {status: 500}
        );
    }
}

export async function POST(request: Request) {
    const unauthorized = await requireAuth()
    if (unauthorized) return unauthorized

    let data;
    try {
        data = await request.json();
        const {jugador1_id, jugador2_id, ganador_id, torneo_id, ronda} = data;
        if (!ronda) {
            return NextResponse.json({error: "El campo 'ronda' es requerido"}, {status: 400});
        }
        if (!jugador1_id || !ganador_id || !torneo_id) {
            return NextResponse.json({error: "Los campos 'jugador1_id', 'ganador_id' y 'torneo_id' son requeridos"}, {status: 400});
        }

        const j1 = parseInt(jugador1_id);
        const j2 = jugador2_id ? parseInt(jugador2_id) : null;
        const g = parseInt(ganador_id);
        const t = parseInt(torneo_id);

        if (isNaN(j1) || (jugador2_id && isNaN(j2 as number)) || isNaN(g) || isNaN(t)) {
            return NextResponse.json({error: "Los IDs deben ser números válidos."}, {status: 400});
        }

        // Consulta parametrizada: nunca interpolar strings del request en SQL.
        await prisma.$executeRaw`
      CALL procesar_partido(
        ${j1},
        ${j2 !== null ? j2 : null},
        ${g},
        ${t},
        ${ronda},
        ${data.tipo_especial ?? null}
      )
    `;

        return NextResponse.json({message: "Partido procesado exitosamente"}, {status: 201});

    } catch (error: any) {
        console.error('Error al procesar el partido:', {
            message: error.message,
            stack: error.stack,
            receivedData: data || 'No se pudo leer el body del request',
        });

        const errorMessage = error.code === 'P2003'
            ? 'Error de clave foránea: Uno de los IDs de jugador o torneo no existe.'
            : 'Error al procesar el partido en la base de datos.';

        return NextResponse.json(
            {error: errorMessage, details: error.message},
            {status: 500}
        );
    }
}
