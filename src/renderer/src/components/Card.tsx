import type { MediaCard } from '@shared/types'
import { useT } from '../app/i18n'
import { PlayIcon, MusicNoteIcon, PersonIcon } from './Icons'
import { useRouter } from '../app/router'
import { openContextMenu } from './ContextMenu'
import { cardMenu } from '../app/libraryStore'

interface CardProps {
  item: MediaCard
  onPlay?: (item: MediaCard) => void
  /** Índice para la entrada escalonada */
  index?: number
  /**
   * F22b · Contexto opcional del artista dueño de la tarjeta (útil en
   * ArtistPage y AlbumPage para ofrecer "Ir al artista" en el menú
   * contextual de una canción/álbum sin volver a resolver relaciones).
   */
  artistId?: string
  artistName?: string
}

export function Card({
  item,
  onPlay,
  index = 0,
  artistId,
  artistName
}: CardProps): React.JSX.Element {
  const t = useT()
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

  // F22b · Clic derecho en CUALQUIER tarjeta abre el menú específico según
  // su `kind` — la fábrica `cardMenu` decide los items.
  const onContext = (e: React.MouseEvent): void => {
    openContextMenu(e, cardMenu(item, { artistId, artistName }))
  }

  return (
    <div
      className={`media-card ${item.kind === 'artist' ? 'artist' : ''}`}
      style={{ ['--i' as string]: Math.min(index, 20) }}
      onClick={open}
      onContextMenu={onContext}
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
            aria-label={t('common.play')}
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
