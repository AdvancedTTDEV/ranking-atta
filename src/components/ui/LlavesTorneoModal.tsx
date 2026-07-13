'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
    PlayIcon,
    CheckBadgeIcon,
    TrophyIcon,
    ArrowDownTrayIcon,
    PrinterIcon,
} from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { categoriasParaSelector, esTorneoAbiertoTotal } from '@/lib/torneo'

type Jugador = { nombre: string }
type Participante = { nombre_personalizado?: string | null; jugadores?: Jugador | null; miembros: { jugadores: Jugador }[] }
type Partido = {
    id: number
    participante_local_id: number | null
    participante_visitante_id: number | null
    ganador_participante_id: number | null
    ronda_eliminacion: string | null
    posicion_llave: number | null
    sets_local: number
    sets_visitante: number
    estado: string
    participante_local: Participante | null
    participante_visitante: Participante | null
}
type Torneo = {
    id: number
    nombre: string
    modalidad?: string
    abierto?: boolean
    torneo_categorias: { categorias: { id: number; nombre: string } }[]
}

const nombre = (p: Participante | null) =>
    p?.nombre_personalizado
    || p?.miembros.map(m => m.jugadores.nombre).join(' / ')
    || p?.jugadores?.nombre
    || 'BYE'

// Mapa de rondas con su profundidad visual (mayor = ronda más avanzada).
// Se usa para ordenar columnas y para nombrar cuando hay un único partido
// en la última ronda (Final).
const ORDEN_RONDAS: Record<string, number> = {
    '32avos': 0,
    '16avos': 1,
    Octavos: 2,
    Cuartos: 3,
    Semifinal: 4,
    'Final': 5,
}

const CARD_MIN_H = 64

export default function LlavesTorneoModal({
    isOpen,
    onClose,
    torneo,
}: {
    isOpen: boolean
    onClose: () => void
    torneo: Torneo | null
}) {
    const [categoriaId, setCategoriaId] = useState('')
    const [partidos, setPartidos] = useState<Partido[]>([])
    const [loading, setLoading] = useState(false)
    const [generando, setGenerando] = useState(false)
    const [arrastre, setArrastre] = useState<{ partidoId: number; participanteId: number } | null>(null)
    const [confirmando, setConfirmando] = useState(false)
    const [ganadoresBorrador, setGanadoresBorrador] = useState<Record<number, number>>({})
    const [todasCategorias, setTodasCategorias] = useState<{ id: number; nombre: string }[]>([])
    const [descargando, setDescargando] = useState(false)
    const llavesRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        let cancelado = false
        fetch('/api/categorias')
            .then(r => r.ok ? r.json() : [])
            .then(data => { if (!cancelado) setTodasCategorias(Array.isArray(data) ? data : []) })
            .catch(() => { /* silencioso */ })
        return () => { cancelado = true }
    }, [])

    const categorias = categoriasParaSelector(
        torneo?.torneo_categorias,
        todasCategorias,
        torneo?.modalidad,
        torneo?.abierto,
    )
    // El torneo es "totalmente abierto" si la modalidad es DOBLES/EQUIPOS
    // o si el usuario lo marcó como abierto al crearlo (columna `abierto`).
    // En INDIVIDUAL sin marca `abierto`, el selector se mantiene.
    const esAbierto = esTorneoAbiertoTotal(torneo?.modalidad, torneo?.abierto)

    useEffect(() => {
        if (!torneo) {
            setCategoriaId('')
            return
        }
        if (esAbierto) {
            const primera = todasCategorias.find(c => c.nombre === 'primera') || categorias[0]
            if (primera) setCategoriaId(String(primera.id))
            return
        }
        const categoriaValida = categorias.some(c => c.id.toString() === categoriaId)
        if (!categoriaValida) {
            setCategoriaId(categorias[0]?.id.toString() || '')
        }
    }, [torneo, esAbierto, todasCategorias])

    const cargar = async () => {
        if (!torneo || !categoriaId) return
        setLoading(true)
        try {
            const r = await fetch(`/api/torneos/${torneo.id}/llaves?categoriaId=${categoriaId}`)
            const d = await r.json()
            if (!r.ok) throw new Error(d.error)
            setPartidos(d.partidos || [])
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudieron cargar las llaves')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { if (isOpen && categoriaId) cargar() }, [isOpen, categoriaId])

    const generar = async () => {
        if (!torneo || !categoriaId) return
        setGenerando(true)
        try {
            const r = await fetch(`/api/torneos/${torneo.id}/llaves`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoriaId: Number(categoriaId), clasificanPorGrupo: 2 }),
            })
            const d = await r.json()
            if (!r.ok) throw new Error(d.error)
            toast.success('Llaves generadas')
            cargar()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al generar llaves')
        } finally {
            setGenerando(false)
        }
    }

    const confirmarTodo = async () => {
        if (!torneo || Object.keys(ganadoresBorrador).length === 0) return
        setConfirmando(true)
        try {
            const pendientes = Object.entries(ganadoresBorrador).filter(([partidoId]) => {
                const p = partidos.find(x => x.id === Number(partidoId))
                return p && p.estado !== 'FINALIZADO'
            })
            for (const [partidoId, ganadorParticipanteId] of pendientes) {
                const r = await fetch(`/api/torneos/${torneo.id}/llaves/${partidoId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ganadorParticipanteId }),
                })
                const d = await r.json()
                if (!r.ok) throw new Error(d.error)
            }
            setGanadoresBorrador({})
            if (pendientes.length > 0) {
                toast.success('Llave confirmada y ranking actualizado')
            } else {
                toast.success('Nada nuevo que guardar')
            }
            cargar()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo confirmar la llave')
        } finally {
            setConfirmando(false)
        }
    }

    const rondas = useMemo(() => {
        const m = new Map<string, Partido[]>()
        partidos.forEach(p => {
            const k = p.ronda_eliminacion || 'Ronda'
            m.set(k, [...(m.get(k) || []), p])
        })
        return [...m.entries()].sort(([a], [b]) => (ORDEN_RONDAS[a] ?? 99) - (ORDEN_RONDAS[b] ?? 99))
    }, [partidos])

    const handleDescargar = async () => {
        if (!llavesRef.current) return
        setDescargando(true)
        try {
            const { toPng } = await import('html-to-image')
            const originalError = console.error
            console.error = (...args) => {
                if (String(args[0]).includes('cssRules')) return
                originalError(...args)
            }
            // La app usa dark mode forzado (clase `dark` en <html>), por lo
            // que el bracket en pantalla sale oscuro. Para que el screenshot
            // quede con fondo claro y legible, en el clon (que se crea
            // dentro de un <iframe> propio) sobrescribimos las variables
            // CSS con los valores del tema light. El clon es independiente
            // de la página, así que no se ve afectado en pantalla.
            // `onClone` existe en html-to-image en runtime aunque no esté
            // declarado en sus tipos; lo definimos con tipo `any` para
            // silenciar TS sin perder tipado en el resto de las opciones.
            const onClone = (clonedDoc: Document) => {
                // Inyectamos un <style> en el clon que sobrescribe los
                // tokens de color del tema dark a los del tema light.
                // El clon se serializa en el PNG, no afecta la página.
                const style = clonedDoc.createElement('style')
                style.textContent = `
                    :root, :host, html.dark, .dark, * {
                        --color-canvas: #F8FAFC !important;
                        --color-surface: #FFFFFF !important;
                        --color-surface-2: #F8FAFC !important;
                        --color-subtle: #F1F5F9 !important;
                        --color-line: #E2E8F0 !important;
                        --color-line-strong: #CBD5E1 !important;
                        --color-muted: #94A3B8 !important;
                        --color-fg: #0F172A !important;
                        --color-fg-muted: #475569 !important;
                        --color-brand: #2563EB !important;
                        --color-brand-strong: #1D4ED8 !important;
                        --color-brand-soft: #EFF6FF !important;
                        --color-success: #059669 !important;
                        --color-success-soft: #ECFDF5 !important;
                        --color-danger: #E11D48 !important;
                        --color-danger-soft: #FFF1F2 !important;
                        --color-warning: #D97706 !important;
                        --color-warning-soft: #FFFBEB !important;
                        --color-info: #0EA5E9 !important;
                        --color-info-soft: #F0F9FF !important;
                        color-scheme: light !important;
                    }
                    body, html { background: #F8FAFC !important; color: #0F172A !important; }
                `
                clonedDoc.head.appendChild(style)
            }
            const dataUrl = await toPng(llavesRef.current, {
                backgroundColor: '#F8FAFC',
                pixelRatio: 2,
                skipFonts: true,
                filter: (node: Element) => !(node instanceof HTMLLinkElement && node.rel === 'stylesheet'),
                onClone,
            } as any)
            console.error = originalError
            const link = document.createElement('a')
            const cat = categorias.find(c => c.id.toString() === categoriaId)?.nombre ?? categoriaId
            link.download = `llaves-${torneo?.nombre}-${cat}.png`
            link.href = dataUrl
            link.click()
            toast.success('Imagen descargada')
        } catch (error) {
            console.error('Error al descargar:', error)
            toast.error('Error al generar la imagen')
        } finally {
            setDescargando(false)
        }
    }

    const handleImprimir = () => {
        if (!llavesRef.current) return
        const printWindow = window.open('', '_blank', 'width=1400,height=900')
        if (!printWindow) {
            toast.error('Permite ventanas emergentes para imprimir')
            return
        }
        const clone = llavesRef.current.cloneNode(true) as HTMLElement
        // Forzamos el tema light en el documento de impresión con un <style>
        // propio, ya que la ventana nueva no comparte los tokens de la app.
        printWindow.document.write(`
            <!DOCTYPE html><html><head><meta charset="utf-8"/>
            <title>Llaves - ${torneo?.nombre}</title>
            <style>
                * { box-sizing: border-box; }
                :root {
                    --color-canvas: #F8FAFC;
                    --color-surface: #FFFFFF;
                    --color-surface-2: #F8FAFC;
                    --color-subtle: #F1F5F9;
                    --color-line: #E2E8F0;
                    --color-line-strong: #CBD5E1;
                    --color-muted: #94A3B8;
                    --color-fg: #0F172A;
                    --color-fg-muted: #475569;
                    --color-brand: #2563EB;
                    --color-brand-strong: #1D4ED8;
                    --color-brand-soft: #EFF6FF;
                    --color-success: #059669;
                    --color-success-soft: #ECFDF5;
                    --color-warning: #D97706;
                    --color-warning-soft: #FFFBEB;
                    --color-info: #0EA5E9;
                    --color-info-soft: #F0F9FF;
                }
                body { margin: 0; padding: 24px; background: #F8FAFC; color: #0F172A; font-family: system-ui, -apple-system, sans-serif; }
                h1 { margin: 0 0 4px; font-size: 18px; }
                p { margin: 0 0 16px; color: #475569; font-size: 12px; }
                @page { size: A3 landscape; margin: 12mm; }
                @media print {
                    body { padding: 0; }
                    .no-print { display: none !important; }
                }
            </style></head><body>
                <h1>${torneo?.nombre}</h1>
                <p>Llaves de eliminación${esAbierto ? ' · abierto' : ''}</p>
                ${clone.outerHTML}
                <script>setTimeout(() => { window.print(); }, 250);</script>
            </body></html>
        `)
        printWindow.document.close()
    }

    if (!isOpen || !torneo) return null

    const numBorradores = Object.keys(ganadoresBorrador).length
    const hayLlaves = partidos.length > 0

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Llaves de eliminación"
            description="Arrastra ganadores como borrador y confirma una sola vez"
            size="full"
        >
            <div className="-mx-5 -mt-5 mb-4 card-flush overflow-hidden">
                <div className="flex flex-wrap items-end gap-3 p-3 bg-subtle">
                    {!esAbierto && (
                        <Select
                            label="Categoría"
                            value={categoriaId}
                            onChange={e => setCategoriaId(e.target.value)}
                            className="w-full sm:w-56"
                        >
                            {categorias.map(c => (
                                <option key={c.id} value={c.id}>{c.nombre}</option>
                            ))}
                        </Select>
                    )}
                    {esAbierto && (
                        <div className="banner banner-info text-xs flex-1">
                            Torneo abierto: las llaves se arman en <b>primera categoría</b> mezclando a todos los inscritos.
                        </div>
                    )}
                    <Button
                        variant="primary"
                        onClick={generar}
                        isLoading={generando}
                        disabled={confirmando}
                        leadingIcon={<PlayIcon className="h-4 w-4" />}
                    >
                        {generando ? 'Generando...' : 'Generar llaves (top 2)'}
                    </Button>
                    <Button
                        variant="success"
                        onClick={confirmarTodo}
                        isLoading={confirmando}
                        disabled={numBorradores === 0}
                        leadingIcon={<CheckBadgeIcon className="h-4 w-4" />}
                    >
                        {confirmando ? 'Confirmando y actualizando ELO...' : `Confirmar ${numBorradores || ''} resultado(s)`}
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={handleDescargar}
                        isLoading={descargando}
                        disabled={!hayLlaves}
                        leadingIcon={<ArrowDownTrayIcon className="h-4 w-4" />}
                    >
                        {descargando ? 'Descargando...' : 'Imagen'}
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={handleImprimir}
                        disabled={!hayLlaves}
                        leadingIcon={<PrinterIcon className="h-4 w-4" />}
                    >
                        Imprimir
                    </Button>
                </div>
            </div>

            {confirmando && (
                <div className="banner banner-info mb-4 inline-flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    Guardando partidos, aplicando bonos y avanzando ganadores…
                </div>
            )}

            {loading ? (
                <div className="py-16 text-center text-fg-muted">Cargando...</div>
            ) : !hayLlaves ? (
                <div className="py-16 text-center text-fg-muted">
                    Aún no hay llaves. Haz clic en <b>Generar llaves</b> para crearlas a partir de los mejores de cada grupo.
                </div>
            ) : (
                // Este nodo es el que capturamos al imprimir/descargar.
                <div
                    ref={llavesRef}
                    className="bg-canvas rounded-xl p-6 overflow-x-auto"
                >
                    <BracketLayout
                        rondas={rondas}
                        arrastre={arrastre}
                        setArrastre={setArrastre}
                        ganadoresBorrador={ganadoresBorrador}
                        setGanadoresBorrador={setGanadoresBorrador}
                    />
                </div>
            )}
        </Modal>
    )
}

// ──────────────────────────────────────────────────────────────────────────────
//  BracketLayout
//
//  Estructura visual del bracket al estilo torneo de tenis:
//
//    ┌──────────┐ ┌──────────┐ ┌──────────┐
//    │  UPPER   │ │  FINAL   │ │  LOWER   │
//    │ (R1..Rn) │ │  (al     │ │ (R1..Rn) │
//    │ izq      │ │  medio)  │ │ der      │
//    └──────────┘ └──────────┘ └──────────┘
//
//  Regla de split: para un bracket con `cupo` participantes (potencia de
//  2), los partidos de la primera ronda con `posicion_llave <= cupo/4`
//  van al upper; el resto al lower. La ronda final (1 partido) se extrae
//  y se renderiza al medio.
//
//  Con cupo=8: R1[1,2] upper · R1[3,4] lower · R2[1,2] mitad c/u · R3[1]
//  y final al medio.
//  Con cupo=4: R1[1] upper · R1[2] lower · final al medio.
//  Con cupo=2: solo final al medio, sin split.
// ──────────────────────────────────────────────────────────────────────────────

function BracketLayout({
    rondas,
    arrastre,
    setArrastre,
    ganadoresBorrador,
    setGanadoresBorrador,
}: {
    rondas: [string, Partido[]][]
    arrastre: { partidoId: number; participanteId: number } | null
    setArrastre: (a: { partidoId: number; participanteId: number } | null) => void
    ganadoresBorrador: Record<number, number>
    setGanadoresBorrador: React.Dispatch<React.SetStateAction<Record<number, number>>>
}) {
    if (rondas.length === 0) return null

    // Partidos de la primera ronda y la final (si la última ronda es de 1
    // partido, esa es la final; si no, no hay split posible).
    const primeraRonda = rondas[0]?.[1] ?? []
    const ultimaRonda = rondas[rondas.length - 1]?.[1] ?? []
    const hayFinalSeparada = ultimaRonda.length === 1 && rondas.length > 1
    const finalPartido = hayFinalSeparada ? ultimaRonda[0] : null
    const rondasSinFinal = hayFinalSeparada ? rondas.slice(0, -1) : rondas

    // Cupo = 2 * (partidos en R1) = total de participantes en el bracket.
    const cupo = primeraRonda.length * 2
    const limiteUpper = cupo / 4 // cantidad de partidos de R1 que van al upper

    // Split: cada partido va al upper si su `posicion_llave <= limiteUpper`,
    // si no al lower. Como la siembra es 0↔1, 2↔3, ..., 4↔5, etc., la
    // condición `posicion_llave <= cupo/4` (1-indexed) es la correcta.
    const upperR1Ids = new Set<number>()
    const lowerR1Ids = new Set<number>()
    primeraRonda.forEach(p => {
        if ((p.posicion_llave ?? 0) <= limiteUpper) upperR1Ids.add(p.id)
        else lowerR1Ids.add(p.id)
    })

    // Las rondas intermedias (R2, R3, ...) se filtran siguiendo la
    // jerarquía del backend: `rondas[r+1][Math.floor(i/2)]`. Para saber a
    // qué mitad pertenece un partido de la ronda r+1, miramos los partidos
    // de la ronda r (R1 ya está) que lo alimentan.
    const mitadPorPartido = useMemo(() => {
        const out = new Map<number, 'upper' | 'lower'>()
        upperR1Ids.forEach(id => out.set(id, 'upper'))
        lowerR1Ids.forEach(id => out.set(id, 'lower'))
        for (let r = 0; r < rondasSinFinal.length - 1; r++) {
            const juegos = rondasSinFinal[r][1]
            for (let i = 0; i < juegos.length; i++) {
                const src = juegos[i]
                const dst = rondasSinFinal[r + 1][1][Math.floor(i / 2)]
                if (!dst) continue
                // Si src está en upper, dst va a upper; si no, a lower.
                if (out.get(src.id) === 'upper') out.set(dst.id, 'upper')
                else if (out.get(src.id) === 'lower') out.set(dst.id, 'lower')
            }
        }
        return out
    }, [upperR1Ids, lowerR1Ids, rondasSinFinal])

    const upperRondas: [string, Partido[]][] = []
    const lowerRondas: [string, Partido[]][] = []
    rondasSinFinal.forEach(([nombre, juegos]) => {
        const u = juegos.filter(p => mitadPorPartido.get(p.id) === 'upper')
        const l = juegos.filter(p => mitadPorPartido.get(p.id) === 'lower')
        if (u.length > 0) upperRondas.push([nombre, u])
        if (l.length > 0) lowerRondas.push([nombre, l])
    })

    // Edge case: cupo = 2 (solo final). No hay split que mostrar; la final
    // ocupa todo el ancho centrada.
    if (cupo <= 2) {
        return (
            <div className="flex justify-center">
                <FinalColumn
                    final={ultimaRonda[0] ?? null}
                    arrastre={arrastre}
                    setArrastre={setArrastre}
                    ganadoresBorrador={ganadoresBorrador}
                    setGanadoresBorrador={setGanadoresBorrador}
                />
            </div>
        )
    }

    return (
        <div className="flex items-stretch justify-center gap-0">
            <HalfBracket
                lado="upper"
                rondas={upperRondas}
                arrastre={arrastre}
                setArrastre={setArrastre}
                ganadoresBorrador={ganadoresBorrador}
                setGanadoresBorrador={setGanadoresBorrador}
            />
            <FinalColumn
                final={finalPartido}
                arrastre={arrastre}
                setArrastre={setArrastre}
                ganadoresBorrador={ganadoresBorrador}
                setGanadoresBorrador={setGanadoresBorrador}
            />
            <HalfBracket
                lado="lower"
                rondas={lowerRondas}
                arrastre={arrastre}
                setArrastre={setArrastre}
                ganadoresBorrador={ganadoresBorrador}
                setGanadoresBorrador={setGanadoresBorrador}
            />
        </div>
    )
}

// Una mitad del bracket (upper o lower): se renderiza con las rondas de
// izquierda a derecha, los partidos de la última ronda quedan alineados
// con el centro vertical del contenedor (que coincide con la final).
function HalfBracket({
    lado,
    rondas,
    arrastre,
    setArrastre,
    ganadoresBorrador,
    setGanadoresBorrador,
}: {
    lado: 'upper' | 'lower'
    rondas: [string, Partido[]][]
    arrastre: { partidoId: number; participanteId: number } | null
    setArrastre: (a: { partidoId: number; participanteId: number } | null) => void
    ganadoresBorrador: Record<number, number>
    setGanadoresBorrador: React.Dispatch<React.SetStateAction<Record<number, number>>>
}) {
    if (rondas.length === 0) return null
    return (
        <div className={`flex items-stretch ${lado === 'upper' ? 'flex-row' : 'flex-row-reverse'}`}>
            {rondas.map(([ronda, juegos], i) => {
                const esRondaInicial = i === 0
                return (
                    <div key={ronda} className="flex flex-col justify-around min-w-[200px] px-2 py-1">
                        <h3 className="text-center text-[10px] font-bold text-fg-muted uppercase tracking-wider mb-2">
                            {ronda}
                        </h3>
                        <div className="flex flex-col justify-around flex-1 gap-3">
                            {juegos.map(p => (
                                <LlaveCard
                                    key={p.id}
                                    partido={p}
                                    arrastre={arrastre}
                                    setArrastre={setArrastre}
                                    ganadorBorrador={ganadoresBorrador[p.id]}
                                    onDropGanador={() => {
                                        if (arrastre?.partidoId === p.id) {
                                            setGanadoresBorrador(prev => ({ ...prev, [p.id]: arrastre.participanteId }))
                                        }
                                        setArrastre(null)
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

// Columna central con la final. Se renderiza con `justify-center` para que
// la tarjeta de la final quede alineada con el centro vertical del
// contenedor padre (que a su vez es la mitad de la altura entre upper y
// lower).
function FinalColumn({
    final,
    arrastre,
    setArrastre,
    ganadoresBorrador,
    setGanadoresBorrador,
}: {
    final: Partido | null
    arrastre: { partidoId: number; participanteId: number } | null
    setArrastre: (a: { partidoId: number; participanteId: number } | null) => void
    ganadoresBorrador: Record<number, number>
    setGanadoresBorrador: React.Dispatch<React.SetStateAction<Record<number, number>>>
}) {
    return (
        <div className="flex flex-col items-center justify-center min-w-[220px] px-3">
            <h3 className="text-center text-xs font-bold text-warning uppercase tracking-wider mb-3 inline-flex items-center gap-1.5">
                <TrophyIcon className="h-4 w-4" />
                Final
            </h3>
            {final && (
                <div className="w-full">
                    <LlaveCard
                        partido={final}
                        arrastre={arrastre}
                        setArrastre={setArrastre}
                        ganadorBorrador={ganadoresBorrador[final.id]}
                        destacado
                        onDropGanador={() => {
                            if (arrastre?.partidoId === final.id) {
                                setGanadoresBorrador(prev => ({ ...prev, [final.id]: arrastre.participanteId }))
                            }
                            setArrastre(null)
                        }}
                    />
                </div>
            )}
        </div>
    )
}

function LlaveCard({
    partido,
    arrastre,
    setArrastre,
    ganadorBorrador,
    onDropGanador,
    destacado = false,
}: {
    partido: Partido
    arrastre: { partidoId: number; participanteId: number } | null
    setArrastre: (a: { partidoId: number; participanteId: number } | null) => void
    ganadorBorrador?: number
    onDropGanador: () => void
    destacado?: boolean
}) {
    // Partido fantasma: ambos lados null. Se finalizó sin ganador durante
    // la propagación de BYE (p.ej. 5 clasificados → cupo 8 deja huecos).
    // No se muestra como partido a jugar.
    const fantasma = !partido.participante_local_id && !partido.participante_visitante_id
    const finalizado = partido.estado === 'FINALIZADO'
    const ganadorId = partido.ganador_participante_id ?? ganadorBorrador
    const campeon = finalizado && ganadorId
        ? (ganadorId === partido.participante_local_id ? partido.participante_local : partido.participante_visitante)
        : null

    if (fantasma) {
        return (
            <div className="rounded-md border border-dashed border-line bg-subtle/30 h-16 flex items-center justify-center text-[10px] text-fg-muted italic">
                Partido {partido.posicion_llave} · sin cruce
            </div>
        )
    }

    return (
        <div
            onDragOver={e => e.preventDefault()}
            onDrop={onDropGanador}
            className={`relative rounded-md border bg-surface shadow-sm transition-all min-h-16 ${
                destacado ? 'border-warning shadow-warning/20' :
                finalizado ? 'border-success' :
                ganadorBorrador ? 'border-warning' : 'border-line'
            }`}
        >
            <span
                className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-md ${
                    finalizado ? 'bg-success' : ganadorBorrador ? 'bg-warning' : 'bg-line'
                }`}
            />
            <div className="flex flex-col justify-center min-h-16 pl-3 pr-2 py-1.5">
                {[partido.participante_local, partido.participante_visitante].map((p, i) => {
                    const pid = i === 0 ? partido.participante_local_id : partido.participante_visitante_id
                    const esGanador = ganadorId === pid && pid != null
                    return (
                        <div
                            key={i}
                            draggable={!finalizado && !!pid}
                            onDragStart={() => pid && setArrastre({ partidoId: partido.id, participanteId: pid })}
                            className={`flex items-center gap-1.5 text-xs leading-tight cursor-grab truncate py-0.5 ${
                                esGanador ? 'font-bold text-success' : 'text-fg'
                            }`}
                            title={nombre(p)}
                        >
                            {esGanador && (
                                <CheckBadgeIcon className="h-3.5 w-3.5 text-success shrink-0" />
                            )}
                            <span className="truncate">{nombre(p)}</span>
                        </div>
                    )
                })}
            </div>
            <div className="absolute top-0.5 right-1.5 text-[9px] text-fg-muted font-mono">
                #{partido.posicion_llave}
            </div>
            {!finalizado && (
                <div className={`mx-2 mb-2 p-1 text-center text-[10px] font-bold rounded border border-dashed ${
                    ganadorBorrador
                        ? 'text-warning border-warning bg-warning-soft/40'
                        : 'text-fg-muted border-line-strong'
                }`}>
                    {ganadorBorrador ? 'Borrador' : 'Suelta ganador aquí'}
                </div>
            )}
            {campeon && (
                <div className="px-2 py-1.5 bg-warning-soft text-warning text-center text-[11px] font-bold inline-flex items-center justify-center gap-1 w-full rounded-b-md">
                    <TrophyIcon className="h-3.5 w-3.5" />
                    {nombre(campeon)}
                </div>
            )}
        </div>
    )
}
