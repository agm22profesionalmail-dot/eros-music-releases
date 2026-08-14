import { useEffect, useRef, useState } from 'react'
import { TitleBar } from './layout/TitleBar'
import { Sidebar } from './layout/Sidebar'
import { NowPlayingBar } from './layout/NowPlayingBar'
import { QueuePanel } from './layout/QueuePanel'
import { HomePage } from './pages/HomePage'
import { SearchPage } from './pages/SearchPage'
import { PlaylistPage } from './pages/PlaylistPage'
import { AlbumPage } from './pages/AlbumPage'
import { ArtistPage } from './pages/ArtistPage'
import { LoginPage } from './pages/LoginPage'
import { LibraryPage } from './pages/LibraryPage'
import { SettingsPage } from './pages/SettingsPage'
import { LyricsPage } from './pages/LyricsPage'
import { ContextMenuHost } from './components/ContextMenu'
import { useLibrary } from './app/libraryStore'
import { useSettings } from './app/settingsStore'
import { initMediaIntegration } from './player/mediaSession'
import { useRouter } from './app/router'
import { useAuth } from './app/authStore'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PersonIcon,
  SearchIcon,
  SettingsIcon
} from './components/Icons'

export default function App(): React.JSX.Element {
  const route = useRouter((s) => s.route())
  const navigate = useRouter((s) => s.navigate)
  const back = useRouter((s) => s.back)
  const forward = useRouter((s) => s.forward)
  const canBack = useRouter((s) => s.canBack())
  const canForward = useRouter((s) => s.canForward())
  const auth = useAuth((s) => s.state)
  const initAuth = useAuth((s) => s.init)

  const [queueOpen, setQueueOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const initSettings = useSettings((s) => s.init)
  useEffect(() => {
    initAuth()
    void initSettings()
    return initMediaIntegration()
  }, [initAuth, initSettings])

  // Carga la biblioteca cuando hay sesión; límpiala al cerrar sesión
  const loadLibrary = useLibrary((s) => s.load)
  const clearLibrary = useLibrary((s) => s.clear)
  useEffect(() => {
    if (auth.status === 'signedIn') void loadLibrary()
    else clearLibrary()
  }, [auth.status, loadLibrary, clearLibrary])

  // Restablece el scroll al cambiar de página
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [route])

  const searching = route.name === 'search'

  return (
    <div className="shell">
      <TitleBar />
      <div className={`shell-main ${queueOpen ? 'with-queue' : ''}`}>
        <Sidebar />
        <main className="main-view">
          <div
            className="main-scroll"
            ref={scrollRef}
            onScroll={(e) => setScrolled((e.target as HTMLDivElement).scrollTop > 10)}
          >
            <div className={`topbar ${scrolled ? 'scrolled' : ''}`}>
              <button
                className="nav-circle"
                disabled={!canBack}
                onClick={back}
                aria-label="Atrás"
              >
                <ChevronLeftIcon size={18} />
              </button>
              <button
                className="nav-circle"
                disabled={!canForward}
                onClick={forward}
                aria-label="Adelante"
              >
                <ChevronRightIcon size={18} />
              </button>

              {searching && (
                <div className="topbar-search">
                  <span className="icon">
                    <SearchIcon size={18} />
                  </span>
                  <input
                    autoFocus
                    placeholder="¿Qué quieres reproducir?"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                  />
                </div>
              )}

              <div className="topbar-right">
                <button
                  className="avatar-btn"
                  title="Ajustes"
                  onClick={() => navigate({ name: 'settings' })}
                >
                  <SettingsIcon size={18} />
                </button>
                {auth.status === 'signedIn' ? (
                  <button
                    className="avatar-btn"
                    title="Cuenta"
                    onClick={() => {
                      if (confirm('¿Cerrar sesión?')) void window.api.auth.signOut()
                    }}
                  >
                    {auth.accountPhotoUrl ? (
                      <img src={auth.accountPhotoUrl} alt="" />
                    ) : (
                      <PersonIcon size={18} />
                    )}
                  </button>
                ) : (
                  <button
                    className="btn btn-primary"
                    style={{ padding: '8px 20px' }}
                    onClick={() => navigate({ name: 'home' })}
                  >
                    {auth.status === 'pendingDeviceCode' ? 'Vinculando…' : 'Iniciar sesión'}
                  </button>
                )}
              </div>
            </div>

            {/* Página activa */}
            {auth.status !== 'signedIn' && route.name === 'home' ? (
              <LoginPage />
            ) : (
              <>
                {route.name === 'home' && <HomePage />}
                {route.name === 'search' && <SearchPage query={searchText} />}
                {route.name === 'playlist' && <PlaylistPage id={route.id} />}
                {route.name === 'album' && <AlbumPage id={route.id} />}
                {route.name === 'artist' && <ArtistPage id={route.id} />}
                {route.name === 'library' && <LibraryPage />}
                {route.name === 'lyrics' && <LyricsPage />}
                {route.name === 'settings' && <SettingsPage />}
              </>
            )}
          </div>
        </main>
        {queueOpen && <QueuePanel onClose={() => setQueueOpen(false)} />}
      </div>
      <NowPlayingBar queueOpen={queueOpen} onToggleQueue={() => setQueueOpen((v) => !v)} />
      <ContextMenuHost />
    </div>
  )
}
