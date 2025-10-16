"use client";

import ClubesWrapper from '@/components/dashboard/ClubesWrapper';
import JugadoresWrapper from '@/components/dashboard/JugadoresWrapper';
import TorneosWrapper from '@/components/dashboard/TorneosWrapper';
import PartidosWrapper from '@/components/dashboard/PartidosWrapper';
import EstadisticasWrapper from '@/components/dashboard/EstadisticasWrapper';
import Modal from '@/components/ui/Modal'
import useAuthAndDb from '@/app/hooks/useAuthAndDb'

export default function DashboardPage() {
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
            {session && dbReady && (
                <div className="space-y-6">
                    <div className="bg-white rounded-lg shadow p-4">
                        <h1 className="text-2xl font-bold text-gray-800">Panel de Control</h1>
                        <p className="text-gray-600">Bienvenido al sistema de gestión de Advanced Table Tennis Academy</p>
                    </div>

                    <EstadisticasWrapper />

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-1">
                            <ClubesWrapper />
                        </div>
                        <div className="lg:col-span-2">
                            <JugadoresWrapper />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <TorneosWrapper />
                        <PartidosWrapper />
                    </div>
                </div>
            )}
            {/* Mensaje si la DB no está lista */}
            {session && !dbReady && !loading && (
                <p className="text-center mt-4 text-red-500">
                    La base de datos no está lista. Intenta recargar.
                </p>
            )}
        </>
    );
}