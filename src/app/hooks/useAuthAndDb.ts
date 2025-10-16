// /hooks/useAuthAndDb.ts
'use client'

import { useState, useEffect } from 'react'
import { useSession, signIn } from 'next-auth/react'

export default function useAuthAndDb() {
    const { data: session, status } = useSession()
    const [modalOpen, setModalOpen] = useState(false)
    const [dbReady, setDbReady] = useState(false)
    const [loading, setLoading] = useState(false)

    // Revisar sesión al montar
    useEffect(() => {
        if (status === 'unauthenticated') {
            setModalOpen(true)
        } else if (status === 'authenticated') {
            checkDatabase()
        }
    }, [status])

    const checkDatabase = async () => {
        setLoading(true)
        const maxAttempts = 5
        let attempt = 0

        while (attempt < maxAttempts) {
            try {
                const res = await fetch('/api/dbStarter')
                const data = await res.json()

                if (data.success) {
                    setDbReady(true)
                    setLoading(false)
                    return
                }
            } catch (err) {
                console.warn(`Intento ${attempt + 1} fallido`, err)
            }
            attempt++
            await new Promise((resolve) => setTimeout(resolve, 3000))
        }

        setDbReady(false)
        setLoading(false)
    }

    const handleLogin = () => {
        setModalOpen(false)
        signIn('google')
    }

    return {
        session,
        status,
        modalOpen,
        setModalOpen,
        dbReady,
        loading,
        handleLogin,
    }
}
