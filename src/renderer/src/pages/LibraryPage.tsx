import { useEffect, useMemo, useState } from 'react'
import type { MediaCard, TrackSummary } from '@shared/types'
import { useLibrary, trackMenu } from '../app/libraryStore'
import { openContextMenu } from '../components/ContextMenu'
import { Card } from '../components/Card'
import { TrackTable } from '../components/TrackTable'
import { ListSearchInput } from '../components/ListSearchInput'
import { matchesCard, matchesTrack, useDebouncedValue } from '../app/listFilter'
import { usePlayer } from '../player/store'
import { useT, t as ti } from '../app/i18n'
import { ImportPlaylistModal } from '../components/ImportPlaylistModal'
import appIconUrl from '../assets/icon-256.png'
import { LocalTrackEditModal } from '../components/LocalTrackEditModal'

type Tab = 'playlists' | 'albums' | 'artists' | 'songs' | 'history' | 'localMusic'

/** ADR-0001 · Convierte rows de `local_tracks` (SQLite) a TrackSummary para TrackTable. */
function localToSummary(lt: any): TrackSummary {
  return {
    kind: 'song',
    videoId: `local-${lt.id}`,
    title: lt.title || lt.filePath?.split(/[\\/]/).pop() || '—',
    artists: lt.artist ? [{ name: lt.artist }] : [{ name: lt.format?.toUpperCase() ?? 'Local' }],
    album: lt.album ? { name: lt.album } : undefined,
    durationSec: lt.durationSec ?? 0,
    thumbnailUrl: lt.coverPath || appIconUrl
  }
}

export function LibraryPage(): React.JSX.Element {
  const t = useT()
  const library = useLibrary((s) => s.library)
  const refresh = useLibrary((s) => s.refresh)
  const playTracks = usePlayer((s) => s.playTracks)
  const [tab, setTab] = useState<Tab>('playlists')
  const [history, setHistory] = useState<TrackSummary[]>([])
  const [localTracks, setLocalTracks] = useState<any[]>([])
  // F21: filtro local (no persistente). Se limpia al cambiar de pestaña
  // para que "playlists / daft" no se acarree a "canciones".
  const [filter, setFilter] = useState('')
  const debounced = useDebouncedValue(filter, 150)
  const [importOpen, setImportOpen] = useState(false)
  const [editingLocal, setEditingLocal] = useState<any | null>(null)

  useEffect(() => {
    if (tab === 'history') {
      void window.api.history.list(200).then(setHistory)
    }
    if (tab === 'localMusic') {
      void window.api.localMusic.list().then(setLocalTracks)
    }
    setFilter('')
  }, [tab])

  const tabs: [Tab, string][] = [
    ['playlists', t('library.tab.playlists')],
    ['albums', t('library.tab.albums')],
    ['artists', t('library.tab.artists')],
    ['songs', t('library.tab.songs')],
    ['history', t('library.tab.history')],
    ['localMusic', t('library.tab.downloads')]
  ]

  // Listas filtradas por pestaña — memorizadas para no rehacerlo en cada
  // pulsación de tecla ajena.
  const filterCards = (arr: MediaCard[]): MediaCard[] =>
    debounced ? arr.filter((c) => matchesCard(c, debounced)) : arr
  const filterTracks = (arr: TrackSummary[]): TrackSummary[] =>
    debounced ? arr.filter((t) => matchesTrack(t, debounced)) : arr

  const filteredPlaylists = useMemo(
    () => (library ? filterCards(library.playlists) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [library?.playlists, debounced]
  )
  const filteredAlbums = useMemo(
    () => (library ? filterCards(library.albums) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [library?.albums, debounced]
  )
  const filteredArtists = useMemo(
    () => (library ? filterCards(library.artists) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [library?.artists, debounced]
  )
  const filteredSongs = useMemo(
    () => (library ? filterTracks(library.songs) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [library?.songs, debounced]
  )
  const filteredHistory = useMemo(
    () => filterTracks(history),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, debounced]
  )
  const filteredLocalTracks = useMemo(
    () => {
      if (!debounced) return localTracks
      const q = debounced.toLowerCase()
      return localTracks.filter((t: any) =>
        (t.title?.toLowerCase().includes(q)) ||
        (t.artist?.toLowerCase().includes(q)) ||
        (t.album?.toLowerCase().includes(q))
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [localTracks, debounced]
  )
  const localSummaries = useMemo(
    () => filteredLocalTracks.map(localToSummary),
    [filteredLocalTracks]
  )

  // ¿Hay contenido en la pestaña activa? (para saber si mostrar el buscador)
  const activeHasContent =
    (tab === 'playlists' && (library?.playlists.length ?? 0) > 0) ||
    (tab === 'albums' && (library?.albums.length ?? 0) > 0) ||
    (tab === 'artists' && (library?.artists.length ?? 0) > 0) ||
    (tab === 'songs' && (library?.songs.length ?? 0) > 0) ||
    (tab === 'history' && history.length > 0) ||
    (tab === 'localMusic' && localTracks.length > 0)

  // Recuento tras filtrar — para el mensaje "sin resultados".
  const filteredCount =
    tab === 'playlists'
      ? filteredPlaylists.length
      : tab === 'albums'
        ? filteredAlbums.length
        : tab === 'artists'
          ? filteredArtists.length
          : tab === 'songs'
            ? filteredSongs.length
            : tab === 'history'
              ? filteredHistory.length
              : filteredLocalTracks.length

  return (
    <div className="page">
      <h1>{t('sidebar.library')}</h1>
      {/* F21: chips a la izquierda + buscador a la derecha en la misma fila. */}
      <div className="library-toolbar">
        <div className="sidebar-filters">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              className={`chip ${tab === key ? 'active' : ''}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
          <button className="chip" onClick={() => void refresh()} title={t('library.refreshTitle')}>
            ⟳
          </button>
          <button
            className="chip"
            onClick={() => setImportOpen(true)}
            title={t('library.importPlaylist')}
          >
            + {t('library.importPlaylist')}
          </button>
        </div>
        {activeHasContent && (
          <ListSearchInput
            value={filter}
            onChange={setFilter}
            ariaLabel={t('library.searchAria')}
          />
        )}
      </div>

      {!library && <div className="empty-state">{t('sidebar.signInPrompt')}</div>}

      {library && tab === 'playlists' && (
        <div className="card-grid">
          {filteredPlaylists.map((p, i) => (
            <Card key={`${p.id}-${i}`} item={p} />
          ))}
        </div>
      )}
      {library && tab === 'albums' && (
        <div className="card-grid">
          {filteredAlbums.map((a, i) => (
            <Card key={`${a.id}-${i}`} item={a} />
          ))}
        </div>
      )}
      {library && tab === 'artists' && (
        <div className="card-grid">
          {filteredArtists.map((a, i) => (
            <Card key={`${a.id}-${i}`} item={a} />
          ))}
        </div>
      )}
      {library && tab === 'songs' && (
        <TrackTable
          tracks={filteredSongs}
          showAlbum
          onPlayIndex={(i) => void playTracks(filteredSongs, i)}
          onContextMenu={(e, t) => openContextMenu(e, trackMenu(t))}
        />
      )}
      {tab === 'history' && (
        <TrackTable
          tracks={filteredHistory}
          showAlbum
          onPlayIndex={(i) => void playTracks(filteredHistory, i)}
          onContextMenu={(e, t) => openContextMenu(e, trackMenu(t))}
        />
      )}
      {tab === 'localMusic' && (
        <>
          {localSummaries.length > 0 && (
            <TrackTable
              tracks={localSummaries}
              showAlbum
              onPlayIndex={(i) => void playTracks(localSummaries, i)}
              onContextMenu={(e, tr) => {
                // Buscar el track local original para tener los datos completos.
                const localId = Number(tr.videoId.replace('local-', ''))
                const lt = localTracks.find((x: any) => x.id === localId)
                openContextMenu(e, localTrackMenu(tr, lt, setEditingLocal, () => {
                  void window.api.localMusic.list().then(setLocalTracks)
                }))
              }}
            />
          )}
          {!localTracks.length && (
            <div className="empty-state">
              {t('library.noDownloads')}
            </div>
          )}
        </>
      )}
      {library &&
        (tab === 'playlists' || tab === 'albums' || tab === 'artists' || tab === 'songs') &&
        !library[tab].length && <div className="empty-state">{t('library.empty')}</div>}
      {activeHasContent && debounced && filteredCount === 0 && (
        <div className="empty-state">{t('search.empty', { q: filter })}</div>
      )}
      {importOpen && <ImportPlaylistModal onClose={() => setImportOpen(false)} />}
      {editingLocal && (
        <LocalTrackEditModal
          trackId={editingLocal.id}
          currentTitle={editingLocal.title || ''}
          currentArtist={editingLocal.artist || ''}
          currentAlbum={editingLocal.album || ''}
          currentCoverPath={editingLocal.coverPath}
          onClose={(saved) => {
            setEditingLocal(null)
            if (saved) void window.api.localMusic.list().then(setLocalTracks)
          }}
        />
      )}
    </div>
  )
}

/** F82 · Menú contextual para tracks de música local. */
function localTrackMenu(
  track: TrackSummary,
  lt: any,
  openEdit: (lt: any) => void,
  refresh: () => void
) {
  const player = usePlayer.getState()
  return [
    { label: ti('menu.playNow'), action: () => void player.playNow(track) },
    { label: ti('menu.playNext'), action: () => player.enqueueNext(track) },
    { label: ti('menu.addToQueue'), action: () => player.enqueueLast([track]) },
    { separator: true, label: '' },
    {
      label: ti('library.localMusic.editMeta'),
      action: () => openEdit(lt)
    },
    { separator: true, label: '' },
    {
      label: ti('localEdit.removeTrack'),
      action: () => {
        const name = lt?.title || track.title
        if (confirm(ti('localEdit.removeConfirm', { title: name }))) {
          const id = lt?.id ?? Number(track.videoId.replace('local-', ''))
          void window.api.localMusic.remove(id).then(refresh)
        }
      }
    }
  ]
}
