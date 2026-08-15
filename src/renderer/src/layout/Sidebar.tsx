import { useState } from 'react'
import type { MediaCard } from '@shared/types'
import { useRouter } from '../app/router'
import { useAuth } from '../app/authStore'
import { useLibrary, cardMenu } from '../app/libraryStore'
import { openContextMenu } from '../components/ContextMenu'
import {
  HomeIcon,
  LibraryIcon,
  MusicNoteIcon,
  PersonIcon,
  SearchIcon
} from '../components/Icons'

type Filter = 'all' | 'playlists' | 'albums' | 'artists'

export function Sidebar(): React.JSX.Element {
  const route = useRouter((s) => s.route())
  const navigate = useRouter((s) => s.navigate)
  const auth = useAuth((s) => s.state)
  const library = useLibrary((s) => s.library)
  const [filter, setFilter] = useState<Filter>('all')

  const rows: { card: MediaCard; sub: string }[] = []
  if (library) {
    if (filter === 'all' || filter === 'playlists') {
      rows.push(...library.playlists.map((card) => ({ card, sub: card.subtitle ?? 'Playlist' })))
    }
    if (filter === 'all' || filter === 'albums') {
      rows.push(...library.albums.map((card) => ({ card, sub: card.subtitle ?? 'Álbum' })))
    }
    if (filter === 'all' || filter === 'artists') {
      rows.push(...library.artists.map((card) => ({ card, sub: 'Artista' })))
    }
  }

  const openCard = (card: MediaCard): void => {
    if (card.kind === 'playlist') navigate({ name: 'playlist', id: card.id })
    else if (card.kind === 'album') navigate({ name: 'album', id: card.id })
    else if (card.kind === 'artist') navigate({ name: 'artist', id: card.id })
  }

  const isActive = (card: MediaCard): boolean =>
    (route.name === 'playlist' || route.name === 'album' || route.name === 'artist') &&
    'id' in route &&
    route.id === card.id

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        <button
          className={`sidebar-nav-item ${route.name === 'home' ? 'active' : ''}`}
          onClick={() => navigate({ name: 'home' })}
        >
          <HomeIcon size={24} /> Inicio
        </button>
        <button
          className={`sidebar-nav-item ${route.name === 'search' ? 'active' : ''}`}
          onClick={() => navigate({ name: 'search' })}
        >
          <SearchIcon size={24} /> Buscar
        </button>
        {/* F32 · Acceso rápido al Recap */}
        <button
          className={`sidebar-nav-item ${route.name === 'recap' ? 'active' : ''}`}
          onClick={() => navigate({ name: 'recap' })}
        >
          <span aria-hidden="true" style={{ fontSize: 20, width: 24, textAlign: 'center' }}>
            📊
          </span>
          Recap
        </button>
      </nav>

      <div className="sidebar-library">
        <div className="sidebar-library-header">
          <button
            className="left"
            style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'inherit', fontWeight: 700, fontSize: 15 }}
            onClick={() => navigate({ name: 'library' })}
          >
            <LibraryIcon size={24} /> Tu biblioteca
          </button>
          {auth.status === 'signedIn' && (
            <button
              className="icon-btn"
              title="Crear playlist"
              style={{ fontSize: 22, lineHeight: 1, width: 32, height: 32, borderRadius: '50%' }}
              onClick={() => {
                void import('../components/TextModal').then(({ askText }) =>
                  askText({
                    title: 'Nueva playlist',
                    placeholder: 'Nombre de la playlist',
                    confirmLabel: 'Crear'
                  }).then((title) => {
                    if (title) {
                      void window.api.library
                        .playlistCreate(title, [])
                        .then(() => useLibrary.getState().refresh())
                    }
                  })
                )
              }}
            >
              +
            </button>
          )}
        </div>

        {auth.status === 'signedIn' && (
          <div className="sidebar-filters">
            {(
              [
                ['all', 'Todo'],
                ['playlists', 'Playlists'],
                ['albums', 'Álbumes'],
                ['artists', 'Artistas']
              ] as [Filter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                className={`chip ${filter === key ? 'active' : ''}`}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="sidebar-library-list">
          {auth.status !== 'signedIn' && (
            <div className="empty-state" style={{ padding: '24px 16px', fontSize: 13 }}>
              Inicia sesión para ver tu biblioteca
            </div>
          )}
          {auth.status === 'signedIn' && !library && (
            <>
              {[...Array(8)].map((_, i) => (
                <div key={i} className="library-row">
                  <div className="skeleton" style={{ width: 48, height: 48 }} />
                  <div>
                    <div className="skeleton" style={{ height: 14, width: '70%', marginBottom: 6 }} />
                    <div className="skeleton" style={{ height: 12, width: '45%' }} />
                  </div>
                </div>
              ))}
            </>
          )}
          {rows.map(({ card, sub }, i) => (
            <button
              key={`${card.id}-${i}`}
              className={`library-row ${card.kind === 'artist' ? 'artist' : ''} ${isActive(card) ? 'active' : ''}`}
              onClick={() => openCard(card)}
              // F22b · Clic derecho abre el menú contextual específico
              // (playlist/álbum/artista) — misma fábrica que las tarjetas.
              onContextMenu={(e) => openContextMenu(e, cardMenu(card))}
            >
              {card.thumbnailUrl ? (
                <img src={card.thumbnailUrl} alt="" loading="lazy" />
              ) : (
                <span className="ph">
                  {card.kind === 'artist' ? <PersonIcon size={22} /> : <MusicNoteIcon size={22} />}
                </span>
              )}
              <span className="meta">
                <span className="title">{card.title}</span>
                <span className="subtitle">{sub}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
