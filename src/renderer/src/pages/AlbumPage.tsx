import { useEffect, useState } from 'react'
import type { AlbumDetail } from '@shared/types'
import { TrackTable } from '../components/TrackTable'
import { usePlayer } from '../player/store'
import { useRouter } from '../app/router'
import { MusicNoteIcon, PauseIcon, PlayIcon } from '../components/Icons'

export function AlbumPage({ id }: { id: string }): React.JSX.Element {
  const [album, setAlbum] = useState<AlbumDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const playTracks = usePlayer((s) => s.playTracks)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const togglePlay = usePlayer((s) => s.togglePlay)
  const current = usePlayer((s) => s.current())
  const navigate = useRouter((s) => s.navigate)

  useEffect(() => {
    let cancelled = false
    setAlbum(null)
    setError(null)
    void window.api.music
      .album(id)
      .then((data) => {
        if (!cancelled) setAlbum(data)
      })
      .catch((err) => {
        if (!cancelled) setError(String(err?.message ?? err))
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const isThisPlaying = isPlaying && album?.tracks.some((t) => t.videoId === current?.videoId)

  if (error) {
    return (
      <div className="page">
        <div className="error-banner">No se pudo cargar el álbum: {error}</div>
      </div>
    )
  }

  if (!album) {
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
      <div className="detail-header">
        {album.thumbnailUrl ? (
          <img className="cover" src={album.thumbnailUrl} alt="" />
        ) : (
          <div className="cover" style={{ display: 'grid', placeItems: 'center' }}>
            <MusicNoteIcon size={64} />
          </div>
        )}
        <div className="info">
          <div className="kind">Álbum</div>
          <h1 className="name">{album.title}</h1>
          <div className="meta">
            {album.artists.map((a, i) => (
              <span key={`${a.id ?? a.name}-${i}`}>
                {i > 0 && ', '}
                {a.id ? (
                  <b>
                    <a onClick={() => navigate({ name: 'artist', id: a.id! })}>{a.name}</a>
                  </b>
                ) : (
                  <b>{a.name}</b>
                )}
              </span>
            ))}
            {album.year && (
              <>
                <span>·</span>
                <span>{album.year}</span>
              </>
            )}
            {album.trackCount != null && (
              <>
                <span>·</span>
                <span>{album.trackCount} canciones</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="detail-body">
        <div className="detail-actions">
          <button
            className="big-play"
            aria-label="Reproducir álbum"
            onClick={() => {
              if (isThisPlaying) togglePlay()
              else if (album.tracks.length) void playTracks(album.tracks)
            }}
          >
            {isThisPlaying ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
          </button>
        </div>
        <TrackTable
          tracks={album.tracks}
          showArt={false}
          onPlayIndex={(i) => void playTracks(album.tracks, i)}
        />
      </div>
    </>
  )
}
