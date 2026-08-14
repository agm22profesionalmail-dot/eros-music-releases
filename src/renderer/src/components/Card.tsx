import type { MediaCard } from '@shared/types'
import { PlayIcon, MusicNoteIcon, PersonIcon } from './Icons'
import { useRouter } from '../app/router'

interface CardProps {
  item: MediaCard
  onPlay?: (item: MediaCard) => void
}

export function Card({ item, onPlay }: CardProps): React.JSX.Element {
  const navigate = useRouter((s) => s.navigate)

  const open = (): void => {
    switch (item.kind) {
      case 'album':
        navigate({ name: 'album', id: item.id })
        break
      case 'playlist':
        navigate({ name: 'playlist', id: item.id })
        break
      case 'artist':
        navigate({ name: 'artist', id: item.id })
        break
      case 'song':
      case 'video':
        onPlay?.(item)
        break
      default:
        break
    }
  }

  return (
    <div
      className={`media-card ${item.kind === 'artist' ? 'artist' : ''}`}
      onClick={open}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && open()}
    >
      <div className="art">
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt="" loading="lazy" />
        ) : (
          <div className="ph">
            {item.kind === 'artist' ? <PersonIcon size={48} /> : <MusicNoteIcon size={48} />}
          </div>
        )}
        {onPlay && item.kind !== 'artist' && (
          <button
            className="hover-play"
            aria-label="Reproducir"
            onClick={(e) => {
              e.stopPropagation()
              onPlay(item)
            }}
          >
            <PlayIcon size={22} />
          </button>
        )}
      </div>
      <div className="title">{item.title}</div>
      {item.subtitle && <div className="subtitle">{item.subtitle}</div>}
    </div>
  )
}
