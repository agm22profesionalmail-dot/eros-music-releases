import { useEffect, useMemo, useState } from 'react'
import type { PlaylistDetail } from '@shared/types'
import { TrackTable } from '../components/TrackTable'
import { ListSearchInput } from '../components/ListSearchInput'
import { usePlayer } from '../player/store'
import { openContextMenu } from '../components/ContextMenu'
import { trackMenu } from '../app/libraryStore'
import { useArtworkColor } from '../app/artworkColor'
import { matchesTrack, useDebouncedValue } from '../app/listFilter'
import { MusicNoteIcon, PauseIcon, PlayIcon } from '../components/Icons'

export function PlaylistPage({ id }: { id: string }): React.JSX.Element {
  const [pl, setPl] = useState<PlaylistDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  // F21: filtro local (no persistente) con debounce de 150 ms.
  const [filter, setFilter] = useState('')
  const debounced = useDebouncedValue(filter, 150)
  const playTracks = usePlayer((s) => s.playTracks)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const togglePlay = usePlayer((s) => s.togglePlay)
  const current = usePlayer((s) => s.current())

  useEffect(() => {
    let cancelled = false
    setPl(null)
    setError(null)
    setFilter('') // limpia el filtro al cambiar de playlist
    void window.api.music
      .playlist(id)
      .then((data) => {
        if (!cancelled) setPl(data)
      })
      .catch((err) => {
        if (!cancelled) setError(String(err?.message ?? err))
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const isThisPlaying = isPlaying && pl?.tracks.some((t) => t.videoId === current?.videoId)
  const tint = useArtworkColor(pl?.thumbnailUrl)

  // Lista efectiva que se pinta y que se usa para reproducir al hacer
  // click en una fila (cola = lo que ves).
  const filteredTracks = useMemo(() => {
    if (!pl) return []
    if (!debounced) return pl.tracks
    return pl.tracks.filter((t) => matchesTrack(t, debounced))
  }, [pl, debounced])

  if (error) {
    return (
      <div className="page">
        <div className="error-banner">No se pudo cargar la playlist: {error}</div>
      </div>
    )
  }

  if (!pl) {
    return (
      <div className="detail-header">
        <div className="skeleton" style={{ width: 224, height: 224 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 14, width: 80, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 48, width: '60%', marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 14, width: 200 }} />
        </div>
      </div>
    )
  }

  return (
    <>
      <div
        className="detail-header"
        style={tint ? { ['--header-tint' as string]: `linear-gradient(${tint}, ${tint}55)` } : undefined}
      >
        {pl.thumbnailUrl ? (
          <img className="cover" src={pl.thumbnailUrl} alt="" />
        ) : (
          <div className="cover" style={{ display: 'grid', placeItems: 'center' }}>
            <MusicNoteIcon size={64} />
          </div>
        )}
        <div className="info">
          <div className="kind">Playlist</div>
          <h1 className="name">{pl.title}</h1>
          <div className="meta">
            {/* El backend ya suele meter «X canciones» dentro de author/durationText;
               evitamos duplicados quedándonos solo con el más informativo. */}
            {pl.author && <b>{pl.author}</b>}
            {(() => {
              const hasCountInAuthor = pl.author?.toLowerCase().includes('canci')
              const hasCountInDur = pl.durationText?.toLowerCase().includes('canci')
              // trackCount solo si nadie más lo lleva
              const showCount = pl.trackCount != null && !hasCountInAuthor && !hasCountInDur
              return (
                <>
                  {showCount && (
                    <>
                      <span>·</span>
                      <span>{pl.trackCount} canciones</span>
                    </>
                  )}
                  {pl.durationText && !hasCountInAuthor && (
                    <>
                      <span>·</span>
                      <span>{pl.durationText}</span>
                    </>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      </div>
      <div className="detail-body">
        {/* F21: la fila de acciones incluye ahora el buscador anclado a la
            derecha con `margin-left: auto`. F22 podrá insertar sus tres
            botones circulares (+ / ↗ / ✎) justo tras el big-play sin
            colisionar. */}
        <div className="detail-actions">
          <button
            className={`big-play ${isThisPlaying ? 'is-playing' : ''}`}
            aria-label="Reproducir playlist"
            onClick={() => {
              if (isThisPlaying) togglePlay()
              else if (pl.tracks.length) void playTracks(pl.tracks)
            }}
          >
            {isThisPlaying ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
          </button>
          {/* Hueco reservado para F22 (botones «+ ↗ ✎») */}
          {pl.tracks.length > 0 && (
            <ListSearchInput
              value={filter}
              onChange={setFilter}
              ariaLabel="Buscar en la playlist"
            />
          )}
        </div>
        <TrackTable
          tracks={filteredTracks}
          showAlbum
          onPlayIndex={(i) => void playTracks(filteredTracks, i)}
          onContextMenu={(e, t) => openContextMenu(e, trackMenu(t, { playlistId: id }))}
        />
        {!pl.tracks.length && <div className="empty-state">Esta playlist está vacía</div>}
        {debounced && pl.tracks.length > 0 && filteredTracks.length === 0 && (
          <div className="empty-state">Sin resultados para «{filter}»</div>
        )}
      </div>
    </>
  )
}
