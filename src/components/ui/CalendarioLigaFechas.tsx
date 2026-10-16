'use client'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'

export interface FilaLiga {
    id: number
    fecha_numero: number | null
    grupo: number | null
    local: string
    visitante: string
    estado: 'PENDIENTE' | 'FINALIZADO'
    sets_local: number
    sets_visitante: number
}

interface Props {
    partidos: FilaLiga[]
    onResultado: (partidoId: number) => void
    onAlineacion: (partidoId: number) => void
}

/** Calendario de Liga: encuentros agrupados por "Fecha N". */
export default function CalendarioLigaFechas({ partidos, onResultado, onAlineacion }: Props) {
    const porFecha = new Map<number, FilaLiga[]>()
    for (const p of partidos) {
        const f = p.fecha_numero ?? 0
        porFecha.set(f, [...(porFecha.get(f) ?? []), p])
    }
    const fechas = [...porFecha.keys()].sort((a, b) => a - b)
    if (fechas.length === 0) return null

    return (
        <div className="space-y-4 my-6">
            <h3 className="font-semibold text-fg">Calendario por fechas</h3>
            {fechas.map(f => (
                <div key={f} className="rounded-md border border-line overflow-hidden">
                    <div className="px-3 py-2 bg-subtle text-sm font-semibold">{f ? `Fecha ${f}` : 'Sin fecha'}</div>
                    <ul className="divide-y divide-line">
                        {porFecha.get(f)!
                            .slice()
                            .sort((a, b) => (a.grupo ?? 0) - (b.grupo ?? 0))
                            .map(p => (
                                <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                                    <Badge variant="neutral">Grupo {p.grupo ?? '-'}</Badge>
                                    <span className="flex-1 min-w-[12rem]">
                                        {p.local} <span className="text-fg-muted">vs</span> {p.visitante}
                                    </span>
                                    <span className="font-mono tabular-nums">{p.sets_local}-{p.sets_visitante}</span>
                                    <Badge variant={p.estado === 'FINALIZADO' ? 'success' : 'warning'}>
                                        {p.estado === 'FINALIZADO' ? 'Finalizado' : 'Pendiente'}
                                    </Badge>
                                    <Button size="sm" variant="secondary" onClick={() => onAlineacion(p.id)}>Alineación</Button>
                                    <Button size="sm" variant="secondary" onClick={() => onResultado(p.id)}>Resultado</Button>
                                </li>
                            ))}
                    </ul>
                </div>
            ))}
        </div>
    )
}
