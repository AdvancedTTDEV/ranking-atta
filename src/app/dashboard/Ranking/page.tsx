'use client'

import useAuthAndDb from '@/app/hooks/useAuthAndDb'
import Modal from '@/components/ui/Modal'
import RankingWrapper from '@/components/dashboard/RankingWrapper'
import AscensosDescensosWrapper from "@/components/dashboard/AscensosDescensosWrapper";

export default function RankingPage() {
    const {
        session,
        status,
        modalOpen,
        handleLogin,
        dbReady,
        loading,
    } = useAuthAndDb()
    return (
        <>
            {/* Modal de login si no hay sesión */}
            <Modal
                isOpen={modalOpen}
                onClose={() => {}}
                title="Inicia sesión"
            >
                <p className="mb-4">Debes iniciar sesión para acceder a esta página</p>
                <button
                    onClick={handleLogin}
                    className="w-full bg-red-500 text-white py-2 rounded-md hover:bg-red-600"
                >
                    Iniciar sesión con Google
                </button>
            </Modal>

            {/* Mensajes mientras se conecta a la DB */}
            {loading && <p className="text-center mt-4">Conectando a la base de datos...</p>}

            {/* Contenido del dashboard solo si hay sesión y DB lista */}
            {session && dbReady && (
                <div className="space-y-6">
                    <div className="bg-white rounded-lg shadow p-4">
                        <h1 className="text-2xl font-bold text-gray-800">Ranking</h1>
                        <p className="text-gray-600">visualiza el ranking</p>
                    </div>
                    <AscensosDescensosWrapper/>
                    <RankingWrapper/>
                </div>
            )}

            {/* Mensaje si la DB no está lista */}
            {session && !dbReady && !loading && (
                <p className="text-center mt-4 text-red-500">
                    La base de datos no está lista. Intenta recargar.
                </p>
            )}
        </>
    )
}