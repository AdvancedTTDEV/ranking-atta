import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import Providers from './providers'
import BannerCookies from '@/components/ui/BannerCookies'

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
        <html lang="es" className="dark">
        <body className={`${inter.className} bg-canvas text-fg min-h-screen antialiased`}>
        <Providers>
            {children}
            <BannerCookies />
            <Toaster
                position="top-right"
                toastOptions={{
                    style: {
                        background: 'var(--color-surface)',
                        color: 'var(--color-fg)',
                        border: '1px solid var(--color-line)',
                    },
                }}
            />
        </Providers>
        </body>
        </html>
    )
}
