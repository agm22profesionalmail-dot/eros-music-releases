import { useEffect, useRef, useState } from 'react'
import type { SearchFilter, SearchResults } from '@shared/types'
import { TrackTable } from '../components/TrackTable'
import { Card } from '../components/Card'
import { usePlayer } from '../player/store'
import { openContextMenu } from '../components/ContextMenu'
import { trackMenu } from '../app/libraryStore'
import { cardToTrack } from './HomePage'

const FILTERS: { key: SearchFilter; label: string }[] = [
  { key: 'all', label: 'Todo' },
  { key: 'song', label: 'Canciones' },
  { key: 'video', label: 'Vídeos' },
  { key: 'album', label: 'Álbumes' },
  { key: 'artist', label: 'Artistas' },
  { key: 'playlist', label: 'Playlists' }
]

export function SearchPage({ query }: { query: string }): React.JSX.Element {
  const [filter, setFilter] = useState<SearchFilter>('all')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const playTracks = usePlayer((s) => s.playTracks)
  const debounce = useRef<number>(0)
  // Nº de petición: las respuestas viejas no pisan a las nuevas
  const requestSeq = useRef(0)

  const runSearch = (q: string, f: SearchFilter): void => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    void window.api.music
      .search(q, f)
      .then((res) => {
        if (seq !== requestSeq.current) return // respuesta obsoleta
        setResults(res)
        setLoading(false)
      })
      .catch((err) => {
        if (seq !== requestSeq.current) return
        setError(String((err as Error)?.message ?? err))
        setLoading(false)
      })
  }

  useEffect(() => {
    window.clearTimeout(debounce.current)
    if (!query.trim()) {
      // Borrar la caja también invalida cualquier búsqueda en vuelo
      requestSeq.current++
      setResults(null)
      setLoading(false)
      setError(null)
      return
    }
    debounce.current = window.setTimeout(() => runSearch(query, filter), 300)
    return () => window.clearTimeout(debounce.current)
  }, [query, filter])

  return (
    <div className="page">
      <div className="sidebar-filters" style={{ padding: '8px 0 16px' }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`chip ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!query.trim() && <div className="empty-state">Escribe algo para buscar</div>}
      {loading && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
          <div className="spinner" />
        </div>
      )}

      {error && !loading && (
        <div className="empty-state">
          <div className="error-banner" style={{ display: 'inline-block' }}>
            La búsqueda falló: {error}
          </div>
          <div style={{ paddingTop: 12 }}>
            <button className="btn btn-primary" onClick={() => runSearch(query, filter)}>
              Reintentar
            </button>
          </div>
        </div>
      )}

      {results && !loading && !error && (
        <>
          {results.topResult && (
            <>
              <h2>Mejor resultado</h2>
              <div style={{ maxWidth: 220 }}>
                <Card
                  item={results.topResult}
                  onPlay={(card) => {
                    if (card.kind === 'song' || card.kind === 'video') {
                      void playTracks([cardToTrack(card)])
                    }
                  }}
                />
              </div>
            </>
          )}
          {results.songs.length > 0 && (
            <>
              <h2>Canciones</h2>
              <TrackTable
                tracks={results.songs}
                onPlayIndex={(i) => void playTracks(results.songs, i)}
                onContextMenu={(e, t) => openContextMenu(e, trackMenu(t))}
              />
            </>
          )}
          {results.videos.length > 0 && filter !== 'song' && (
            <>
              <h2>Vídeos</h2>
              <TrackTable
                tracks={results.videos}
                onPlayIndex={(i) => void playTracks(results.videos, i)}
                onContextMenu={(e, t) => openContextMenu(e, trackMenu(t))}
              />
            </>
          )}
          {results.artists.length > 0 && (
            <>
              <h2>Artistas</h2>
              <div className="card-grid">
                {results.artists.map((a, i) => (
                  <Card key={`${a.id}-${i}`} item={a} />
                ))}
              </div>
            </>
          )}
          {results.albums.length > 0 && (
            <>
              <h2>Álbumes</h2>
              <div className="card-grid">
                {results.albums.map((a, i) => (
                  <Card key={`${a.id}-${i}`} item={a} />
                ))}
              </div>
            </>
          )}
          {results.playlists.length > 0 && (
            <>
              <h2>Playlists</h2>
              <div className="card-grid">
                {results.playlists.map((p, i) => (
                  <Card
                    key={`${p.id}-${i}`}
                    item={p}
                    onPlay={(card) => {
                      void window.api.music.playlist(card.id).then((pl) => {
                        if (pl.tracks.length) void playTracks(pl.tracks)
                      })
                    }}
                  />
                ))}
              </div>
            </>
          )}
          {!results.songs.length &&
            !results.videos.length &&
            !results.albums.length &&
            !results.artists.length &&
            !results.playlists.length && (
              <div className="empty-state">Sin resultados para «{query}»</div>
            )}
        </>
      )}
    </div>
  )
}

// util reexportada
export { cardToTrack }
