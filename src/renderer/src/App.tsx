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
import { ProfilePage } from './pages/ProfilePage'
import { LyricsPage } from './pages/LyricsPage'
import { VisualizerPage } from './pages/VisualizerPage'
import { RecapPage } from './pages/RecapPage'
import { ContextMenuHost } from './components/ContextMenu'
import { TextModalHost } from './components/TextModal'
import { ToastHost } from './components/Toast'
import { UpdateBanner } from './components/UpdateBanner'
import { AmbientBackground } from './components/AmbientBackground'
import { OnboardingWizard } from './components/onboarding/OnboardingWizard'
import { LoadingSpinner } from './components/LoadingSpinner'
import { useLibrary } from './app/libraryStore'
import { useSettings } from './app/settingsStore'
import { useProfile } from './app/profileStore'
import { useAmbient } from './app/ambientStore'
import { useOnboarding } from './app/onboardingStore'
import { useUpdater } from './app/updaterStore'
import { initMediaIntegration } from './player/mediaSession'
import { useRouter } from './app/router'
import { useAuth } from './app/authStore'
import { useT } from './app/i18n'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PersonIcon,
  SearchIcon,
  SettingsIcon
} from './components/Icons'

export default function App(): React.JSX.Element {
  const t = useT()
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

  // F60 · Navegar a `search` con query programática (p. ej. clic en un artista
  // sin id desde la barra inferior) rellena la caja. El ref evita pisar lo que
  // el usuario teclee después: la misma query de ruta solo se aplica una vez.
  const appliedRouteQuery = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (route.name !== 'search') {
      appliedRouteQuery.current = undefined
      return
    }
    if (route.query && route.query !== appliedRouteQuery.current) {
      appliedRouteQuery.current = route.query
      setSearchText(route.query)
    }
  }, [route])

  const routeKey = (r: { name: string; id?: string }): string =>
    r.id ? `${r.name}-${r.id}` : r.name

  const initSettings = useSettings((s) => s.init)
  const initAmbient = useAmbient((s) => s.init)
  const initProfile = useProfile((s) => s.init)
  const profile = useProfile((s) => s.profile)
  // F61 · Asistente de bienvenida: `init()` consulta el flag persistido en
  // SQLite. Hasta que responde, la zona de páginas muestra el LoadingSpinner
  // (nunca un flash de LoginPage que el wizard taparía un frame después).
  const initOnboarding = useOnboarding((s) => s.init)
  const onbLoaded = useOnboarding((s) => s.loaded)
  const onbActive = useOnboarding((s) => s.active)
  // F67 · Registra los listeners de actualización una sola vez (guard interno).
  const initUpdater = useUpdater((s) => s.init)
  useEffect(() => {
    initAuth()
    void initSettings()
    void initProfile()
    void initOnboarding()
    initAmbient()
    initUpdater()
    return initMediaIntegration()
  }, [initAuth, initSettings, initProfile, initOnboarding, initAmbient, initUpdater])

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
      <AmbientBackground />
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
                aria-label={t('nav.back')}
              >
                <ChevronLeftIcon size={18} />
              </button>
              <button
                className="nav-circle"
                disabled={!canForward}
                onClick={forward}
                aria-label={t('nav.forward')}
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
                    placeholder={t('nav.searchPlaceholder')}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                  />
                </div>
              )}

              <div className="topbar-right">
                <button
                  className="avatar-btn"
                  title={t('nav.settings')}
                  onClick={() => navigate({ name: 'settings' })}
                >
                  <SettingsIcon size={18} />
                </button>
                {auth.status === 'signedIn' ? (() => {
                  // F22c · La foto efectiva depende de si el perfil personalizado
                  // está activo. Usamos `key` para forzar remount del <img>
                  // cuando cambia — de otro modo React reutiliza el nodo y
                  // el navegador puede mantener la imagen anterior cacheada.
                  const effectivePhotoUrl =
                    profile.enabled && profile.photoDataUrl
                      ? profile.photoDataUrl
                      : auth.accountPhotoUrl
                  return (
                    <button
                      className="avatar-btn"
                      title={
                        (profile.enabled ? profile.displayName : auth.accountName) || t('nav.profile')
                      }
                      onClick={() => navigate({ name: 'profile' })}
                    >
                      {effectivePhotoUrl ? (
                        <img key={effectivePhotoUrl} src={effectivePhotoUrl} alt="" />
                      ) : (
                        <PersonIcon size={18} />
                      )}
                    </button>
                  )
                })() : (
                  <button
                    className="btn btn-primary"
                    style={{ padding: '8px 20px' }}
                    onClick={() => navigate({ name: 'home' })}
                  >
                    {auth.status === 'pendingDeviceCode' ? t('nav.linking') : t('nav.signIn')}
                  </button>
                )}
              </div>
            </div>

            {/* Página activa (con transición cross-fade suave).
                F61 · El onboarding intercepta ANTES de decidir LoginPage/rutas:
                mientras init() consulta el flag → spinner; con el wizard activo
                → overlay modal (la shell —sidebar, barra inferior— queda
                visible detrás, difuminada por el propio overlay). */}
            {!onbLoaded ? (
              <div className="onb-boot-loading">
                <LoadingSpinner size={84} label={t('common.loading')} />
              </div>
            ) : onbActive ? (
              <OnboardingWizard />
            ) : auth.status !== 'signedIn' && route.name === 'home' ? (
              <LoginPage />
            ) : (
              <div key={routeKey(route)} className="page-transition">
                {route.name === 'home' && <HomePage />}
                {route.name === 'search' && <SearchPage query={searchText} />}
                {route.name === 'playlist' && <PlaylistPage id={route.id} />}
                {route.name === 'album' && <AlbumPage id={route.id} />}
                {route.name === 'artist' && <ArtistPage id={route.id} />}
                {route.name === 'library' && <LibraryPage />}
                {route.name === 'lyrics' && <LyricsPage />}
                {route.name === 'visualizer' && <VisualizerPage />}
                {route.name === 'settings' && <SettingsPage />}
                {route.name === 'profile' && <ProfilePage />}
                {route.name === 'recap' && <RecapPage />}
              </div>
            )}
          </div>
        </main>
        {queueOpen && <QueuePanel onClose={() => setQueueOpen(false)} />}
      </div>
      <NowPlayingBar queueOpen={queueOpen} onToggleQueue={() => setQueueOpen((v) => !v)} />
      <ContextMenuHost />
      <TextModalHost />
      <UpdateBanner />
      <ToastHost />
    </div>
  )
}
