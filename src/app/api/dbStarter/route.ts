// app/api/dbStarter/route.tsx
import { NextResponse } from 'next/server'
import prisma  from '@/lib/prisma'

export async function GET() {
    try {
        await prisma.jugadores.findFirst() // o cualquier modelo que tengas
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('DB CONNECTION ERROR:', error)
        return NextResponse.json(
            { success: false, message: 'Database Not Available' },
            { status: 500 }
        )
    }
}
