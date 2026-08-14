import { useEffect, useState } from 'react'
import type { PlaylistDetail } from '@shared/types'
import { TrackTable } from '../components/TrackTable'
import { usePlayer } from '../player/store'
import { openContextMenu } from '../components/ContextMenu'
import { trackMenu } from '../app/libraryStore'
import { MusicNoteIcon, PauseIcon, PlayIcon } from '../components/Icons'

export function PlaylistPage({ id }: { id: string }): React.JSX.Element {
  const [pl, setPl] = useState<PlaylistDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const playTracks = usePlayer((s) => s.playTracks)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const togglePlay = usePlayer((s) => s.togglePlay)
  const current = usePlayer((s) => s.current())

  useEffect(() => {
    let cancelled = false
    setPl(null)
    setError(null)
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
      <div className="detail-header">
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
            {pl.author && <b>{pl.author}</b>}
            {pl.trackCount != null && (
              <>
                <span>·</span>
                <span>{pl.trackCount} canciones</span>
              </>
            )}
            {pl.durationText && (
              <>
                <span>·</span>
                <span>{pl.durationText}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="detail-body">
        <div className="detail-actions">
          <button
            className="big-play"
            aria-label="Reproducir playlist"
            onClick={() => {
              if (isThisPlaying) togglePlay()
              else if (pl.tracks.length) void playTracks(pl.tracks)
            }}
          >
            {isThisPlaying ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
          </button>
        </div>
        <TrackTable
          tracks={pl.tracks}
          showAlbum
          onPlayIndex={(i) => void playTracks(pl.tracks, i)}
          onContextMenu={(e, t) => openContextMenu(e, trackMenu(t, { playlistId: id }))}
        />
        {!pl.tracks.length && <div className="empty-state">Esta playlist está vacía</div>}
      </div>
    </>
  )
}
