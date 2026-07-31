'use client';

import { useState, useEffect } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';

type Jugador = {
    id: number;
    nombre: string;
    elo: number;
    clubes?: { nombre?: string };
};

export default function JugadorSearchAutocomplete({
                                                      onSelect,
                                                  }: {
    onSelect?: (jugador: Jugador) => void;
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Jugador[]>([]);
    const [loading, setLoading] = useState(false);

    // Buscar jugadores en servidor
    useEffect(() => {
        const fetchJugadores = async () => {
            if (query.length < 2) {
                setResults([]);
                return;
            }
            setLoading(true);
            try {
                const res = await fetch(`/api/ranking?all=true`);
                const data = await res.json();

                // Filtrar por nombre parecido
                const filtrados = (data.jugadores || []).filter((j: Jugador) =>
                    j.nombre.toLowerCase().includes(query.toLowerCase())
                );

                setResults(filtrados);
            } catch (error) {
                console.error('Error buscando jugadores:', error);
            } finally {
                setLoading(false);
            }
        };

        const delay = setTimeout(fetchJugadores, 300); // debounce
        return () => clearTimeout(delay);
    }, [query]);

    return (
        <div className="w-full max-w-md">
            <Input
                type="text"
                placeholder="Buscar jugador..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                leadingIcon={<MagnifyingGlassIcon className="h-4 w-4" />}
            />

            {/* Loader */}
            {loading && (
                <div className="mt-2 text-fg-muted text-sm inline-flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    Buscando...
                </div>
            )}

            {/* Lista de resultados */}
            {results.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                    {results.map((jugador) => (
                        <li key={jugador.id}>
                            <button
                                type="button"
                                onClick={() => {
                                    onSelect?.(jugador);
                                    setQuery(jugador.nombre); // opcional: rellena el input
                                }}
                                className="w-full text-left card-flush p-3 hover:bg-subtle transition-colors"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold text-fg truncate">{jugador.nombre}</span>
                                    <Badge variant="brand">{jugador.elo}</Badge>
                                </div>
                                <p className="text-xs text-fg-muted mt-1">
                                    Club: {jugador.clubes?.nombre || 'Sin club'}
                                </p>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {/* No encontrado */}
            {query.length >= 2 && !loading && results.length === 0 && (
                <p className="mt-2 text-fg-muted text-sm">No se encontraron jugadores</p>
            )}
        </div>
    );
}
