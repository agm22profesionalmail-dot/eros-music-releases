import type { TrackSummary } from '@shared/types'
import { formatTime } from '../app/authStore'
import { usePlayer } from '../player/store'
import { useRouter } from '../app/router'
import { useT } from '../app/i18n'
import { ClockIcon, MusicNoteIcon, PlayIcon } from './Icons'

interface TrackTableProps {
  tracks: TrackSummary[]
  showAlbum?: boolean
  showArt?: boolean
  /** Reproduce la lista completa empezando por el índice pulsado */
  onPlayIndex?: (index: number) => void
  onContextMenu?: (e: React.MouseEvent, track: TrackSummary, index: number) => void
}

export function TrackTable({
  tracks,
  showAlbum = false,
  showArt = true,
  onPlayIndex,
  onContextMenu
}: TrackTableProps): React.JSX.Element {
  const t = useT()
  const current = usePlayer((s) => s.current())
  const pendingJump = usePlayer((s) => s.pendingJump)
  const navigate = useRouter((s) => s.navigate)

  return (
    <div className={`track-table ${showAlbum ? 'with-album' : ''}`}>
      <div className="thead">
        <span style={{ textAlign: 'right' }}>#</span>
        <span>{t('table.title')}</span>
        {showAlbum && <span>{t('table.album')}</span>}
        <span></span>
        <span style={{ display: 'grid', placeItems: 'center' }}>
          <ClockIcon size={16} />
        </span>
      </div>
      {tracks.map((t, i) => {
        const isPlaying = current?.videoId === t.videoId
        // F54 · Fila clicada mientras se resuelve su stream: pulso "cargando"
        const isPending = pendingJump?.videoId === t.videoId && !isPlaying
        return (
          <button
            key={`${t.videoId}-${i}`}
            className={`track-row ${isPlaying ? 'playing' : ''} ${isPending ? 'pending-jump' : ''}`}
            style={{ ['--i' as string]: Math.min(i, 30) }}
            onDoubleClick={() => onPlayIndex?.(i)}
            onContextMenu={(e) => onContextMenu?.(e, t, i)}
          >
            <span className="num">
              <span className="n">{i + 1}</span>
              <span
                className="play-hover"
                onClick={(e) => {
                  e.stopPropagation()
                  onPlayIndex?.(i)
                }}
              >
                <PlayIcon size={14} />
              </span>
            </span>
            <span className="main">
              {showArt &&
                (t.thumbnailUrl ? (
                  <img src={t.thumbnailUrl} alt="" loading="lazy" />
                ) : (
                  <span className="ph">
                    <MusicNoteIcon size={20} />
                  </span>
                ))}
              <span className="tcol">
                <span className="title-text">{t.title}</span>
                <span className="artists-text">
                  {t.isExplicit && <span className="explicit-badge">E</span>}
                  {t.artists.map((a, j) => (
                    <span key={`${a.id ?? a.name}-${j}`}>
                      {j > 0 && ', '}
                      {a.id ? (
                        <a
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate({ name: 'artist', id: a.id! })
                          }}
                        >
                          {a.name}
                        </a>
                      ) : (
                        a.name
                      )}
                    </span>
                  ))}
                </span>
              </span>
            </span>
            {showAlbum && (
              <span className="album-text">
                {t.album?.id ? (
                  <a
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate({ name: 'album', id: t.album!.id! })
                    }}
                  >
                    {t.album.name}
                  </a>
                ) : (
                  (t.album?.name ?? '')
                )}
              </span>
            )}
            <span></span>
            <span className="duration">
              {t.durationText ?? (t.durationSec ? formatTime(t.durationSec) : '')}
            </span>
          </button>
        )
      })}
    </div>
  )
}
