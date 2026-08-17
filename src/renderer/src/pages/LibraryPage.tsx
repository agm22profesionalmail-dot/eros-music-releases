import { useEffect, useMemo, useState } from 'react'
import type { MediaCard, TrackSummary } from '@shared/types'
import { useLibrary, trackMenu } from '../app/libraryStore'
import { openContextMenu } from '../components/ContextMenu'
import { Card } from '../components/Card'
import { TrackTable } from '../components/TrackTable'
import { ListSearchInput } from '../components/ListSearchInput'
import { matchesCard, matchesTrack, useDebouncedValue } from '../app/listFilter'
import { usePlayer } from '../player/store'
import { useT } from '../app/i18n'
import { ImportPlaylistModal } from '../components/ImportPlaylistModal'

type Tab = 'playlists' | 'albums' | 'artists' | 'songs' | 'history' | 'downloads'

export function LibraryPage(): React.JSX.Element {
  const t = useT()
  const library = useLibrary((s) => s.library)
  const refresh = useLibrary((s) => s.refresh)
  const playTracks = usePlayer((s) => s.playTracks)
  const [tab, setTab] = useState<Tab>('playlists')
  const [history, setHistory] = useState<TrackSummary[]>([])
  const [downloadsList, setDownloadsList] = useState<TrackSummary[]>([])
  // F21: filtro local (no persistente). Se limpia al cambiar de pestaña
  // para que "playlists / daft" no se acarree a "canciones".
  const [filter, setFilter] = useState('')
  const debounced = useDebouncedValue(filter, 150)
  const [importOpen, setImportOpen] = useState(false)

  useEffect(() => {
    if (tab === 'history') {
      void window.api.history.list(200).then(setHistory)
    }
    if (tab === 'downloads') {
      void window.api.downloads.list().then((d) => setDownloadsList(d.map((x) => x.track)))
    }
    setFilter('')
  }, [tab])

  const tabs: [Tab, string][] = [
    ['playlists', t('library.tab.playlists')],
    ['albums', t('library.tab.albums')],
    ['artists', t('library.tab.artists')],
    ['songs', t('library.tab.songs')],
    ['history', t('library.tab.history')],
    ['downloads', t('library.tab.downloads')]
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
  const filteredDownloads = useMemo(
    () => filterTracks(downloadsList),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [downloadsList, debounced]
  )

  // ¿Hay contenido en la pestaña activa? (para saber si mostrar el buscador)
  const activeHasContent =
    (tab === 'playlists' && (library?.playlists.length ?? 0) > 0) ||
    (tab === 'albums' && (library?.albums.length ?? 0) > 0) ||
    (tab === 'artists' && (library?.artists.length ?? 0) > 0) ||
    (tab === 'songs' && (library?.songs.length ?? 0) > 0) ||
    (tab === 'history' && history.length > 0) ||
    (tab === 'downloads' && downloadsList.length > 0)

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
              : filteredDownloads.length

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
      {tab === 'downloads' && (
        <>
          <TrackTable
            tracks={filteredDownloads}
            showAlbum
            onPlayIndex={(i) => void playTracks(filteredDownloads, i)}
            onContextMenu={(e, track) =>
              openContextMenu(e, [
                ...trackMenu(track),
                { separator: true, label: '' },
                {
                  label: t('library.removeDownload'),
                  action: () =>
                    void window.api.downloads.remove(track.videoId).then(() =>
                      window.api.downloads.list().then((d) => setDownloadsList(d.map((x) => x.track)))
                    )
                }
              ])
            }
          />
          {!downloadsList.length && (
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
    </div>
  )
}
