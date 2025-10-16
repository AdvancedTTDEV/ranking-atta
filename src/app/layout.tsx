import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Header from '@/components/ui/Header'
import { Toaster } from 'react-hot-toast'
import Providers from './providers' // 👈 lo agregamos

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
    title: 'Gestión Torneos Tenis de Mesa',
    description: 'Sistema para administrar torneos de tenis de mesa',
    icons: '/logo.jpg',
}

export default function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode
}) {
    return (
        <html lang="es">
        <body className={`${inter.className} bg-gray-50`}>
        <Providers> {/* ✅ Envolvemos toda la app */}
            <Header />
            <main className="container mx-auto p-4">{children}</main>
            <Toaster position="top-right" />
        </Providers>
        </body>
        </html>
    )
}
