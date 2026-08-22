import { CalendarDaysIcon, Squares2X2Icon, TrophyIcon, UserGroupIcon } from '@heroicons/react/24/outline'

export type DestinoModal = 'inscripcion' | 'grupos' | 'partidos' | 'llaves'

const PASOS: { destino: DestinoModal; etiqueta: string; Icono: typeof TrophyIcon }[] = [
    { destino: 'inscripcion', etiqueta: 'Inscripción', Icono: UserGroupIcon },
    { destino: 'grupos', etiqueta: 'Grupos', Icono: Squares2X2Icon },
    { destino: 'partidos', etiqueta: 'Partidos', Icono: CalendarDaysIcon },
    { destino: 'llaves', etiqueta: 'Llaves', Icono: TrophyIcon },
]

interface Props {
    /** Sección actualmente abierta (se muestra resaltada y no clicable). */
    activo: DestinoModal
    /** Al faltar, la barra no se renderiza (modales sin navegación). */
    onNavegar?: (destino: DestinoModal) => void
}

/**
 * Barra de navegación inferior compartida por los modales de gestión del
 * torneo: permite saltar entre Inscripción → Grupos → Partidos → Llaves
 * sin cerrar y reabrir desde el listado.
 */
export default function NavegacionModales({ activo, onNavegar }: Props) {
    if (!onNavegar) return null
    return (
        <nav
            aria-label="Navegación del torneo"
            className="flex items-center justify-center flex-wrap gap-1 sm:gap-1.5"
        >
            {PASOS.map((paso, i) => {
                const esActivo = paso.destino === activo
                return (
                    <div key={paso.destino} className="flex items-center">
                        <button
                            type="button"
                            disabled={esActivo}
                            onClick={() => onNavegar(paso.destino)}
                            title={esActivo ? `Estás en ${paso.etiqueta}` : `Ir a ${paso.etiqueta}`}
                            aria-current={esActivo ? 'page' : undefined}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                                esActivo
                                    ? 'bg-brand text-white cursor-default'
                                    : 'text-fg-muted hover:text-fg hover:bg-subtle border border-line'
                            }`}
                        >
                            <paso.Icono className="h-4 w-4" />
                            {paso.etiqueta}
                        </button>
                        {i < PASOS.length - 1 && (
                            <span aria-hidden="true" className="mx-0.5 text-line select-none">›</span>
                        )}
                    </div>
                )
            })}
        </nav>
    )
}
