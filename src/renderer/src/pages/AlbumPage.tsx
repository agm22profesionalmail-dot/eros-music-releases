import { useEffect, useMemo, useState } from 'react'
import type { AlbumDetail } from '@shared/types'
import { TrackTable } from '../components/TrackTable'
import { ListSearchInput } from '../components/ListSearchInput'
import { usePlayer } from '../player/store'
import { useRouter } from '../app/router'
import { openContextMenu } from '../components/ContextMenu'
import { cardMenu, trackMenu } from '../app/libraryStore'
import { useArtworkColor } from '../app/artworkColor'
import { matchesTrack, useDebouncedValue } from '../app/listFilter'
import { pushToast } from '../components/Toast'
import { useT } from '../app/i18n'
import {
  MoreVerticalIcon,
  MusicNoteIcon,
  PauseIcon,
  PlayIcon,
  ShareIcon,
  ShuffleIcon
} from '../components/Icons'

export function AlbumPage({ id }: { id: string }): React.JSX.Element {
  const t = useT()
  const [album, setAlbum] = useState<AlbumDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  // F21: filtro local con debounce (mismo helper que PlaylistPage).
  const [filter, setFilter] = useState('')
  const debounced = useDebouncedValue(filter, 150)
  const playTracks = usePlayer((s) => s.playTracks)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const togglePlay = usePlayer((s) => s.togglePlay)
  const current = usePlayer((s) => s.current())
  const navigate = useRouter((s) => s.navigate)

  useEffect(() => {
    let cancelled = false
    setAlbum(null)
    setError(null)
    setFilter('')
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
  const tint = useArtworkColor(album?.thumbnailUrl)

  const filteredTracks = useMemo(() => {
    if (!album) return []
    if (!debounced) return album.tracks
    return album.tracks.filter((t) => matchesTrack(t, debounced))
  }, [album, debounced])

  if (error) {
    return (
      <div className="page">
        <div className="error-banner">{t('album.loadError', { msg: error })}</div>
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
      <div
        className="detail-header"
        style={tint ? { ['--header-tint' as string]: `linear-gradient(${tint}, ${tint}55)` } : undefined}
      >
        {album.thumbnailUrl ? (
          <img className="cover" src={album.thumbnailUrl} alt="" />
        ) : (
          <div className="cover" style={{ display: 'grid', placeItems: 'center' }}>
            <MusicNoteIcon size={64} />
          </div>
        )}
        <div className="info">
          <div className="kind">{t('media.album')}</div>
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
                <span>{t('media.songCount', { n: album.trackCount })}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="detail-body">
        {/* F43 · agente E — barra de acciones del álbum:
            Play + Shuffle + Compartir + ⋯  (la acción "Guardar en biblioteca"
            de álbumes requiere API que aún no existe en el renderer, así que
            no se pinta el botón; el ⋯ ofrece Play/Next/Cola/Compartir vía
            `cardMenu('album')`, que sí funciona hoy). */}
        <div className="detail-actions">
          <button
            className={`big-play ${isThisPlaying ? 'is-playing' : ''}`}
            aria-label={t('album.playAria')}
            onClick={() => {
              if (isThisPlaying) togglePlay()
              else if (album.tracks.length) void playTracks(album.tracks)
            }}
          >
            {isThisPlaying ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
          </button>
          {album.tracks.length > 0 && (
            <button
              className="action-mini"
              aria-label={t('common.shufflePlay')}
              title={t('common.shufflePlay')}
              onClick={() => {
                void (async () => {
                  await playTracks(album.tracks, 0)
                  if (!usePlayer.getState().shuffle) usePlayer.getState().toggleShuffle()
                })()
              }}
            >
              <ShuffleIcon size={20} />
            </button>
          )}
          <button
            className="action-mini"
            aria-label={t('album.shareAria')}
            title={t('common.share')}
            onClick={() => {
              void (async () => {
                try {
                  await navigator.clipboard.writeText(
                    `https://music.youtube.com/browse/${album.id}`
                  )
                  pushToast(t('toast.linkCopied'))
                } catch {
                  pushToast(t('toast.linkCopyFailed'))
                }
              })()
            }}
          >
            <ShareIcon size={18} />
          </button>
          <button
            className="action-mini"
            aria-label={t('common.moreActions')}
            title={t('common.moreActions')}
            onClick={(e) =>
              openContextMenu(
                e,
                cardMenu({
                  kind: 'album',
                  id: album.id,
                  title: album.title,
                  thumbnailUrl: album.thumbnailUrl
                })
              )
            }
          >
            <MoreVerticalIcon size={20} />
          </button>
          {album.tracks.length > 0 && (
            <ListSearchInput
              value={filter}
              onChange={setFilter}
              ariaLabel={t('album.searchAria')}
            />
          )}
        </div>
        <TrackTable
          tracks={filteredTracks}
          showArt={false}
          onPlayIndex={(i) => void playTracks(filteredTracks, i)}
          onContextMenu={(e, t) => openContextMenu(e, trackMenu(t))}
        />
        {debounced && album.tracks.length > 0 && filteredTracks.length === 0 && (
          <div className="empty-state">{t('search.empty', { q: filter })}</div>
        )}
      </div>
    </>
  )
}
