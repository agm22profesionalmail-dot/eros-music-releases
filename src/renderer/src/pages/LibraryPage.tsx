import { useEffect, useState } from 'react'
import type { TrackSummary } from '@shared/types'
import { useLibrary, trackMenu } from '../app/libraryStore'
import { openContextMenu } from '../components/ContextMenu'
import { Card } from '../components/Card'
import { TrackTable } from '../components/TrackTable'
import { usePlayer } from '../player/store'

type Tab = 'playlists' | 'albums' | 'artists' | 'songs' | 'history'

export function LibraryPage(): React.JSX.Element {
  const library = useLibrary((s) => s.library)
  const refresh = useLibrary((s) => s.refresh)
  const playTracks = usePlayer((s) => s.playTracks)
  const [tab, setTab] = useState<Tab>('playlists')
  const [history, setHistory] = useState<TrackSummary[]>([])

  useEffect(() => {
    if (tab === 'history') {
      void window.api.history.list(200).then(setHistory)
    }
  }, [tab])

  const tabs: [Tab, string][] = [
    ['playlists', 'Playlists'],
    ['albums', 'Álbumes'],
    ['artists', 'Artistas'],
    ['songs', 'Canciones'],
    ['history', 'Historial']
  ]

  return (
    <div className="page">
      <h1>Tu biblioteca</h1>
      <div className="sidebar-filters" style={{ padding: '0 0 16px' }}>
        {tabs.map(([key, label]) => (
          <button
            key={key}
            className={`chip ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
        <button className="chip" onClick={() => void refresh()} title="Recargar de la cuenta">
          ⟳
        </button>
      </div>

      {!library && <div className="empty-state">Inicia sesión para ver tu biblioteca</div>}

      {library && tab === 'playlists' && (
        <div className="card-grid">
          {library.playlists.map((p, i) => (
            <Card key={`${p.id}-${i}`} item={p} />
          ))}
        </div>
      )}
      {library && tab === 'albums' && (
        <div className="card-grid">
          {library.albums.map((a, i) => (
            <Card key={`${a.id}-${i}`} item={a} />
          ))}
        </div>
      )}
      {library && tab === 'artists' && (
        <div className="card-grid">
          {library.artists.map((a, i) => (
            <Card key={`${a.id}-${i}`} item={a} />
          ))}
        </div>
      )}
      {library && tab === 'songs' && (
        <TrackTable
          tracks={library.songs}
          showAlbum
          onPlayIndex={(i) => void playTracks(library.songs, i)}
          onContextMenu={(e, t) => openContextMenu(e, trackMenu(t))}
        />
      )}
      {tab === 'history' && (
        <TrackTable
          tracks={history}
          showAlbum
          onPlayIndex={(i) => void playTracks(history, i)}
          onContextMenu={(e, t) => openContextMenu(e, trackMenu(t))}
        />
      )}
      {library && tab !== 'history' && !library[tab === 'songs' ? 'songs' : tab]?.length && (
        <div className="empty-state">Nada por aquí todavía</div>
      )}
    </div>
  )
}
