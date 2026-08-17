import { useCallback, useEffect, useRef, useState } from 'react'
import type { SpiralTrack } from '@shared/types'
import { useT } from '../app/i18n'
import { usePlayer } from '../player/store'
import { PlayIcon, MusicNoteIcon } from './Icons'
import { LoadingSpinner } from './LoadingSpinner'

/** F80 · Número de filas del escaparate. */
const ROW_COUNT = 3

/**
 * F88 · Caché a nivel de módulo: las pistas de la espiral se piden una sola
 * vez y se reutilizan al remontar (volver a Home sin recargar).
 */
let cachedTracks: SpiralTrack[] | null = null
let cacheLoading = false

/** F81 · Ciclos completos de scroll antes de rotar cards de una fila. */
const CYCLES_BEFORE_SWAP = 2

/** F81 · Cuántas cards se intercambian con el pool en cada rotación. */
const CARDS_TO_SWAP = 2

/**
 * F80 · Filtro defensivo: el backend ya garantiza pistas únicas, pero por si
 * acaso descartamos videoIds repetidos y más de una canción por artista
 * principal — la Espiral pierde la gracia si se ve dos veces lo mismo.
 */
function dedupe(tracks: SpiralTrack[]): SpiralTrack[] {
  const seenIds = new Set<string>()
  const seenArtists = new Set<string>()
  const out: SpiralTrack[] = []
  for (const track of tracks) {
    // Descartar pistas sin carátula — el escaparate necesita imagen
    if (!track.thumbnailUrl) continue
    if (seenIds.has(track.videoId)) continue
    const artistKey = track.artists?.[0]?.name.toLowerCase().trim() ?? ''
    if (artistKey && seenArtists.has(artistKey)) continue
    seenIds.add(track.videoId)
    if (artistKey) seenArtists.add(artistKey)
    out.push(track)
  }
  return out
}

/**
 * F80 · "Espiral Musical" — sección al final de Home con 3 filas de tarjetas
 * en scroll continuo tipo escaparate. Cada fila decide su dirección al azar
 * en el montaje; el contenido se duplica para lograr un loop sin costuras
 * (la animación CSS `spiralScroll` traslada de 0 a -50%).
 *
 * F81 · Rotación: ~70% de las pistas se reparte entre las filas y el ~30%
 * restante queda en un pool. Cada vez que una fila completa
 * CYCLES_BEFORE_SWAP ciclos de animación, CARDS_TO_SWAP de sus cards se
 * intercambian con el pool — las retiradas vuelven al pool y pueden
 * reaparecer más tarde en otra fila. Como el reparto es una partición,
 * ninguna canción está en dos filas a la vez.
 */
export function HomeSpiral(): React.JSX.Element | null {
  const t = useT()
  const playTracks = usePlayer((s) => s.playTracks)
  const [tracks, setTracks] = useState<SpiralTrack[]>([])
  const [loading, setLoading] = useState(true)
  // F81 · Contenido vivo de cada fila (rota con el pool) y pool de reserva.
  const [rowContents, setRowContents] = useState<SpiralTrack[][]>([])
  const pool = useRef<SpiralTrack[]>([])
  const cycleCounters = useRef<number[]>(Array(ROW_COUNT).fill(0))
  // Direcciones aleatorias por fila (true = inversa), fijadas en el montaje
  // para que un re-render no cambie el sentido del scroll a mitad de ciclo.
  const directions = useRef<boolean[]>(
    Array.from({ length: ROW_COUNT }, () => Math.random() > 0.5)
  )

  useEffect(() => {
    // F88 · Si ya tenemos datos en caché, los reutilizamos directamente.
    if (cachedTracks) {
      setTracks(cachedTracks)
      setLoading(false)
      return
    }
    if (cacheLoading) return // otra instancia ya pidió
    cacheLoading = true
    let cancelled = false
    void window.api.discovery
      .spiral()
      .then((data) => {
        if (!cancelled && data?.length) {
          const deduped = dedupe(data)
          cachedTracks = deduped
          setTracks(deduped)
        }
      })
      .catch(() => {})
      .finally(() => {
        cacheLoading = false
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // F81 · Distribución inicial: baraja, ~70% a las filas, el resto al pool.
  useEffect(() => {
    if (!tracks.length) return
    const perRow = Math.ceil((tracks.length * 0.7) / ROW_COUNT)
    const shuffled = [...tracks].sort(() => Math.random() - 0.5)
    const rows: SpiralTrack[][] = []
    let idx = 0
    for (let i = 0; i < ROW_COUNT; i++) {
      rows.push(shuffled.slice(idx, idx + perRow))
      idx += perRow
    }
    setRowContents(rows.filter((r) => r.length > 0))
    pool.current = shuffled.slice(idx) // lo que sobra → pool
    cycleCounters.current = Array(ROW_COUNT).fill(0)
  }, [tracks])

  // F81 · Cada CYCLES_BEFORE_SWAP ciclos de animación de una fila, se
  // intercambian CARDS_TO_SWAP cards de esa fila con el pool.
  const handleAnimationIteration = useCallback((rowIndex: number) => {
    cycleCounters.current[rowIndex]++
    if (cycleCounters.current[rowIndex] < CYCLES_BEFORE_SWAP) return
    cycleCounters.current[rowIndex] = 0

    if (pool.current.length === 0) return

    setRowContents((prev) => {
      const newRows = prev.map((r) => [...r])
      const row = newRows[rowIndex]
      if (!row || row.length === 0) return prev
      const toSwap = Math.min(CARDS_TO_SWAP, row.length, pool.current.length)

      for (let i = 0; i < toSwap; i++) {
        const replaceIdx = Math.floor(Math.random() * row.length)
        const removed = row[replaceIdx]
        const fresh = pool.current.shift()!
        row[replaceIdx] = fresh
        pool.current.push(removed)
      }

      newRows[rowIndex] = row
      return newRows
    })
  }, [])

  // Sin datos tras cargar: no pintamos nada.
  if (!loading && !tracks.length) return null

  // Skeleton: 3 filas de tarjetas grises animadas con shimmer + scroll,
  // se muestra mientras el API devuelve datos reales.
  const showSkeleton = loading || rowContents.length === 0

  const playTrack = (track: SpiralTrack): void => {
    void playTracks([
      {
        kind: track.kind,
        videoId: track.videoId,
        title: track.title,
        artists: track.artists,
        thumbnailUrl: track.thumbnailUrl
      }
    ])
  }

  /** Número de placeholders por fila del skeleton (suficientes para cubrir el viewport). */
  const SKEL_PER_ROW = 14

  return (
    <section className="home-spiral">
      <div className="home-spiral-header">
        <div className="home-spiral-icon" aria-hidden="true">
          {/* Espiral/galaxia */}
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.85 0 3.58-.5 5.07-1.38a.75.75 0 0 0-.77-1.29A8.49 8.49 0 0 1 12 20.5 8.5 8.5 0 0 1 3.5 12 8.5 8.5 0 0 1 12 3.5c3.04 0 5.72 1.6 7.23 4a.75.75 0 1 0 1.27-.8A9.98 9.98 0 0 0 12 2z" />
            <path d="M12 6a6 6 0 0 0-6 6 6 6 0 0 0 6 6 5.97 5.97 0 0 0 3.54-1.16.75.75 0 0 0-.9-1.2A4.47 4.47 0 0 1 12 16.5 4.5 4.5 0 0 1 7.5 12 4.5 4.5 0 0 1 12 7.5c1.58 0 2.98.81 3.79 2.04a.75.75 0 1 0 1.26-.82A5.99 5.99 0 0 0 12 6z" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="20" cy="6" r="1" opacity=".6" />
            <circle cx="21" cy="10" r=".7" opacity=".4" />
          </svg>
        </div>
        <div>
          <h2 className="home-spiral-title">{t('home.spiral.title')}</h2>
          <p className="home-spiral-sub">{t('home.spiral.sub')}</p>
        </div>
      </div>

      {showSkeleton
        ? /* ---- Skeleton: spinner centrado + tarjetas grises ---- */
          <div className="spiral-skeleton-wrap">
            <div className="spiral-skeleton-spinner">
              <LoadingSpinner size={72} />
            </div>
            {Array.from({ length: ROW_COUNT }, (_, rowIndex) => (
              <div className="spiral-row spiral-row--skeleton" key={`skel-${rowIndex}`}>
                <div
                  className={`spiral-row-inner ${
                    directions.current[rowIndex] ? 'spiral-reverse' : ''
                  }`}
                >
                  {Array.from({ length: SKEL_PER_ROW * 2 }, (__, i) => (
                    <div className="spiral-card" key={i}>
                      <div className="spiral-card-art spiral-skeleton-art">
                        <div className="spiral-skeleton-shimmer" />
                      </div>
                      <div className="spiral-card-info">
                        <div className="spiral-skeleton-line" style={{ width: '75%' }} />
                        <div className="spiral-skeleton-line spiral-skeleton-line--short" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        : /* ---- Contenido real ----
             Keys POSICIONALES (key={i}): cuando el pool rota una canción,
             React reutiliza el mismo <div> y solo cambia el src de la imagen
             en vez de destruir/crear el nodo DOM. Eso evita el salto de
             animación porque el layout no se recalcula. */
          rowContents.map((row, rowIndex) => (
            <div className="spiral-row" key={rowIndex}>
              <div
                className={`spiral-row-inner ${
                  directions.current[rowIndex] ? 'spiral-reverse' : ''
                }`}
                onAnimationIteration={() => handleAnimationIteration(rowIndex)}
              >
                {[...row, ...row].map((track, i) => {
                  const artistNames =
                    track.artists?.map((a) => a.name).join(', ') ?? ''
                  return (
                    <div className="spiral-card" key={i}>
                      <div className="spiral-card-art">
                        {track.thumbnailUrl ? (
                          <img
                            src={track.thumbnailUrl}
                            alt=""
                            loading="lazy"
                            draggable={false}
                          />
                        ) : (
                          <div className="spiral-card-placeholder">
                            <MusicNoteIcon size={36} />
                          </div>
                        )}
                        <button
                          className="spiral-card-play"
                          aria-label={`${t('common.play')}: ${track.title}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            playTrack(track)
                          }}
                        >
                          <PlayIcon size={28} />
                        </button>
                        {(track.isMatch || track.isSmallArtist) && (
                          <span
                            className={`spiral-card-badge ${
                              track.isSmallArtist ? 'spiral-card-badge--small' : ''
                            }`}
                          >
                            {track.isSmallArtist
                              ? t('home.spiral.smallArtistBadge')
                              : t('home.spiral.matchBadge')}
                          </span>
                        )}
                      </div>
                      <div className="spiral-card-info">
                        <div className="spiral-card-title" title={track.title}>
                          {track.title}
                        </div>
                        <div className="spiral-card-artist" title={artistNames}>
                          {artistNames}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
    </section>
  )
}
