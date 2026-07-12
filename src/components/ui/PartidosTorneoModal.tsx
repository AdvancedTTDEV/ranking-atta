'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { PrinterIcon, PlayIcon, CheckBadgeIcon, TrophyIcon, ExclamationTriangleIcon, ChevronUpDownIcon, CheckIcon } from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import PartidosResultadoModal from '@/components/ui/PartidosResultadoModal'
import { categoriasParaSelector } from '@/lib/torneo'

interface Categoria { id: number; nombre: string }
interface Jugador { id: number; nombre: string }
interface Miembro { jugador_id: number; jugadores: Jugador }
interface Participante {
    id: number
    nombre_personalizado?: string | null
    jugadores?: Jugador | null
    miembros: Miembro[]
}
interface SetPartido { numero: number; puntos_local: number; puntos_visitante: number }
interface DetalleEquipo {
    id: number
    orden: number
    tipo: 'DOBLES' | 'INDIVIDUAL'
    estado: 'PENDIENTE' | 'FINALIZADO'
    sets_local: number
    sets_visitante: number
    jugadores: { jugador_id: number; lado: 'LOCAL' | 'VISITANTE'; jugadores: Jugador }[]
    sets: SetPartido[]
}
interface PosicionGrupo {
    posicion: number
    participante_id: number
    nombre: string
    victorias: number
    derrotas: number
    setsFavor: number
    setsContra: number
    puntosFavor: number
    puntosContra: number
    requiere_decision_manual: boolean
}
interface ClasificacionGrupo { grupoId: number; numero_grupo: number; posiciones: PosicionGrupo[] }
interface Partido {
    id: number
    orden: number
    sets_local: number
    sets_visitante: number
    estado: 'PENDIENTE' | 'FINALIZADO'
    torneo_grupos: { id: number; numero_grupo: number } | null
    participante_local: Participante
    participante_visitante: Participante
    arbitro: Jugador | null
    sets: SetPartido[]
    detalles: DetalleEquipo[]
}
interface Torneo {
    id: number
    nombre: string
    modalidad: 'INDIVIDUAL' | 'DOBLES' | 'EQUIPOS'
    abierto?: boolean
    torneo_categorias: { categorias: Categoria }[]
}
interface Props { isOpen: boolean; onClose: () => void; torneo: Torneo | null; onOpenLlaves?: () => void }

const nombreParticipante = (participante: Participante) =>
    participante.nombre_personalizado?.trim()
    || participante.miembros.map(miembro => miembro.jugadores.nombre).join(' / ')
    || participante.jugadores?.nombre
    || 'Participante'

const escaparHtml = (texto: string) => texto.replace(/[&<>"']/g, caracter => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[caracter] || caracter))

interface CruceDisponible {
    grupo_id: number
    participante_local_id: number
    participante_visitante_id: number
    arbitro_jugador_id: number | null
    local: string
    visitante: string
}

function TablasClasificacion({
    clasificaciones,
    onClickGrupo,
    grupoFiltroId,
}: {
    clasificaciones: ClasificacionGrupo[]
    onClickGrupo?: (grupoId: number) => void
    grupoFiltroId?: number | null
}) {
    if (clasificaciones.length === 0) return null
    return (
        <section className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {clasificaciones.map(grupo => {
                const activo = grupoFiltroId === grupo.grupoId
                return (
                    <div
                        key={grupo.grupoId}
                        className={`card-flush overflow-hidden transition-colors ${activo ? 'ring-2 ring-brand' : ''}`}
                    >
                        <div className="px-4 py-2.5 bg-subtle border-b border-line text-xs font-bold text-fg-muted uppercase tracking-wider flex items-center justify-between">
                            <span>Clasificación · Grupo {grupo.numero_grupo}</span>
                            {onClickGrupo && (
                                <button
                                    type="button"
                                    onClick={() => onClickGrupo(grupo.grupoId)}
                                    className="text-[0.65rem] font-normal normal-case text-brand hover:underline"
                                >
                                    {activo ? 'Quitar filtro' : 'Ver partidos →'}
                                </button>
                            )}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="table-compact">
                                <thead>
                                    <tr>
                                        <th className="w-8">#</th>
                                        <th>Participante</th>
                                        <th className="text-center w-10">V</th>
                                        <th className="text-center w-10">D</th>
                                        <th className="text-center w-20">Sets</th>
                                        <th className="text-center w-24">Puntos</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {grupo.posiciones.map(posicion => {
                                        const filaClass = [
                                            'transition-colors',
                                            onClickGrupo ? 'cursor-pointer hover:bg-subtle' : '',
                                            posicion.requiere_decision_manual ? 'bg-warning-soft' : '',
                                        ].filter(Boolean).join(' ')
                                        const contenido = (
                                            <>
                                                <td className="font-bold text-fg">{posicion.posicion}</td>
                                                <td className="font-medium">
                                                    <span className="inline-flex items-center gap-1.5">
                                                        {posicion.nombre}
                                                        {posicion.requiere_decision_manual && (
                                                            <ExclamationTriangleIcon
                                                                className="h-3.5 w-3.5 text-warning"
                                                                title="Empate aún no resuelto: requiere decisión manual"
                                                            />
                                                        )}
                                                    </span>
                                                </td>
                                                <td className="text-center">{posicion.victorias}</td>
                                                <td className="text-center">{posicion.derrotas}</td>
                                                <td className="text-center font-mono">{posicion.setsFavor}-{posicion.setsContra}</td>
                                                <td className="text-center font-mono">{posicion.puntosFavor}-{posicion.puntosContra}</td>
                                            </>
                                        )
                                        return onClickGrupo ? (
                                            <tr key={posicion.participante_id} className={filaClass} onClick={() => onClickGrupo(grupo.grupoId)}>
                                                {contenido}
                                            </tr>
                                        ) : (
                                            <tr key={posicion.participante_id} className={filaClass}>
                                                {contenido}
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            })}
        </section>
    )
}

export default function PartidosTorneoModal({ isOpen, onClose, torneo, onOpenLlaves }: Props) {
    const [categoriaId, setCategoriaId] = useState('')
    const [partidos, setPartidos] = useState<Partido[]>([])
    const [clasificaciones, setClasificaciones] = useState<ClasificacionGrupo[]>([])
    const [loading, setLoading] = useState(false)
    const [generando, setGenerando] = useState(false)
    const [partidoResultadoId, setPartidoResultadoId] = useState<number | null>(null)
    const [borradores, setBorradores] = useState<Record<number, { sets: { local: number; visitante: number }[] }>>({})
    const [grupoFiltroId, setGrupoFiltroId] = useState<number | null>(null)
    const [modalGeneracion, setModalGeneracion] = useState<{
        cruces: CruceDisponible[]
        seleccionados: Set<string>
        arbitroAsignado: Map<string, number | null>
    } | null>(null)
    const [todasCategorias, setTodasCategorias] = useState<Categoria[]>([])

    // Cargamos el catálogo completo de categorías para soportar torneos
    // "abiertos" (DOBLES, EQUIPOS o primera categoría), donde el selector
    // debe mostrar TODAS las categorías, no solo las asignadas.
    useEffect(() => {
        let cancelado = false
        fetch('/api/categorias')
            .then(r => r.ok ? r.json() : [])
            .then(data => { if (!cancelado) setTodasCategorias(Array.isArray(data) ? data : []) })
            .catch(() => { /* silencioso: si falla, solo se muestran las del torneo */ })
        return () => { cancelado = true }
    }, [])

    const categorias = categoriasParaSelector(
        torneo?.torneo_categorias,
        todasCategorias,
        torneo?.modalidad,
        torneo?.abierto,
    )
    // En torneos abiertos (DOBLES, EQUIPOS o primera categoría) los
    // partidos se arman una sola vez sobre la categoría "primera", sin
    // selector de categoría.
    const esAbierto = Boolean(
        torneo?.abierto ||
        torneo?.modalidad === 'DOBLES' ||
        torneo?.modalidad === 'EQUIPOS' ||
        categorias.some(c => c.nombre === 'primera')
    )
    const categoriaOperativa = esAbierto
        ? (todasCategorias.find(c => c.nombre === 'primera') || categorias[0])
        : categorias.find(c => c.id.toString() === categoriaId) || categorias[0]
    const partidosPorGrupo = useMemo(() => {
        const grupos = new Map<number, { id: number; numero: number; partidos: Partido[] }>()
        partidos.forEach(partido => {
            if (!partido.torneo_grupos) return
            const actual = grupos.get(partido.torneo_grupos.id) || {
                id: partido.torneo_grupos.id,
                numero: partido.torneo_grupos.numero_grupo,
                partidos: []
            }
            actual.partidos.push(partido)
            grupos.set(partido.torneo_grupos.id, actual)
        })
        return [...grupos.values()].sort((a, b) => a.numero - b.numero)
    }, [partidos])

    // Si hay filtro de grupo activo, ocultamos los grupos que no coinciden.
    const gruposVisibles = useMemo(
        () => grupoFiltroId === null
            ? partidosPorGrupo
            : partidosPorGrupo.filter(g => g.id === grupoFiltroId),
        [partidosPorGrupo, grupoFiltroId]
    )

    useEffect(() => {
        // Al cambiar de torneo, seleccionamos la primera categoría SOLO si
        // la actual ya no es válida. No limpiamos partidos ni borradores:
        // el useEffect de [isOpen, categoriaId] recargará los datos y los
        // borradores del usuario se conservan al alternar entre categorías.
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
            const response = await fetch(`/api/torneos/${torneo.id}/partidos?categoriaId=${categoriaId}`)
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los partidos')
            setPartidos(data.partidos || [])
            setClasificaciones(data.clasificaciones || [])
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Error de conexión')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { if (isOpen && categoriaId) cargar() }, [isOpen, categoriaId])

    // ── Previsualización de generación ────────────────────────────────────
    const abrirPrevisualizacionGeneracion = async () => {
        if (!torneo || !categoriaId) return
        setGenerando(true)
        try {
            const response = await fetch(`/api/torneos/${torneo.id}/partidos/previsualizar?categoriaId=${categoriaId}`)
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || 'No se pudieron previsualizar los cruces')
            const cruces: CruceDisponible[] = (data.cruces || []).map((cruce: {
                grupo_id: number
                participante_local_id: number
                participante_visitante_id: number
                arbitro_jugador_id: number | null
                local: string
                visitante: string
            }) => ({
                grupo_id: cruce.grupo_id,
                participante_local_id: cruce.participante_local_id,
                participante_visitante_id: cruce.participante_visitante_id,
                arbitro_jugador_id: cruce.arbitro_jugador_id,
                local: cruce.local,
                visitante: cruce.visitante,
            }))
            const claves = new Set(cruces.map(c => `${c.grupo_id}-${c.participante_local_id}-${c.participante_visitante_id}`))
            setModalGeneracion({
                cruces,
                seleccionados: claves,
                arbitroAsignado: new Map(cruces.map(c => [`${c.grupo_id}-${c.participante_local_id}-${c.participante_visitante_id}`, c.arbitro_jugador_id])),
            })
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Error de conexión')
        } finally {
            setGenerando(false)
        }
    }

    const toggleCruce = (clave: string) => {
        if (!modalGeneracion) return
        const nuevos = new Set(modalGeneracion.seleccionados)
        if (nuevos.has(clave)) nuevos.delete(clave)
        else nuevos.add(clave)
        setModalGeneracion({ ...modalGeneracion, seleccionados: nuevos })
    }

    const toggleTodos = (seleccionar: boolean) => {
        if (!modalGeneracion) return
        const nuevos = seleccionar
            ? new Set(modalGeneracion.cruces.map(c => `${c.grupo_id}-${c.participante_local_id}-${c.participante_visitante_id}`))
            : new Set<string>()
        setModalGeneracion({ ...modalGeneracion, seleccionados: nuevos })
    }

    const confirmarGeneracion = async () => {
        if (!torneo || !categoriaId || !modalGeneracion) return
        const seleccionados = modalGeneracion.cruces
            .filter(c => modalGeneracion.seleccionados.has(`${c.grupo_id}-${c.participante_local_id}-${c.participante_visitante_id}`))
        if (seleccionados.length === 0) {
            toast.error('Selecciona al menos un cruce para generar')
            return
        }
        setGenerando(true)
        try {
            const response = await fetch(`/api/torneos/${torneo.id}/partidos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    categoriaId: Number(categoriaId),
                    partidos: seleccionados.map((c, index) => ({
                        grupo_id: c.grupo_id,
                        participante_local_id: c.participante_local_id,
                        participante_visitante_id: c.participante_visitante_id,
                        arbitro_jugador_id: c.arbitro_jugador_id,
                        orden: index + 1,
                    })),
                }),
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || 'No se pudieron generar los partidos')
            toast.success(`${data.message} (${seleccionados.length} cruces)`)
            setModalGeneracion(null)
            cargar()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Error de conexión')
        } finally {
            setGenerando(false)
        }
    }

    const abrirResultado = (partido: Partido) => {
        setPartidoResultadoId(partido.id)
    }

    const guardarBorradores = async () => {
        if (!torneo || Object.keys(borradores).length === 0) return
        setGenerando(true)
        try {
            for (const [partidoId, resultado] of Object.entries(borradores)) {
                const response = await fetch(`/api/torneos/${torneo.id}/partidos/${partidoId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(resultado),
                })
                const data = await response.json()
                if (!response.ok) throw new Error(data.error || 'No se pudo guardar un resultado')
            }
            toast.success('Todos los resultados fueron guardados y el ranking actualizado')
            setBorradores({})
            cargar()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Error al guardar los cambios')
        } finally {
            setGenerando(false)
        }
    }

    const imprimir = () => {
        if (!torneo || partidosPorGrupo.length === 0) return
        const categoria = categorias.find(item => item.id.toString() === categoriaId)?.nombre || ''
        const paginas = partidosPorGrupo.map(grupo => `
            <section class="page">
              <h1>${escaparHtml(torneo.nombre)}</h1>
              <h2>Grupo ${grupo.numero} · Categoría ${escaparHtml(categoria)}</h2>
              <p class="note">Hoja de partidos · Modalidad: ${escaparHtml(torneo.modalidad)}</p>
              <table><thead><tr><th>#</th><th>Local</th><th>Visitante</th><th>Árbitro</th><th>Sets</th><th>Resultado</th></tr></thead>
              <tbody>${grupo.partidos.map(partido => `<tr>
                <td>${partido.orden}</td><td>${escaparHtml(nombreParticipante(partido.participante_local))}</td>
                <td>${escaparHtml(nombreParticipante(partido.participante_visitante))}</td>
                <td>${escaparHtml(partido.arbitro?.nombre || 'Asignar')}</td>
                <td class="sets">___ / ___ / ___ / ___ / ___</td><td class="resultado">____ : ____</td>
              </tr>`).join('')}</tbody></table>
              <p class="footer">Registrar los resultados en el sistema al finalizar cada partido.</p>
            </section>`).join('')
        const ventana = window.open('', '_blank', 'width=900,height=700')
        if (!ventana) { toast.error('El navegador bloqueó la ventana de impresión'); return }
        ventana.document.write(`<!doctype html><html><head><title>Hojas de partidos</title><style>
            @page{size:A4 portrait;margin:16mm} body{font-family:Arial,sans-serif;color:#172033}.page{page-break-after:always}.page:last-child{page-break-after:auto}h1{font-size:21px;margin:0 0 4px}h2{font-size:16px;margin:0 0 5px}.note,.footer{font-size:11px;color:#566175}.footer{margin-top:15px}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #64748b;padding:9px 7px;font-size:11px;text-align:left;vertical-align:middle}th{background:#e2e8f0}.sets{letter-spacing:1px;white-space:nowrap}.resultado{font-weight:bold;white-space:nowrap}@media print{body{margin:0}}
        </style></head><body>${paginas}<script>window.onload=()=>window.print()<\/script></body></html>`)
        ventana.document.close()
    }

    // ── Agrupamos los cruces de la previsualización por grupo ──
    // Importante: este `useMemo` debe ejecutarse siempre, antes del early
    // return de más abajo, para no romper el orden de hooks entre renders.
    const crucesPorGrupo = useMemo(() => {
        if (!modalGeneracion) return [] as { grupoId: number; cruces: CruceDisponible[] }[]
        const grupos = new Map<number, CruceDisponible[]>()
        for (const cruce of modalGeneracion.cruces) {
            const arr = grupos.get(cruce.grupo_id) || []
            arr.push(cruce)
            grupos.set(cruce.grupo_id, arr)
        }
        return [...grupos.entries()].map(([grupoId, cruces]) => ({ grupoId, cruces }))
    }, [modalGeneracion])

    if (!isOpen || !torneo) return null

    const numeroBorradores = Object.keys(borradores).length

    return (
        <>
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                title="Partidos de grupos"
                description={torneo.nombre}
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
                                {categorias.map(categoria => (
                                    <option key={categoria.id} value={categoria.id}>{categoria.nombre}</option>
                                ))}
                            </Select>
                        )}
                        {esAbierto && (
                            <div className="banner banner-info text-xs flex-1">
                                Torneo abierto: los partidos se arman en <b>primera categoría</b> mezclando a todos los inscritos.
                            </div>
                        )}
                        <Button
                            variant="success"
                            onClick={abrirPrevisualizacionGeneracion}
                            isLoading={generando}
                            leadingIcon={<PlayIcon className="h-4 w-4" />}
                        >
                            {generando ? 'Cargando…' : partidos.length ? 'Regenerar partidos' : 'Generar partidos'}
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={imprimir}
                            disabled={partidos.length === 0}
                            leadingIcon={<PrinterIcon className="h-4 w-4" />}
                        >
                            Imprimir hojas
                        </Button>
                        {onOpenLlaves && (
                            <Button
                                variant="primary"
                                onClick={onOpenLlaves}
                                leadingIcon={<TrophyIcon className="h-4 w-4" />}
                            >
                                Ver llaves
                            </Button>
                        )}
                        <Button
                            variant="primary"
                            onClick={guardarBorradores}
                            isLoading={generando}
                            disabled={numeroBorradores === 0}
                            leadingIcon={<CheckBadgeIcon className="h-4 w-4" />}
                        >
                            {`Guardar cambios (${numeroBorradores})`}
                        </Button>
                        {grupoFiltroId !== null && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setGrupoFiltroId(null)}
                            >
                                Limpiar filtro de grupo
                            </Button>
                        )}
                        <span className="text-xs text-fg-muted ml-auto">
                            Todos contra todos · al mejor de 5 sets
                        </span>
                    </div>
                </div>

                <div>
                    {!loading && (
                        <TablasClasificacion
                            clasificaciones={clasificaciones}
                            onClickGrupo={(grupoId) =>
                                setGrupoFiltroId(prev => prev === grupoId ? null : grupoId)
                            }
                            grupoFiltroId={grupoFiltroId}
                        />
                    )}

                    {loading ? (
                        <div className="text-center py-16 text-fg-muted">Cargando partidos...</div>
                    ) : gruposVisibles.length === 0 ? (
                        <div className="text-center py-20">
                            <TrophyIcon className="h-10 w-10 mx-auto text-fg-muted opacity-40" />
                            <h3 className="mt-3 font-semibold text-fg">Aún no hay partidos</h3>
                            <p className="text-sm text-fg-muted mt-1.5">
                                Genera los cruces después de completar los grupos.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {gruposVisibles.map(grupo => (
                                <section key={grupo.id} className="card-flush overflow-hidden">
                                    <div className="px-4 py-2.5 bg-subtle border-b border-line text-xs font-bold text-fg-muted uppercase tracking-wider flex items-center justify-between">
                                        <span>Grupo {grupo.numero}</span>
                                        <span className="text-fg-muted normal-case font-normal">
                                            {grupo.partidos.length} cruce{grupo.partidos.length === 1 ? '' : 's'}
                                        </span>
                                    </div>
                                    <div className="divide-y divide-line">
                                        {grupo.partidos.map(partido => {
                                            const finalizado = partido.estado === 'FINALIZADO'
                                            const tieneBorrador = !!borradores[partido.id]
                                            return (
                                                <button
                                                    key={partido.id}
                                                    onClick={() => abrirResultado(partido)}
                                                    className="w-full p-3.5 text-left hover:bg-subtle transition-colors flex flex-col sm:flex-row sm:items-center gap-2"
                                                >
                                                    <span className="chip w-7 text-center">#{partido.orden}</span>
                                                    <span className="flex-1 font-semibold text-fg truncate">
                                                        {nombreParticipante(partido.participante_local)}
                                                    </span>
                                                    <span className="font-mono font-bold text-fg text-sm">
                                                        {finalizado
                                                            ? `${partido.sets_local} : ${partido.sets_visitante}`
                                                            : <span className="text-fg-muted font-normal">vs</span>}
                                                    </span>
                                                    <span className="flex-1 font-semibold text-fg truncate">
                                                        {nombreParticipante(partido.participante_visitante)}
                                                    </span>
                                                    <span className="text-xs text-fg-muted hidden md:inline">
                                                        Árbitro: <b className="text-fg">{partido.arbitro?.nombre || 'Asignar'}</b>
                                                    </span>
                                                    {tieneBorrador ? (
                                                        <Badge variant="warning">
                                                            <span className="inline-flex items-center gap-1">
                                                                <ExclamationTriangleIcon className="h-3 w-3" />
                                                                Borrador
                                                            </span>
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant={finalizado ? 'success' : 'warning'}>
                                                            {finalizado
                                                                ? 'Finalizado'
                                                                : torneo.modalidad === 'EQUIPOS' ? 'Serie de equipo' : 'Registrar'}
                                                        </Badge>
                                                    )}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </section>
                            ))}
                        </div>
                    )}
                </div>
            </Modal>

            {/* Modal "Registrar resultado" — componente separado para mantener
                el código de sets/al navegacion aislado. */}
            {partidoResultadoId !== null && (
                <PartidosResultadoModal
                    isOpen
                    onClose={() => setPartidoResultadoId(null)}
                    torneo={torneo}
                    partidos={partidos}
                    partidoInicialId={partidoResultadoId}
                    borradores={borradores}
                    onBorradoresChange={setBorradores}
                    onPersist={() => {
                        cargar()
                    }}
                />
            )}

            {/* Modal de previsualización de generación con checkboxes */}
            {modalGeneracion && (
                <Modal
                    isOpen
                    onClose={() => setModalGeneracion(null)}
                    title="Confirmar generación de partidos"
                    description="Desmarca los cruces que no quieras generar en este paso"
                    size="2xl"
                    footer={
                        <>
                            <Button variant="secondary" onClick={() => setModalGeneracion(null)} disabled={generando}>
                                Cancelar
                            </Button>
                            <Button
                                variant="success"
                                onClick={confirmarGeneracion}
                                isLoading={generando}
                                leadingIcon={<PlayIcon className="h-4 w-4" />}
                            >
                                {`Generar seleccionados (${modalGeneracion.seleccionados.size})`}
                            </Button>
                        </>
                    }
                >
                    <div className="mb-3 flex items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={() => toggleTodos(true)}>
                            <CheckIcon className="h-3.5 w-3.5" /> Seleccionar todos
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleTodos(false)}>
                            <ChevronUpDownIcon className="h-3.5 w-3.5" /> Deseleccionar todos
                        </Button>
                    </div>
                    <div className="space-y-4 max-h-[60vh] overflow-y-auto scrollbar-thin">
                        {crucesPorGrupo.map(grupo => (
                            <div key={grupo.grupoId} className="card-flush overflow-hidden">
                                <div className="px-3 py-2 bg-subtle border-b border-line text-xs font-bold text-fg-muted uppercase tracking-wider">
                                    Grupo {grupo.grupoId} · {grupo.cruces.length} cruce{grupo.cruces.length === 1 ? '' : 's'}
                                </div>
                                <ul className="divide-y divide-line">
                                    {grupo.cruces.map(cruce => {
                                        const clave = `${cruce.grupo_id}-${cruce.participante_local_id}-${cruce.participante_visitante_id}`
                                        const checked = modalGeneracion.seleccionados.has(clave)
                                        return (
                                            <li key={clave} className={`flex items-center gap-3 px-3 py-2 ${checked ? '' : 'opacity-60'}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggleCruce(clave)}
                                                    className="h-4 w-4 rounded border-line text-brand focus:ring-brand bg-surface"
                                                />
                                                <span className="flex-1 text-sm text-fg truncate">
                                                    <b className="font-semibold">{cruce.local}</b>
                                                    <span className="text-fg-muted mx-2">vs</span>
                                                    <b className="font-semibold">{cruce.visitante}</b>
                                                </span>
                                            </li>
                                        )
                                    })}
                                </ul>
                            </div>
                        ))}
                    </div>
                </Modal>
            )}
        </>
    )
}
