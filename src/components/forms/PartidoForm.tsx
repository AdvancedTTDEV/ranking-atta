import { useState, useEffect, useMemo } from 'react'
import { toast } from 'react-hot-toast'

interface Jugador {
  id: number
  nombre: string
  elo: number
}

interface Torneo {
  id: number
  nombre: string
  fecha: string
}

interface PartidoFormProps {
  onSuccessAction: () => void
  onCancelAction: () => void
}

export default function PartidoForm({ onSuccessAction, onCancelAction }: PartidoFormProps) {
  const [jugador1Id, setJugador1Id] = useState('')
  const [jugador2Id, setJugador2Id] = useState('')
  const [ganadorId, setGanadorId] = useState('')
  const [torneoId, setTorneoId] = useState('')
  const [ronda, setRonda] = useState('')
  const [tipoEspecial, setTipoEspecial] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [torneos, setTorneos] = useState<Torneo[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // States for searchable dropdowns
  const [jugador1Search, setJugador1Search] = useState('')
  const [jugador2Search, setJugador2Search] = useState('')
  const [showPlayer1Results, setShowPlayer1Results] = useState(false)
  const [showPlayer2Results, setShowPlayer2Results] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true)
        const [jugadoresRes, torneosRes] = await Promise.all([
          fetch('/api/jugadores?all=true'),
          fetch('/api/torneos?all=true')
        ])

        const jugadoresData = await jugadoresRes.json()
        const jugadoresArray = jugadoresData.jugadores || jugadoresData.data || []
        setJugadores(Array.isArray(jugadoresArray) ? jugadoresArray : [])

        const torneosData = await torneosRes.json()
        const torneosArray = torneosData.torneos || torneosData.data || []
        setTorneos(Array.isArray(torneosArray) ? torneosArray : [])

      } catch (error) {
        console.error('Fetch error:', error)
        toast.error('Error cargando datos')
        setJugadores([])
        setTorneos([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [])

  // ✅ AUTO-SELECCIONAR EL TORNEO MÁS RECIENTE
  useEffect(() => {
    if (torneos.length > 0 && !torneoId) {
      setTorneoId(torneos[0].id.toString())
    }
  }, [torneos, torneoId])

  // Filter players
  const filteredPlayers1 = useMemo(() => {
    if (!jugador1Search) return jugadores
    return jugadores.filter(player =>
        player.nombre.toLowerCase().includes(jugador1Search.toLowerCase()) ||
        player.elo.toString().includes(jugador1Search)
    )
  }, [jugadores, jugador1Search])

  const filteredPlayers2 = useMemo(() => {
    if (!jugador2Search) return jugadores.filter(j => j.id !== parseInt(jugador1Id || '0'))
    return jugadores
        .filter(j => j.id !== parseInt(jugador1Id || '0'))
        .filter(player =>
            player.nombre.toLowerCase().includes(jugador2Search.toLowerCase()) ||
            player.elo.toString().includes(jugador2Search)
        )
  }, [jugadores, jugador2Search, jugador1Id])

  // Auto winner if only one player
  useEffect(() => {
    if (jugador1Id && !jugador2Id) {
      setGanadorId(jugador1Id)
    }
  }, [jugador1Id, jugador2Id])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)

    const partidoData = {
      jugador1_id: jugador1Id,
      jugador2_id: jugador2Id || null,
      ganador_id: ganadorId,
      torneo_id: torneoId,
      ronda: ronda || null,
      tipo_especial: tipoEspecial || null
    }

    try {
      const response = await fetch('/api/partidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partidoData)
      })

      if (response.ok) {
        toast.success('Partido registrado exitosamente')
        onSuccessAction()
      } else {
        const errorData = await response.json()
        toast.error(errorData.message || 'Error al registrar partido')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* TORNEO */}
        <div>
          <label htmlFor="torneo" className="block text-sm font-medium text-gray-700">
            Torneo
          </label>
          <select
              id="torneo"
              value={torneoId}
              onChange={(e) => setTorneoId(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
              required
              disabled={isLoading}
          >
            <option value="">Selecciona un torneo</option>
            {isLoading ? (
                <option>Cargando torneos...</option>
            ) : torneos.length === 0 ? (
                <option>No hay torneos disponibles</option>
            ) : (
                torneos.map(torneo => (
                    <option key={torneo.id} value={torneo.id}>
                      {torneo.nombre} - {new Date(torneo.fecha).toLocaleDateString()}
                    </option>
                ))
            )}
          </select>
        </div>

        {/* JUGADORES */}
        <div className="grid grid-cols-2 gap-4">
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700">
              Jugador 1
            </label>
            <input
                type="text"
                value={jugador1Search}
                onChange={(e) => {
                  setJugador1Search(e.target.value)
                  setShowPlayer1Results(true)
                }}
                onFocus={() => setShowPlayer1Results(true)}
                onBlur={() => setTimeout(() => setShowPlayer1Results(false), 200)}
                placeholder="Buscar jugador..."
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                required
            />
            {showPlayer1Results && filteredPlayers1.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border rounded-md shadow max-h-60 overflow-auto">
                  {filteredPlayers1.map(j => (
                      <div
                          key={j.id}
                          className="p-2 hover:bg-gray-100 cursor-pointer"
                          onMouseDown={() => {
                            setJugador1Id(j.id.toString())
                            setJugador1Search(j.nombre)
                            setShowPlayer1Results(false)
                          }}
                      >
                        id({j.id}) {j.nombre} {j.elo} puntos
                      </div>
                  ))}
                </div>
            )}
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-gray-700">
              Jugador 2 (opcional)
            </label>
            <input
                type="text"
                value={jugador2Search}
                onChange={(e) => {
                  setJugador2Search(e.target.value)
                  setShowPlayer2Results(true)
                }}
                onFocus={() => setShowPlayer2Results(true)}
                onBlur={() => setTimeout(() => setShowPlayer2Results(false), 200)}
                placeholder="Buscar jugador..."
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
            />
            {showPlayer2Results && filteredPlayers2.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border rounded-md shadow max-h-60 overflow-auto">
                  <div
                      className="p-2 hover:bg-gray-100 cursor-pointer"
                      onMouseDown={() => {
                        setJugador2Id('')
                        setJugador2Search('')
                        setShowPlayer2Results(false)
                      }}
                  >
                    Bye/Forfeit
                  </div>
                  {filteredPlayers2.map(j => (
                      <div
                          key={j.id}
                          className="p-2 hover:bg-gray-100 cursor-pointer"
                          onMouseDown={() => {
                            setJugador2Id(j.id.toString())
                            setJugador2Search(j.nombre)
                            setShowPlayer2Results(false)
                          }}
                      >
                        id({j.id}) {j.nombre} {j.elo} puntos
                      </div>
                  ))}
                </div>
            )}
          </div>
        </div>

        {jugador1Id && jugador2Id && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Ganador
              </label>
              <select
                  value={ganadorId}
                  onChange={(e) => setGanadorId(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                  required
              >
                <option value="">Selecciona un ganador</option>
                <option value={jugador1Id}>
                  {jugadores.find(j => j.id === parseInt(jugador1Id))?.nombre}
                </option>
                <option value={jugador2Id}>
                  {jugadores.find(j => j.id === parseInt(jugador2Id))?.nombre}
                </option>
              </select>
            </div>
        )}

        {/* RESTO */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Ronda
            </label>
            <select
                value={ronda}
                onChange={(e) => setRonda(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                required
            >
              <option value="">Selecciona una ronda</option>
              <option value="Grupos">Grupos</option>
              <option value="32avos">32avos</option>
              <option value="16avos">16avos</option>
              <option value="Octavos">Octavos</option>
              <option value="Cuartos">Cuartos</option>
              <option value="Semifinal">Semifinal</option>
              <option value="Campeón">Campeón</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Tipo Especial
            </label>
            <select
                value={tipoEspecial}
                onChange={(e) => setTipoEspecial(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
            >
              <option value="">Ninguno</option>
              <option value="Forfeit">Forfeit</option>
              <option value="Bye">Bye</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end space-x-2">
          <button
              type="button"
              onClick={onCancelAction}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              disabled={isSubmitting}
          >
            Cancelar
          </button>
          <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
              disabled={isSubmitting}
          >
            {isSubmitting ? 'Registrando...' : 'Registrar Partido'}
          </button>
        </div>
      </form>
  )
}