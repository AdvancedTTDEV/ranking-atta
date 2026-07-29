'use client'

import { useEffect, useMemo, useState } from 'react'
import {
    ArrowLeftIcon, ArrowRightIcon, CheckCircleIcon, MagnifyingGlassIcon, XMarkIcon, UsersIcon, TrophyIcon,
} from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { toast } from 'react-hot-toast'
import {
    LETRAS_LOCALES, LETRAS_VISITANTES,
    matchupsEstandar, resolverMatchup,
    asignacionPorDefecto,
    type LetraLocal, type LetraVisitante, type Asignacion,
} from '@/lib/torneo/matchups'

// ── Tipos ────────────────────────────────────────────────────────────

interface Jugador { id: number; nombre: string }
interface Miembro { jugador_id: number; jugadores: Jugador }
interface Participante {
    id: number
    nombre_personalizado?: string | null
    jugadores?: Jugador | null
    miembros: Miembro[]
}
interface DetalleLite {
    id: number
    orden: number
    tipo: 'DOBLES' | 'INDIVIDUAL'
    jugadores: { jugador_id: number; lado: 'LOCAL' | 'VISITANTE'; jugadores: Jugador }[]
}
interface PartidoLite {
    id: number
    orden: number
    detalles: DetalleLite[]
}

type WizardStep = 'seleccion-lado' | 'asignar-letras' | 'revisar-matchups'

const PASOS: { id: WizardStep; label: string; idx: number }[] = [
    { id: 'seleccion-lado', label: 'Lados', idx: 1 },
    { id: 'asignar-letras', label: 'Jugadores', idx: 2 },
    { id: 'revisar-matchups', label: 'Matchups', idx: 3 },
]

const LETRAS_LOC: readonly LetraLocal[] = LETRAS_LOCALES
const LETRAS_VIS: readonly LetraVisitante[] = LETRAS_VISITANTES

function nombreEquipo(p: Participante): string {
    return p.nombre_personalizado?.trim()
        || p.miembros.map(m => m.jugadores.nombre).join(' / ')
        || p.jugadores?.nombre
        || 'Equipo'
}

function miembrosComoLista(p: Participante): Jugador[] {
    return p.miembros.map(m => m.jugadores)
}

// ── Componente principal ─────────────────────────────────────────────

interface Props {
    isOpen: boolean
    onClose: () => void
    torneo: { id: number; nombre: string }
    categoria: string
    grupoId: number
    equipos: { local: Participante; visitante: Participante }
    partidos: PartidoLite[]
    modalidad: 'DOBLES' | 'EQUIPOS'
    /** Callback al guardar exitosamente (para refrescar listas). */
    onGuardado?: () => void
}

export default function EncuentroEquiposWizardModal({
    isOpen, onClose, torneo, categoria, grupoId, equipos, partidos, modalidad, onGuardado,
}: Props) {
    const [step, setStep] = useState<WizardStep>('seleccion-lado')
    /** Qué equipo juega con el lado ABC. El otro juega XYZ. */
    const [ladoAbc, setLadoAbc] = useState<'local' | 'visitante' | null>(null)
    /** Asignación de jugadores por letra, para el equipo ABC y XYZ. */
    const [asignacion, setAsignacion] = useState<Asignacion>({ abc: {}, xyz: {} })
    const [guardando, setGuardando] = useState(false)

    // Solo 3 letras por lado (A/B/C y X/Y/Z). Esto es independiente de la
    // modalidad: DOBLES usa 2 de las 3 letras y EQUIPOS las usa todas.
    const cantLetras = 3

    // Al abrir el modal: pre-seleccionar lados (local por defecto si el grupo
    // lo tiene) y pre-rellenar la asignación con el orden natural del roster
    // de cada equipo.
    useEffect(() => {
        if (!isOpen) return
        setStep('seleccion-lado')
        setLadoAbc('local')

        const idsRosterAbc = equipos.local.miembros.map(m => m.jugadores.id)
        const idsRosterXyz = equipos.visitante.miembros.map(m => m.jugadores.id)
        const baseDefecto = asignacionPorDefecto(idsRosterAbc, idsRosterXyz, modalidad)

        // Si en BD ya hay alineaciones guardadas en los partidos del grupo,
        // las usamos como fuente de verdad. Tomamos la del PRIMER partido
        // (todas las series del grupo comparten la misma asignación).
        const desdeBd = leerAsignacionDesdeBd(partidos)
        if (desdeBd) {
            setAsignacion(desdeBd)
        } else {
            setAsignacion(baseDefecto)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, grupoId, modalidad])

    const equipoAbc = ladoAbc === 'local' ? equipos.local
        : ladoAbc === 'visitante' ? equipos.visitante
        : null
    const equipoXyz = ladoAbc === 'local' ? equipos.visitante
        : ladoAbc === 'visitante' ? equipos.local
        : null

    const irA = (siguiente: WizardStep) => {
        if (siguiente !== 'seleccion-lado' && !ladoAbc) return
        if (siguiente === 'revisar-matchups' && !asignacionCompleta) return
        setStep(siguiente)
    }
    const atras = () => {
        const idx = PASOS.findIndex(p => p.id === step)
        if (idx > 0) setStep(PASOS[idx - 1].id)
    }

    const setLetraAbc = (letra: LetraLocal, jugadorId: number) => {
        setAsignacion(prev => ({ ...prev, abc: { ...prev.abc, [letra]: jugadorId } }))
    }
    const setLetraXyz = (letra: LetraVisitante, jugadorId: number) => {
        setAsignacion(prev => ({ ...prev, xyz: { ...prev.xyz, [letra]: jugadorId } }))
    }

    /** Verifica que TODAS las letras requeridas estén asignadas. */
    const asignacionCompleta = useMemo(() => {
        if (!ladoAbc) return false
        for (let i = 0; i < cantLetras; i++) {
            if (!asignacion.abc[LETRAS_LOC[i]] || !asignacion.xyz[LETRAS_VIS[i]]) return false
        }
        return true
    }, [asignacion, ladoAbc, cantLetras])

    /**
     * Guarda la asignación como alineación de CADA partido del grupo.
     * Como el endpoint PUT /alineacion es por `partidoId`, mandamos N
     * requests en paralelo (uno por partido) con la misma asignación
     * para su detalle DOBLES (DOBLES) o para sus 5 detalles (EQUIPOS).
     */
    const guardarAlineacion = async () => {
        if (!ladoAbc || !asignacionCompleta) return
        const matchups = matchupsEstandar(modalidad)

        // Para CADA partido, calculamos los jugadores por detalle y mandamos
        // un PUT con todos los detalles del partido que tienen jugadores
        // asignados.
        const requests = partidos.map(async partido => {
            const detallesPayload: Array<{
                detalle_id: number
                jugadores_local_ids: Array<number | string>
                jugadores_visitante_ids: Array<number | string>
            }> = []

            // Para EQUIPOS: asignar 1 detalle por matchup (DOBLES, INDIVIDUAL×4).
            // Para DOBLES: 1 solo detalle (el DOBLES del partido).
            if (modalidad === 'EQUIPOS') {
                partido.detalles
                    .slice() // copia
                    .sort((a, b) => a.orden - b.orden)
                    .forEach((detalle, idx) => {
                        const matchup = matchups[idx]
                        if (!matchup) return
                        const resol = resolverMatchup(matchup, asignacion)
                        if (!resol) return
                        detallesPayload.push({
                            detalle_id: detalle.id,
                            jugadores_local_ids: resol.local,
                            jugadores_visitante_ids: resol.visitante,
                        })
                    })
            } else {
                // DOBLES: 1 único detalle (DOBLES).
                const detalle = partido.detalles.find(d => d.tipo === 'DOBLES')
                if (!detalle) return
                const matchup = matchups[0]
                if (!matchup) return
                const resol = resolverMatchup(matchup, asignacion)
                if (!resol) return
                detallesPayload.push({
                    detalle_id: detalle.id,
                    jugadores_local_ids: resol.local,
                    jugadores_visitante_ids: resol.visitante,
                })
            }

            if (detallesPayload.length === 0) return
            const r = await fetch(
                `/api/torneos/${torneo.id}/partidos/${partido.id}/alineacion`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ detalles: detallesPayload }),
                },
            )
            if (!r.ok) {
                const data = await r.json().catch(() => ({}))
                throw new Error(data.error || `HTTP ${r.status} en partido ${partido.id}`)
            }
        })

        setGuardando(true)
        try {
            await Promise.all(requests)
            toast.success(
                partidos.length === 1
                    ? 'Alineación guardada'
                    : `Alineación guardada para ${partidos.length} partidos del grupo`,
            )
            setStep('revisar-matchups')
            onGuardado?.()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Error al guardar')
        } finally {
            setGuardando(false)
        }
    }

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={partidos.length === 1
                ? `Alineación del partido`
                : `Alineación del grupo · ${partidos.length} partidos`}
            description={`${torneo.nombre} · ${categoria}${modalidad === 'DOBLES' ? ' · Dobles' : ' · Equipos'}`}
            size="full"
            footer={
                <div className="flex items-center justify-between w-full">
                    <Button
                        variant="ghost"
                        onClick={atras}
                        disabled={step === 'seleccion-lado'}
                        leadingIcon={<ArrowLeftIcon className="h-4 w-4" />}
                    >
                        Atrás
                    </Button>
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" onClick={onClose} leadingIcon={<XMarkIcon className="h-4 w-4" />}>
                            Cerrar
                        </Button>
                        {step === 'seleccion-lado' && (
                            <Button
                                variant="success"
                                onClick={() => irA('asignar-letras')}
                                disabled={!ladoAbc}
                                trailingIcon={<ArrowRightIcon className="h-4 w-4" />}
                            >
                                Siguiente
                            </Button>
                        )}
                        {step === 'asignar-letras' && (
                            <Button
                                variant="success"
                                onClick={() => irA('revisar-matchups')}
                                disabled={!asignacionCompleta}
                                trailingIcon={<ArrowRightIcon className="h-4 w-4" />}
                            >
                                Revisar matchups
                            </Button>
                        )}
                        {step === 'revisar-matchups' && (
                            <>
                                <Button
                                    variant="primary"
                                    onClick={guardarAlineacion}
                                    isLoading={guardando}
                                    leadingIcon={<CheckCircleIcon className="h-4 w-4" />}
                                >
                                    {guardando ? 'Guardando…' : 'Aceptar y guardar'}
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            }
        >
            <Stepper step={step} />
            <div className="mt-5 min-h-[320px]">
                {step === 'seleccion-lado' && (
                    <PasoSeleccionLado
                        localNombre={nombreEquipo(equipos.local)}
                        visitanteNombre={nombreEquipo(equipos.visitante)}
                        ladoAbc={ladoAbc}
                        onElegir={setLadoAbc}
                    />
                )}
                {step === 'asignar-letras' && equipoAbc && equipoXyz && (
                    <PasoAsignarLetras
                        equipoAbc={equipoAbc}
                        equipoXyz={equipoXyz}
                        asignacion={asignacion}
                        setLetraAbc={setLetraAbc}
                        setLetraXyz={setLetraXyz}
                        modalidad={modalidad}
                        cantLetras={cantLetras}
                    />
                )}
                {step === 'revisar-matchups' && (
                    <PasoRevisarMatchups
                        partidos={partidos}
                        equipos={equipos}
                        asignacion={asignacion}
                        ladoAbc={ladoAbc}
                        modalidad={modalidad}
                    />
                )}
            </div>
        </Modal>
    )
}

/** Lee una asignación existente desde los `detalles[].jugadores` de los
 *  partidos del grupo (toma los del primer partido). Devuelve null si
 *  no hay alineaciones guardadas. */
function leerAsignacionDesdeBd(partidos: PartidoLite[]): Asignacion | null {
    // Para DOBLES miramos el detalle DOBLES del primer partido.
    // Para EQUIPOS miramos TODOS los detalles del primer partido (los 5)
    // y mapeamos por posición. Para esta lectura rápida usamos el detalle
    // DOBLES (B+C vs Y+Z = nos da B, C, Y, Z) + el primer individual
    // (A vs X). Las demás letras las inferimos: si solo hay 2 detalles
    // con jugadores, las letras restantes quedan sin asignar.
    const partido = partidos[0]
    if (!partido) return null
    const detalles = partido.detalles
    const abc: Partial<Record<LetraLocal, number>> = {}
    const xyz: Partial<Record<LetraVisitante, number>> = {}
    let anyoSet = false

    // Detalle DOBLES (orden 1) → B+C vs Y+Z
    const dobles = detalles.find(d => d.tipo === 'DOBLES')
    if (dobles) {
        const locales = dobles.jugadores.filter(j => j.lado === 'LOCAL').map(j => j.jugador_id)
        const visit = dobles.jugadores.filter(j => j.lado === 'VISITANTE').map(j => j.jugador_id)
        if (locales[0]) { abc.B = locales[0]; anyoSet = true }
        if (locales[1]) { abc.C = locales[1]; anyoSet = true }
        if (visit[0]) { xyz.Y = visit[0]; anyoSet = true }
        if (visit[1]) { xyz.Z = visit[1]; anyoSet = true }
    }
    // Detalles INDIVIDUALES: el primero (orden 2) es A vs X, el tercero
    // (orden 4) es A vs Y, etc.
    const individuales = detalles.filter(d => d.tipo === 'INDIVIDUAL').sort((a, b) => a.orden - b.orden)
    individuales.forEach((detalle, idx) => {
        const localId = detalle.jugadores.find(j => j.lado === 'LOCAL')?.jugador_id
        const visitId = detalle.jugadores.find(j => j.lado === 'VISITANTE')?.jugador_id
        // 1 → A vs X (orden 2); 2 → C vs Z (orden 3); 3 → A vs Y (orden 4);
        // 4 → B vs X (orden 5). Pero ya tenemos B,C,Y,Z desde el dobles,
        // así que solo completamos lo que falte: A y X (siempre).
        // Como ya asignamos B,C en el paso anteriores, priorizamos no
        // sobrescribirlas aquí: si B o C están asignados y los
        // individuales proponen letras distintas, mantenemos las del
        // dobles.
        if (idx === 0 && localId) { abc.A = localId; anyoSet = true }
        if (idx === 0 && visitId) { xyz.X = visitId; anyoSet = true }
    })

    return anyoSet ? { abc, xyz } : null
}

// ── Stepper ──────────────────────────────────────────────────────────

function Stepper({ step }: { step: WizardStep }) {
    const idxActual = PASOS.findIndex(p => p.id === step)
    return (
        <ol className="flex items-center gap-1 text-xs">
            {PASOS.map((p, i) => (
                <li key={p.id} className="flex items-center gap-1">
                    <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-bold transition-colors ${
                            i === idxActual
                                ? 'bg-brand text-on-brand'
                                : i < idxActual
                                ? 'bg-brand/20 text-brand'
                                : 'bg-subtle text-fg-muted'
                        }`}
                    >
                        {i < idxActual ? '✓' : p.idx}
                    </span>
                    <span
                        className={`pr-2 ${
                            i === idxActual ? 'font-semibold text-fg' : 'text-fg-muted'
                        }`}
                    >
                        {p.label}
                    </span>
                    {i < PASOS.length - 1 && <span className="text-fg-muted">›</span>}
                </li>
            ))}
        </ol>
    )
}

// ── Paso 1: Selección de lado ────────────────────────────────────────

function PasoSeleccionLado({
    localNombre, visitanteNombre, ladoAbc, onElegir,
}: {
    localNombre: string
    visitanteNombre: string
    ladoAbc: 'local' | 'visitante' | null
    onElegir: (eq: 'local' | 'visitante') => void
}) {
    const clasesBoton = (eq: 'local' | 'visitante', textoSi: string) => {
        const activo = ladoAbc === eq
        const inactivo = ladoAbc !== null && !activo
        return [
            'card-flush p-5 text-center transition-all relative',
            activo ? 'ring-2 ring-brand bg-brand-soft/30'
            : inactivo ? 'opacity-50 hover:opacity-80'
            : 'hover:bg-brand-soft/30',
        ].join(' ')
    }
    return (
        <div className="py-6 text-center">
            <p className="text-base text-fg">
                ¿<b>Qué equipo</b> será <span className="font-mono">ABC</span> y cuál <span className="font-mono">XYZ</span>?
            </p>
            <p className="text-sm text-fg-muted mt-1">
                Esto se elige según las hojas de alineación que te entregaron los capitanes.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-4 max-w-2xl mx-auto">
                <button
                    type="button"
                    onClick={() => onElegir('local')}
                    aria-pressed={ladoAbc === 'local'}
                    className={clasesBoton('local', 'ABC')}
                >
                    {ladoAbc === 'local' && (
                        <CheckCircleIcon className="absolute top-3 right-3 h-6 w-6 text-brand" />
                    )}
                    <Badge variant="brand" className="mb-2">LOCAL</Badge>
                    <div className="text-base font-semibold text-fg">{localNombre}</div>
                    <div className="text-xs text-fg-muted mt-1">Será ABC</div>
                </button>
                <button
                    type="button"
                    onClick={() => onElegir('visitante')}
                    aria-pressed={ladoAbc === 'visitante'}
                    className={clasesBoton('visitante', 'ABC')}
                >
                    {ladoAbc === 'visitante' && (
                        <CheckCircleIcon className="absolute top-3 right-3 h-6 w-6 text-brand" />
                    )}
                    <Badge variant="warning" className="mb-2">VISITANTE</Badge>
                    <div className="text-base font-semibold text-fg">{visitanteNombre}</div>
                    <div className="text-xs text-fg-muted mt-1">Será XYZ</div>
                </button>
            </div>
        </div>
    )
}

// ── Paso 2: Asignar letras ──────────────────────────────────────────

function PasoAsignarLetras({
    equipoAbc, equipoXyz, asignacion, setLetraAbc, setLetraXyz, modalidad, cantLetras,
}: {
    equipoAbc: Participante
    equipoXyz: Participante
    asignacion: Asignacion
    setLetraAbc: (l: LetraLocal, id: number) => void
    setLetraXyz: (l: LetraVisitante, id: number) => void
    modalidad: 'DOBLES' | 'EQUIPOS'
    cantLetras: number
}) {
    return (
        <div className="py-2">
            <p className="text-sm text-fg-muted mb-3">
                Para cada letra, elige el jugador que la ocupa. Por defecto ya están los primeros del roster
                en orden, pero puedes reasignar escribiendo <b>nombre o ID</b>. Esta asignación se usa en
                TODOS los partidos {modalidad === 'EQUIPOS' ? 'del grupo' : ''}.
            </p>
            <div className="grid grid-cols-2 gap-4">
                <div className="card-flush">
                    <div className="px-4 py-2 bg-brand-soft border-b border-line text-xs font-bold text-fg uppercase tracking-wider flex items-center gap-2">
                        <Badge variant="brand">ABC</Badge>
                        {nombreEquipo(equipoAbc)}
                    </div>
                    <div className="p-3 space-y-2">
                        {LETRAS_LOC.slice(0, cantLetras).map(letra => (
                            <SelectorJugador
                                key={letra}
                                letra={letra}
                                miembros={miembrosComoLista(equipoAbc)}
                                excluirIds={Object.values(asignacion.abc).filter(id => id > 0 && id !== (asignacion.abc[letra] ?? 0))}
                                valor={asignacion.abc[letra] ?? 0}
                                onChange={(id) => setLetraAbc(letra, id)}
                            />
                        ))}
                    </div>
                </div>
                <div className="card-flush">
                    <div className="px-4 py-2 bg-warning-soft border-b border-line text-xs font-bold text-fg uppercase tracking-wider flex items-center gap-2">
                        <Badge variant="warning">XYZ</Badge>
                        {nombreEquipo(equipoXyz)}
                    </div>
                    <div className="p-3 space-y-2">
                        {LETRAS_VIS.slice(0, cantLetras).map(letra => (
                            <SelectorJugador
                                key={letra}
                                letra={letra}
                                miembros={miembrosComoLista(equipoXyz)}
                                excluirIds={Object.values(asignacion.xyz).filter(id => id > 0 && id !== (asignacion.xyz[letra] ?? 0))}
                                valor={asignacion.xyz[letra] ?? 0}
                                onChange={(id) => setLetraXyz(letra, id)}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

function SelectorJugador({
    letra, miembros, excluirIds = [], valor, onChange,
}: {
    letra: string
    miembros: Jugador[]
    /** IDs ya asignados a OTRA letra (no se muestran en la lista). */
    excluirIds?: number[]
    valor: number
    onChange: (id: number) => void
}) {
    const [searchTerm, setSearchTerm] = useState('')
    const [open, setOpen] = useState(false)

    const seleccionado = valor > 0
        ? miembros.find(m => m.id === valor)
        : undefined

    const excluir = new Set(excluirIds)
    const candidatos = miembros.filter(m => !excluir.has(m.id))
    const sugerencias = !searchTerm.trim()
        ? candidatos
        : candidatos.filter(m =>
            m.nombre.toLowerCase().includes(searchTerm.toLowerCase())
            || m.id.toString().includes(searchTerm.trim())
        )

    const elegir = (id: number) => {
        onChange(id)
        setSearchTerm('')
        setOpen(false)
    }
    const limpiar = () => {
        onChange(0)
        setSearchTerm('')
    }

    if (seleccionado) {
        return (
            <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded bg-brand text-on-brand font-bold text-sm shrink-0">
                    {letra}
                </span>
                <div className="flex-1 flex items-center gap-1.5 px-2 py-1 bg-brand-soft border border-brand rounded text-sm">
                    <span className="font-mono text-brand text-xs">{seleccionado.id}</span>
                    <span className="text-fg font-medium flex-1 truncate">{seleccionado.nombre}</span>
                    <button
                        type="button"
                        onClick={limpiar}
                        className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-brand/20 transition-colors text-brand"
                        aria-label={`Quitar a ${seleccionado.nombre}`}
                        title="Quitar selección"
                    >
                        <XMarkIcon className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded bg-subtle text-fg-muted font-bold text-sm shrink-0">
                {letra}
            </span>
            <div className="relative flex-1">
                <div className="flex items-center gap-2 px-2 py-1 bg-surface border border-line rounded focus-within:ring-1 focus-within:ring-brand">
                    <MagnifyingGlassIcon className="h-4 w-4 text-fg-muted shrink-0" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={e => { setSearchTerm(e.target.value); setOpen(true) }}
                        onFocus={() => setOpen(true)}
                        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
                        placeholder="Escribe nombre o ID…"
                        className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-fg-muted"
                    />
                </div>
                {open && sugerencias.length > 0 && (
                    <ul className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto card-flush shadow-lg border border-line">
                        {sugerencias.slice(0, 6).map(m => (
                            <li key={m.id}>
                                <button
                                    type="button"
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={() => elegir(m.id)}
                                    className="w-full text-left px-2.5 py-1.5 hover:bg-subtle transition-colors flex items-center gap-2 text-sm"
                                >
                                    <span className="font-mono text-fg-muted text-xs shrink-0">{m.id}</span>
                                    <span className="text-fg truncate">{m.nombre}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}

// ── Paso 3: Revisar matchups ────────────────────────────────────────

function PasoRevisarMatchups({
    partidos, equipos, asignacion, ladoAbc, modalidad,
}: {
    partidos: PartidoLite[]
    equipos: { local: Participante; visitante: Participante }
    asignacion: Asignacion
    ladoAbc: 'local' | 'visitante' | null
    modalidad: 'DOBLES' | 'EQUIPOS'
}) {
    const poolAbc = ladoAbc === 'visitante' ? equipos.visitante.miembros.map(m => m.jugadores) : equipos.local.miembros.map(m => m.jugadores)
    const poolXyz = ladoAbc === 'visitante' ? equipos.local.miembros.map(m => m.jugadores) : equipos.visitante.miembros.map(m => m.jugadores)
    const jugadorPor = (pool: Jugador[], id: number | undefined) =>
        id ? pool.find(j => j.id === id)?.nombre ?? `#${id}` : '—'
    const matchups = matchupsEstandar(modalidad)

    return (
        <div className="py-4">
            <p className="text-sm text-fg-muted mb-3">
                Estos son los cruces que se registrarán en cada partido. Confirma con
                <b> Aceptar y guardar</b> para persistir la alineación.
            </p>
            <div className="card-flush overflow-hidden">
                <div className="px-4 py-2 bg-subtle border-b border-line text-xs font-bold text-fg-muted uppercase tracking-wider flex items-center gap-2">
                    <UsersIcon className="h-3.5 w-3.5" />
                    Resumen de {partidos.length} partido{partidos.length === 1 ? '' : 's'}
                </div>
                <div className="overflow-x-auto">
                    <table className="table-compact">
                        <thead>
                            <tr>
                                <th className="w-10">#</th>
                                <th>LOCAL · {ladoAbc === 'visitante' ? nombreEquipo(equipos.visitante) : nombreEquipo(equipos.local)}</th>
                                <th className="w-10">vs</th>
                                <th>VISITANTE · {ladoAbc === 'visitante' ? nombreEquipo(equipos.local) : nombreEquipo(equipos.visitante)}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {partidos.map((partido, idxPartido) => {
                                // Para cada partido del grupo, renderizamos los
                                // matchups que aplican (1 para DOBLES, hasta 5
                                // para EQUIPOS). Como todos los partidos del
                                // grupo usan los MISMOS matchups, podemos
                                // repetirlos o limitarnos a idxPartido === 0.
                                // Si solo hay 1 partido: mostramos los N
                                // matchups como filas. Si hay varios:
                                // mostramos 1 fila por partido, cada fila con
                                // el primer matchup (DOBLES) si la modalidad
                                // es DOBLES, o la lista completa si es
                                // EQUIPOS.
                                if (modalidad === 'EQUIPOS') {
                                    return matchups.map((m, idxM) => {
                                        const letrasLoc = Array.isArray(m.cruces.local) ? m.cruces.local : [m.cruces.local]
                                        const letrasVis = Array.isArray(m.cruces.visitante) ? m.cruces.visitante : [m.cruces.visitante]
                                        const tag = m.tipo === 'DOBLES' ? 'DOB' : `IND ${idxM}`
                                        return (
                                            <tr key={`${partido.id}-${idxM}`}>
                                                <td className="text-center text-xs text-fg-muted font-mono">
                                                    {partidos.length > 1 ? `${partido.orden}.` : ''}
                                                </td>
                                                <td>
                                                    <div className="flex items-start gap-1">
                                                        <Badge variant={m.tipo === 'DOBLES' ? 'warning' : 'brand'}>{tag}</Badge>
                                                        <div className="text-sm">
                                                            <div className="text-xs text-fg-muted font-mono">{letrasLoc.join('+')}</div>
                                                            {letrasLoc.map((l, i) => (
                                                                <div key={i}>{jugadorPor(poolAbc, asignacion.abc[l])}</div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="text-fg-muted text-center">vs</td>
                                                <td>
                                                    <div className="flex items-start gap-1">
                                                        <div className="text-sm">
                                                            <div className="text-xs text-fg-muted font-mono">{letrasVis.join('+')}</div>
                                                            {letrasVis.map((l, i) => (
                                                                <div key={i}>{jugadorPor(poolXyz, asignacion.xyz[l])}</div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })
                                }
                                // DOBLES: 1 solo matchup
                                const m = matchups[0]
                                const letrasLoc = Array.isArray(m.cruces.local) ? m.cruces.local : [m.cruces.local]
                                const letrasVis = Array.isArray(m.cruces.visitante) ? m.cruces.visitante : [m.cruces.visitante]
                                return (
                                    <tr key={partido.id}>
                                        <td className="text-center text-xs text-fg-muted font-mono">
                                            {partidos.length > 1 ? `${partido.orden}.` : ''}
                                        </td>
                                        <td>
                                            <div className="flex items-start gap-1">
                                                <Badge variant="warning">DOB</Badge>
                                                <div className="text-sm">
                                                    <div className="text-xs text-fg-muted font-mono">{letrasLoc.join('+')}</div>
                                                    {letrasLoc.map((l, i) => (
                                                        <div key={i}>{jugadorPor(poolAbc, asignacion.abc[l])}</div>
                                                    ))}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="text-fg-muted text-center">vs</td>
                                        <td>
                                            <div className="text-sm">
                                                <div className="text-xs text-fg-muted font-mono">{letrasVis.join('+')}</div>
                                                {letrasVis.map((l, i) => (
                                                    <div key={i}>{jugadorPor(poolXyz, asignacion.xyz[l])}</div>
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            <div className="mt-3 banner banner-info text-xs flex items-center gap-2">
                <TrophyIcon className="h-4 w-4 text-info shrink-0" />
                Tras guardar, abre cada partido desde la lista del grupo para registrar los tanteos
                con las alineaciones ya pre-llenadas.
            </div>
        </div>
    )
}
