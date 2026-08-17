import { useEffect, useRef, useState } from 'react'
import type { MediaCard, SearchFilter, SearchResults } from '@shared/types'
import { TrackTable } from '../components/TrackTable'
import { Card } from '../components/Card'
import { usePlayer } from '../player/store'
import { openContextMenu } from '../components/ContextMenu'
import { trackMenu } from '../app/libraryStore'
import { cardToTrack } from './HomePage'
import { useT } from '../app/i18n'

const FILTERS: { key: SearchFilter; labelKey: string }[] = [
  { key: 'all', labelKey: 'search.filter.all' },
  { key: 'song', labelKey: 'search.filter.song' },
  { key: 'video', labelKey: 'search.filter.video' },
  { key: 'album', labelKey: 'search.filter.album' },
  { key: 'artist', labelKey: 'search.filter.artist' },
  { key: 'playlist', labelKey: 'search.filter.playlist' }
]

/**
 * F60 · Si el mejor resultado es un artista, deriva "artistas que colaboran
 * con él" de las propias canciones encontradas: cada artista acompañante con
 * id (excluido el buscado), con su foto si la sección de artistas la trae.
 */
function collabArtists(results: SearchResults): MediaCard[] {
  const top = results.topResult
  if (top?.kind !== 'artist') return []
  const topName = top.title.trim().toLowerCase()
  const seen = new Set<string>()
  const out: MediaCard[] = []
  for (const song of results.songs) {
    for (const a of song.artists) {
      if (!a.id || a.id === top.id || seen.has(a.id)) continue
      if (a.name.trim().toLowerCase() === topName) continue
      seen.add(a.id)
      const known = results.artists.find((c) => c.id === a.id)
      out.push(known ?? { kind: 'artist', id: a.id, title: a.name })
    }
  }
  return out.slice(0, 8)
}

export function SearchPage({ query }: { query: string }): React.JSX.Element {
  const t = useT()
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
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      {!query.trim() && <div className="empty-state">{t('search.typeSomething')}</div>}
      {loading && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
          <div className="spinner" />
        </div>
      )}

      {error && !loading && (
        <div className="empty-state">
          <div className="error-banner" style={{ display: 'inline-block' }}>
            {t('search.failed', { msg: error })}
          </div>
          <div style={{ paddingTop: 12 }}>
            <button className="btn btn-primary" onClick={() => runSearch(query, filter)}>
              {t('btn.retry')}
            </button>
          </div>
        </div>
      )}

      {results && !loading && !error && (
        <>
          {results.topResult && (
            <>
              <h2>{t('search.topResult')}</h2>
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
          {/* F60 · Prioridad YT Music: canciones (carátulas de álbum) arriba,
              vídeos de YT (frames) al final del todo. Si el mejor resultado es
              un artista, sus colaboradores aparecen justo bajo las canciones. */}
          {results.songs.length > 0 && (
            <>
              <h2>{t('search.filter.song')}</h2>
              <TrackTable
                tracks={results.songs}
                onPlayIndex={(i) => void playTracks(results.songs, i)}
                onContextMenu={(e, t) => openContextMenu(e, trackMenu(t))}
              />
            </>
          )}
          {(() => {
            const collabs = collabArtists(results)
            if (!collabs.length) return null
            return (
              <>
                <h2>{t('search.collabs', { name: results.topResult!.title })}</h2>
                <div className="card-grid">
                  {collabs.map((a, i) => (
                    <Card key={`${a.id}-${i}`} item={a} />
                  ))}
                </div>
              </>
            )
          })()}
          {results.artists.length > 0 && (
            <>
              <h2>{t('search.filter.artist')}</h2>
              <div className="card-grid">
                {results.artists.map((a, i) => (
                  <Card key={`${a.id}-${i}`} item={a} />
                ))}
              </div>
            </>
          )}
          {results.albums.length > 0 && (
            <>
              <h2>{t('search.filter.album')}</h2>
              <div className="card-grid">
                {results.albums.map((a, i) => (
                  <Card key={`${a.id}-${i}`} item={a} />
                ))}
              </div>
            </>
          )}
          {results.playlists.length > 0 && (
            <>
              <h2>{t('search.filter.playlist')}</h2>
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
          {results.videos.length > 0 && filter !== 'song' && (
            <>
              <h2>{t('search.filter.video')}</h2>
              <TrackTable
                tracks={results.videos}
                onPlayIndex={(i) => void playTracks(results.videos, i)}
                onContextMenu={(e, t) => openContextMenu(e, trackMenu(t))}
              />
            </>
          )}
          {!results.songs.length &&
            !results.videos.length &&
            !results.albums.length &&
            !results.artists.length &&
            !results.playlists.length && (
              <div className="empty-state">{t('search.empty', { q: query })}</div>
            )}
        </>
      )}
    </div>
  )
}

// util reexportada
export { cardToTrack }
