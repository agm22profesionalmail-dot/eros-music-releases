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
  const playTracks = usePlayer((s) => s.playTracks)
  const debounce = useRef<number>(0)

  useEffect(() => {
    if (!query.trim()) {
      setResults(null)
      return
    }
    setLoading(true)
    window.clearTimeout(debounce.current)
    debounce.current = window.setTimeout(() => {
      let cancelled = false
      void window.api.music
        .search(query, filter)
        .then((res) => {
          if (!cancelled) setResults(res)
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
      return () => {
        cancelled = true
      }
    }, 300)
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

      {results && !loading && (
        <>
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
