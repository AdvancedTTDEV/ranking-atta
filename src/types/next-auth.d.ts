import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
    interface Session {
        user: {
            rol: 'ADMIN' | 'OPERADOR' | 'LECTURA' | null
        } & DefaultSession['user']
    }
}

declare module 'next-auth/jwt' {
    interface JWT {
        rol?: 'ADMIN' | 'OPERADOR' | 'LECTURA' | null
    }
}
