import { useEffect, useState } from 'react'
import type { ArtistDetail, MediaCard } from '@shared/types'
import { ShelfRow } from '../components/Shelf'
import { usePlayer } from '../player/store'
import { cardToTrack } from './HomePage'
import { PersonIcon, PlayIcon } from '../components/Icons'

export function ArtistPage({ id }: { id: string }): React.JSX.Element {
  const [artist, setArtist] = useState<ArtistDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const playTracks = usePlayer((s) => s.playTracks)

  useEffect(() => {
    let cancelled = false
    setArtist(null)
    setError(null)
    void window.api.music
      .artist(id)
      .then((data) => {
        if (!cancelled) setArtist(data)
      })
      .catch((err) => {
        if (!cancelled) setError(String(err?.message ?? err))
      })
    return () => {
      cancelled = true
    }
  }, [id])

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

  const playTop = (): void => {
    // Reproduce la primera estantería de canciones del artista
    const songsShelf = artist?.shelves.find((s) => s.items.some((i) => i.kind === 'song'))
    if (!songsShelf) return
    const tracks = songsShelf.items.filter((i) => i.kind === 'song').map(cardToTrack)
    if (tracks.length) void playTracks(tracks)
  }

  if (error) {
    return (
      <div className="page">
        <div className="error-banner">No se pudo cargar el artista: {error}</div>
      </div>
    )
  }

  if (!artist) {
    return (
      <div className="detail-header artist">
        <div className="skeleton" style={{ width: 224, height: 224, borderRadius: '50%' }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 14, width: 80, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 48, width: '50%' }} />
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="detail-header artist">
        {artist.thumbnailUrl ? (
          <img className="cover" src={artist.thumbnailUrl} alt="" />
        ) : (
          <div
            className="cover"
            style={{ display: 'grid', placeItems: 'center', borderRadius: '50%' }}
          >
            <PersonIcon size={64} />
          </div>
        )}
        <div className="info">
          <div className="kind">Artista</div>
          <h1 className="name">{artist.name}</h1>
          {artist.subscribers && <div className="meta">{artist.subscribers}</div>}
        </div>
      </div>
      <div className="detail-body">
        <div className="detail-actions">
          <button className="big-play" aria-label="Reproducir artista" onClick={playTop}>
            <PlayIcon size={22} />
          </button>
        </div>
        <div className="page" style={{ padding: 0 }}>
          {artist.shelves.map((shelf, i) => (
            <ShelfRow key={i} shelf={shelf} onPlayItem={playCard} limit={6} />
          ))}
        </div>
      </div>
    </>
  )
}
