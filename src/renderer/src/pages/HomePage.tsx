import { useEffect, useState } from 'react'
import type { MediaCard, Shelf, TrackSummary } from '@shared/types'
import { ShelfRow } from '../components/Shelf'
import { usePlayer } from '../player/store'
import { useAuth } from '../app/authStore'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 7) return 'Buenas noches'
  if (h < 14) return 'Buenos días'
  if (h < 21) return 'Buenas tardes'
  return 'Buenas noches'
}

/** Convierte una tarjeta reproducible en TrackSummary mínimo para la cola. */
export function cardToTrack(card: MediaCard): TrackSummary {
  return {
    kind: card.kind === 'video' ? 'video' : 'song',
    videoId: card.id,
    title: card.title,
    artists: card.subtitle ? [{ name: card.subtitle }] : [],
    thumbnailUrl: card.thumbnailUrl
  }
}

export function HomePage(): React.JSX.Element {
  const [shelves, setShelves] = useState<Shelf[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const playTracks = usePlayer((s) => s.playTracks)
  const auth = useAuth((s) => s.state)

  useEffect(() => {
    let cancelled = false
    setShelves(null)
    setError(null)
    void window.api.music
      .home()
      .then((data) => {
        if (!cancelled) setShelves(data)
      })
      .catch((err) => {
        if (!cancelled) setError(String(err?.message ?? err))
      })
    return () => {
      cancelled = true
    }
  }, [auth.status])

  const playCard = (card: MediaCard): void => {
    if (card.kind === 'song' || card.kind === 'video') {
      void playTracks([cardToTrack(card)])
    } else if (card.kind === 'playlist') {
      void window.api.music.playlist(card.id).then((pl) => {
        if (pl.tracks.length) void playTracks(pl.tracks)
      })
    } else if (card.kind === 'album') {
      void window.api.music.album(card.id).then((al) => {
        if (al.tracks.length) void playTracks(al.tracks)
      })
    }
  }

  return (
    <div className="page">
      <h1>{greeting()}</h1>
      {error && <div className="error-banner">No se pudo cargar Inicio: {error}</div>}
      {!shelves && !error && (
        <div className="card-grid">
          {[...Array(7)].map((_, i) => (
            <div key={i}>
              <div className="skeleton" style={{ aspectRatio: '1', marginBottom: 10 }} />
              <div className="skeleton" style={{ height: 14, width: '75%', marginBottom: 6 }} />
              <div className="skeleton" style={{ height: 12, width: '50%' }} />
            </div>
          ))}
        </div>
      )}
      {shelves?.map((shelf, i) => <ShelfRow key={i} shelf={shelf} onPlayItem={playCard} />)}
      {shelves && !shelves.length && (
        <div className="empty-state">
          Inicio está vacío. Inicia sesión para ver tus recomendaciones.
        </div>
      )}
    </div>
  )
}
