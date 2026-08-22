import type { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

/**
 * Control de acceso por lista de usuarios autorizados en BD.
 *
 * - Tabla `usuarios_app` VACÍA  -> modo abierto: cualquier Google entra.
 * - Tabla con al menos un fila  -> SOLO emails activos de la tabla entran.
 *
 * Para activar el modo restringido basta con:
 *   INSERT INTO usuarios_app (email, nombre) VALUES ('admin@atta.com', 'Nombre');
 */

// Cache en memoria del veredicto por email para no golpear la BD en cada
// request. TTL corto: los cambios en usuarios_app aplican en <=60s.
const TTL_MS = 60_000
const cacheAutorizacion = new Map<string, { autorizado: boolean; expira: number }>()

export async function estaAutorizado(email: string | null | undefined): Promise<boolean> {
    if (!email) return false
    const clave = email.toLowerCase()
    const cached = cacheAutorizacion.get(clave)
    if (cached && cached.expira > Date.now()) return cached.autorizado

    let autorizado: boolean
    const totalUsuarios = await prisma.usuarios_app.count()
    if (totalUsuarios === 0) {
        // Modo abierto: nadie cargó la lista de autorizados todavía.
        autorizado = true
    } else {
        const usuario = await prisma.usuarios_app.findFirst({
            where: { email: clave, activo: true },
            select: { id: true, rol: true },
        })
        autorizado = Boolean(usuario)
    }

    cacheAutorizacion.set(clave, { autorizado, expira: Date.now() + TTL_MS })
    return autorizado
}

export const authOptions: NextAuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
    ],
    secret: process.env.NEXTAUTH_SECRET,
    pages: {
        signIn: '/',
    },
    // Sesión persistente: no pedir login nuevamente durante 30 días.
    // El JWT se refresca silenciosamente una vez al día mientras haya uso.
    session: {
        strategy: 'jwt',
        maxAge: 30 * 24 * 60 * 60,
        updateAge: 24 * 60 * 60,
    },
    // Cookies de sesión endurecidas: invisibles a JS, nunca viajan por HTTP
    // en producción y quedan confinadas al sitio (protege contra XSS/CSRF).
    cookies: {
        sessionToken: {
            name:
                process.env.NODE_ENV === 'production'
                    ? '__Secure-next-auth.session-token'
                    : 'next-auth.session-token',
            options: {
                httpOnly: true,
                sameSite: 'lax' as const,
                path: '/',
                secure: process.env.NODE_ENV === 'production',
            },
        },
        callbackUrl: {
            name:
                process.env.NODE_ENV === 'production'
                    ? '__Secure-next-auth.callback-url'
                    : 'next-auth.callback-url',
            options: {
                sameSite: 'lax' as const,
                path: '/',
                secure: process.env.NODE_ENV === 'production',
            },
        },
        csrfToken: {
            name:
                process.env.NODE_ENV === 'production'
                    ? '__Host-next-auth.csrf-token'
                    : 'next-auth.csrf-token',
            options: {
                httpOnly: true,
                sameSite: 'lax' as const,
                path: '/',
                secure: process.env.NODE_ENV === 'production',
            },
        },
    },
    callbacks: {
        async signIn({ user }) {
            return estaAutorizado(user.email)
        },
        async jwt({ token, user }) {
            if (user?.email) {
                const usuario = await prisma.usuarios_app.findFirst({
                    where: { email: user.email.toLowerCase(), activo: true },
                    select: { rol: true },
                }).catch(() => null)
                if (usuario) {
                    token.rol = usuario.rol as 'ADMIN' | 'OPERADOR' | 'LECTURA'
                } else {
                    // Modo abierto (tabla vacía): todos entran como ADMIN.
                    const modoAbierto = (await prisma.usuarios_app.count()) === 0
                    token.rol = modoAbierto ? 'ADMIN' : null
                }
            }
            return token
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.rol = (token.rol as 'ADMIN' | 'OPERADOR' | 'LECTURA' | null) ?? null
            }
            return session
        },
    },
}

/**
 * Guardia de sesión+autorización para rutas API. Devuelve una respuesta
 * 401 si no hay sesión válida o el email no está autorizado; null si OK.
 *
 * Uso:
 *   const unauthorized = await requireAuth()
 *   if (unauthorized) return unauthorized
 */
export async function requireAuth(): Promise<NextResponse | null> {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    if (!(await estaAutorizado(session.user.email))) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }
    return null
}
