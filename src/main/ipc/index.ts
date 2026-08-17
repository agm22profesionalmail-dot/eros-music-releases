import { BrowserWindow, app, ipcMain } from 'electron'
import { IPC, type PreparedStream, type SearchFilter } from '@shared/types'
import { sessionManager } from '../innertube/session'
import * as music from '../innertube/api'
import { openCookieLogin } from '../auth/cookieLogin'
import { resolveStream } from '../stream/resolver'
import { streamUrlFor } from '../stream/server'
import * as lib from '../innertube/library'
import * as downloads from '../downloads'
import { getLyrics } from '../lyrics'
import {
  getAllSettings,
  updateSettings,
  changeDownloadsDir,
  openDownloadsDir,
  getProfile,
  setProfile,
  getOnboardingCompleted,
  setOnboardingCompleted
} from '../settings'
import { checkForUpdatesManually, startUpdateDownload } from '../updater'
import type {
  AppSettings,
  PlaylistEditPatch,
  TrackSummary,
  UserProfile
} from '@shared/types'

/** Registra todos los handlers IPC. Llamar una sola vez en app.whenReady. */
export function registerIpc(getMainWindow: () => BrowserWindow | null): void {
  // ---- App (F65) ----
  ipcMain.handle(IPC.APP_GET_VERSION, () => app.getVersion())

  // ---- Auto-actualización (F67) ----
  // La instalación (`UPDATE_INSTALL_NOW`) se registra en src/main/index.ts,
  // donde vive el flag `isQuitting` que debe ponerse a true antes de instalar.
  ipcMain.handle(IPC.UPDATE_CHECK, () => checkForUpdatesManually())
  ipcMain.handle(IPC.UPDATE_START_DOWNLOAD, () => startUpdateDownload())

  // ---- Autenticación ----
  ipcMain.handle(IPC.AUTH_GET_STATE, () => sessionManager.authState)
  ipcMain.handle(IPC.AUTH_START_DEVICE, () => {
    void sessionManager.startDeviceFlow()
  })
  ipcMain.handle(IPC.AUTH_OPEN_COOKIE_LOGIN, () => {
    void openCookieLogin(getMainWindow() ?? undefined)
  })
  ipcMain.handle(IPC.AUTH_SIGN_OUT, () => sessionManager.signOut())

  sessionManager.on('auth-state', (state) => {
    getMainWindow()?.webContents.send(IPC.AUTH_STATE_CHANGED, state)
  })

  // ---- Música ----
  // F43 · Último cortafuegos: si algo en `music.search` (o en las capas de
  // debajo) escapa a los try/catch internos y lanza — típicamente un
  // "Cannot read properties of undefined (reading 'url')" del parser de
  // youtubei.js — no queremos que el renderer vea una banda roja. Devolvemos
  // resultados vacíos y logueamos.
  ipcMain.handle(
    IPC.MUSIC_SEARCH,
    async (_e, query: string, filter: SearchFilter = 'all') => {
      try {
        return await music.search(query, filter)
      } catch (err) {
        console.error('[ipc music:search] blindaje final atrapó:', err)
        return { songs: [], videos: [], albums: [], artists: [], playlists: [] }
      }
    }
  )
  ipcMain.handle(IPC.MUSIC_SUGGESTIONS, (_e, input: string) => music.getSuggestions(input))
  // F80 · getHome + estanterías fallback: si InnerTube no devuelve alguna
  // categoría de las que los quick picks esperan, generamos un shelf sintético
  // con contenido de discovery para que la estantería siempre esté activa.
  ipcMain.handle(IPC.MUSIC_HOME, async () => {
    const shelves = await music.getHome()
    try {
      const { categorizeShelf } = await import('../home/categorize')
      const present = new Set(
        shelves.map((s) => categorizeShelf(s)).filter((c): c is string => c !== null)
      )

      // Solo generamos fallback si tenemos semillas (usuario logueado con historial)
      const profile = getProfile()
      const favs = profile.favoriteArtists ?? []
      let likedTracks: TrackSummary[] = []
      if (favs.length > 0 || present.size > 0) {
        try {
          const liked = await music.getPlaylist('LM')
          likedTracks = liked.tracks ?? []
        } catch {
          likedTracks = []
        }
      }
      const hasSeeds = favs.length > 0 || likedTracks.length > 0

      if (hasSeeds) {
        const { getPersonalMixTracks, getSurpriseTrack } = await import('../innertube/discovery')
        const { getUpNext } = await import('../innertube/api')

        // Categorías que necesitan fallback y sus títulos
        const fallbacks: { id: string; title: string }[] = [
          { id: 'recientes', title: 'Escuchados recientemente' },
          { id: 'novedades', title: 'Novedades para ti' },
          { id: 'mixes', title: 'Tus mixes' },
          { id: 'radios', title: 'Radios sugeridas' },
          { id: 'topcharts', title: 'Más escuchado' },
          { id: 'sugerencias', title: 'Sugerencias para ti' }
        ]

        for (const fb of fallbacks) {
          if (present.has(fb.id)) continue
          try {
            let items: TrackSummary[] = []
            if (fb.id === 'mixes' || fb.id === 'sugerencias') {
              items = await getPersonalMixTracks(favs, likedTracks, 8)
            } else {
              // Para el resto, usamos getUpNext con semillas aleatorias
              const seeds = [...likedTracks].sort(() => Math.random() - 0.5).slice(0, 2)
              for (const seed of seeds) {
                if (items.length >= 8) break
                try {
                  const res = await getUpNext(seed.videoId)
                  if (res?.tracks?.length) {
                    for (const t of res.tracks) {
                      if (!items.find((x) => x.videoId === t.videoId)) items.push(t)
                      if (items.length >= 8) break
                    }
                  }
                } catch { /* silencioso */ }
              }
            }
            if (items.length > 0) {
              shelves.push({
                title: fb.title,
                items: items.map((t) => ({
                  kind: t.kind === 'video' ? 'video' as const : 'song' as const,
                  id: t.videoId,
                  title: t.title,
                  subtitle: t.artists?.map((a) => a.name).join(', ') ?? '',
                  thumbnailUrl: t.thumbnailUrl
                }))
              })
            }
          } catch { /* individual fallback failure — skip silently */ }
        }
      }
    } catch {
      // Si el sistema de fallback falla entero, devolvemos los shelves originales
    }
    return shelves
  })
  // F32 · Devuelve el índice ligero de estanterías (id + título + categoría)
  // que la UI de Ajustes necesita para mostrar el editor de orden/ocultas.
  ipcMain.handle(IPC.HOME_SHELF_INDEX, async () => {
    const { shelfId, categorizeShelf } = await import('../home/categorize')
    const shelves = await music.getHome()
    return shelves.map((s) => ({
      id: shelfId(s.title),
      title: s.title,
      category: categorizeShelf(s)
    }))
  })
  ipcMain.handle(IPC.MUSIC_LIBRARY, () => lib.getLibraryCached())
  ipcMain.handle(IPC.MUSIC_PLAYLIST, (_e, id: string) => music.getPlaylist(id))
  ipcMain.handle(IPC.MUSIC_ALBUM, (_e, id: string) => music.getAlbum(id))
  ipcMain.handle(IPC.MUSIC_ARTIST, (_e, id: string) => music.getArtist(id))
  ipcMain.handle(IPC.MUSIC_UP_NEXT, async (_e, videoId: string) => {
    // F50 · Gancho E2E: con perfil de pruebas activo, los videoIds `e2e-*`
    // devuelven la lista canned que el runner dejó en el userData — permite
    // probar la ampliación de cola por autoplay sin red (googlevideo
    // rechaza streams concurrentes del mismo visitante que la app real).
    if (process.env.EROS_E2E_PROFILE && videoId.startsWith('e2e-')) {
      try {
        const { readFile } = await import('fs/promises')
        const { join } = await import('path')
        const raw = await readFile(join(app.getPath('userData'), 'e2e-upnext.json'), 'utf8')
        return JSON.parse(raw)
      } catch {
        return { tracks: [] }
      }
    }
    return music.getUpNext(videoId)
  })
  ipcMain.handle(
    IPC.MUSIC_LYRICS,
    async (
      _e,
      params: { videoId: string; title: string; artists: string[]; album?: string; durationSec?: number }
    ) => {
      // F30 · Todo el fallback (LRCLIB/KuGou/YTMUSIC) vive dentro del
      // orquestador; aquí solo delegamos. El orden y qué proveedores están
      // activos lo decide el usuario en Ajustes → Letras.
      return await getLyrics(params)
    }
  )

  // ---- Biblioteca (escrituras) e historial ----
  ipcMain.handle(IPC.LIB_REFRESH, () => lib.refreshLibrary())
  ipcMain.handle(IPC.LIB_RATE, (_e, videoId: string, action: lib.LikeAction) =>
    lib.setTrackRating(videoId, action)
  )
  ipcMain.handle(IPC.LIB_PLAYLIST_ADD, (_e, playlistId: string, videoIds: string[]) =>
    lib.addToPlaylist(playlistId, videoIds)
  )
  ipcMain.handle(IPC.LIB_PLAYLIST_REMOVE, (_e, playlistId: string, videoIds: string[]) =>
    lib.removeFromPlaylist(playlistId, videoIds)
  )
  ipcMain.handle(IPC.LIB_PLAYLIST_CREATE, (_e, title: string, videoIds: string[]) =>
    lib.createPlaylist(title, videoIds)
  )
  ipcMain.handle(IPC.LIB_PLAYLIST_EDIT, (_e, id: string, patch: PlaylistEditPatch) =>
    lib.editPlaylist(id, patch)
  )
  // F36 · borrar playlist (o quitarla de la biblioteca si es ajena)
  ipcMain.handle(IPC.LIB_PLAYLIST_DELETE, (_e, id: string) => lib.deletePlaylist(id))
  ipcMain.handle(IPC.LIB_SUBSCRIBE, (_e, channelId: string, subscribed: boolean) =>
    lib.setSubscribed(channelId, subscribed)
  )
  ipcMain.handle(IPC.LIB_LIKED_IDS, () => lib.getLikedIds())
  ipcMain.handle(IPC.HISTORY_ADD, (_e, track: TrackSummary) => lib.addHistoryEntry(track))
  ipcMain.handle(IPC.HISTORY_LIST, (_e, limit?: number) => lib.getHistory(limit))

  // ---- Descargas ----
  downloads.setDownloadNotifier(getMainWindow)
  ipcMain.handle(IPC.DL_ADD, (_e, track: TrackSummary) => downloads.enqueueDownload(track))
  ipcMain.handle(IPC.DL_REMOVE, (_e, videoId: string) => downloads.deleteDownload(videoId))
  ipcMain.handle(IPC.DL_LIST, () => downloads.listDownloads())
  ipcMain.handle(IPC.DL_CHANGE_DIR, () => changeDownloadsDir(getMainWindow()))
  ipcMain.handle(IPC.DL_OPEN_DIR, () => openDownloadsDir())

  // ---- Ajustes ----
  ipcMain.handle(IPC.SETTINGS_GET, () => getAllSettings())
  ipcMain.handle(IPC.SETTINGS_SET, async (_e, patch: Partial<AppSettings>) => {
    const merged = updateSettings(patch)
    if ('discordRpc' in patch) {
      const { setDiscordEnabled } = await import('../integrations/discord')
      setDiscordEnabled(Boolean(patch.discordRpc))
    }
    // F28 · idioma/país de contenido: al cambiar hay que reconstruir la
    // sesión de Innertube para que `lang` y `location` se re-emitan a la API.
    if ('contentLanguage' in patch || 'contentCountry' in patch) {
      const { sessionManager } = await import('../innertube/session')
      await sessionManager.invalidateForLocaleChange().catch(() => undefined)
    }
    // F29 · si cambia la cadena de streaming o el toggle de yt-dlp, invalidamos
    // la sesión (fuerza a recrear el player) y limpiamos la caché de URLs
    // resueltas: la próxima reproducción probará el orden nuevo.
    if ('streamingSources' in patch || 'useYtDlpFallback' in patch) {
      const { sessionManager } = await import('../innertube/session')
      await sessionManager.invalidateStreamingSession().catch(() => undefined)
      const { clearStreamCache } = await import('../stream/resolver')
      clearStreamCache()
    }
    // F33 · Al cambiar el modo o la URL del proxy, reaplícalo a la sesión
    // por defecto (afecta a `net.fetch` desde el main y a las peticiones
    // del renderer) y limpia la caché de streams — las URLs de googlevideo
    // están ligadas a la IP saliente, así que hay que re-resolver.
    if ('proxyMode' in patch || 'proxyUrl' in patch) {
      const { applyProxyFromSettings } = await import('../net/proxy')
      await applyProxyFromSettings()
      const { clearStreamCache } = await import('../stream/resolver')
      clearStreamCache()
    }
    // Notifica a todas las ventanas (la principal Y el mini) para que
    // tema/acento se mantengan sincronizados en vivo.
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send(IPC.SETTINGS_CHANGED, merged)
    }
    return merged
  })

  // ---- Onboarding (F61) ----
  ipcMain.handle(IPC.ONBOARDING_GET_COMPLETED, () => getOnboardingCompleted())
  ipcMain.handle(IPC.ONBOARDING_SET_COMPLETED, (_e, v: boolean) =>
    setOnboardingCompleted(Boolean(v))
  )

  // ---- Perfil de usuario (F20) ----
  ipcMain.handle(IPC.PROFILE_GET, () => getProfile())
  ipcMain.handle(IPC.PROFILE_SET, async (_e, patch: Partial<UserProfile>) => {
    const merged = setProfile(patch)
    // Notifica a todas las ventanas para que el avatar/nombre se actualicen en vivo
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send(IPC.PROFILE_CHANGED, merged)
    }
    // F25 · refresca la presencia de Discord con la última info conocida
    // (foto/nombre nuevos aparecen sin esperar a la siguiente canción).
    const { refreshDiscordPresence } = await import('../integrations/discord')
    await refreshDiscordPresence()
    return merged
  })

  // ---- Géneros (F23) ----
  // La UI manda las pistas visibles y recibe un mapa videoId→géneros más la
  // lista de géneros presentes. La resolución usa caché en SQLite y consulta
  // Last.fm solo cuando falta información.
  ipcMain.handle(IPC.GENRE_RESOLVE, async (_e, tracks: TrackSummary[]) => {
    const { resolveGenresForTracks } = await import('../genres')
    return resolveGenresForTracks(Array.isArray(tracks) ? tracks : [])
  })

  // ---- Descubrimiento (F24): Sorpréndeme + Mix Personal ----
  // Ambas rutas leen los favoritos del perfil y los likes de la cuenta; si no
  // hay ninguno, el renderer muestra un mensaje invitando al usuario a añadir
  // artistas favoritos en el Perfil.
  ipcMain.handle(IPC.DISCOVERY_SURPRISE, async () => {
    const { getSurpriseTrack } = await import('../innertube/discovery')
    const profile = getProfile()
    const favs = profile.favoriteArtists ?? []
    const liked = await lib.getLikedIds().catch(() => [])
    if (!favs.length && !liked.length) return null
    return getSurpriseTrack(favs, liked)
  })

  // ---- Estadísticas (F31): Recap, Top semanal/mensual, playlist auto ----
  ipcMain.handle(
    IPC.STATS_TOP_TRACKS,
    async (_e, period: { start: number; end: number }, topN?: number) => {
      const { computeTopTracks } = await import('../stats')
      return computeTopTracks(period, topN)
    }
  )
  ipcMain.handle(
    IPC.STATS_TOP_ARTISTS,
    async (_e, period: { start: number; end: number }, topN?: number) => {
      const { computeTopArtists } = await import('../stats')
      return computeTopArtists(period, topN)
    }
  )
  ipcMain.handle(IPC.STATS_RECAP, async (_e, days?: number) => {
    const { computeRecap } = await import('../stats')
    return computeRecap(typeof days === 'number' && days > 0 ? days : 30)
  })
  ipcMain.handle(
    IPC.STATS_CREATE_TOP_PLAYLIST,
    async (_e, range: 'week' | 'month', topN?: number) => {
      // Genera un top del período pedido y crea una playlist en la cuenta.
      const { computeTopTracks, periodOfWeek, periodOfMonth } = await import('../stats')
      const period = range === 'week' ? periodOfWeek() : periodOfMonth()
      const top = computeTopTracks(period, topN)
      if (!top.length) return null
      const ids = top.map((t) => t.videoId).filter(Boolean)
      if (!ids.length) return null
      const now = new Date()
      const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const label = range === 'week' ? 'semanal' : 'mensual'
      const title = `Mi Top ${label} · ${stamp}`
      return lib.createPlaylist(title, ids)
    }
  )

  ipcMain.handle(IPC.DISCOVERY_MIX, async () => {
    const { getPersonalMixTracks } = await import('../innertube/discovery')
    const profile = getProfile()
    const favs = profile.favoriteArtists ?? []
    // Traemos las pistas completas (no solo ids) para poder meter las favoritas
    // "tal cual" en el mix — así aparecen aunque el usuario esté offline hasta
    // la mitad del mix.
    let likedTracks: TrackSummary[] = []
    try {
      const liked = await music.getPlaylist('LM')
      likedTracks = liked.tracks
    } catch {
      likedTracks = []
    }
    if (!favs.length && !likedTracks.length) return []
    return getPersonalMixTracks(favs, likedTracks, 25)
  })

  ipcMain.handle(IPC.DISCOVERY_SPIRAL, async () => {
    const { getSpiralTracks } = await import('../innertube/discovery')
    const { getLibraryCached, getHistory } = await import('../innertube/library')
    const profile = getProfile()
    const favs = profile.favoriteArtists ?? []

    // Liked songs
    let likedTracks: TrackSummary[] = []
    try {
      const liked = await music.getPlaylist('LM')
      likedTracks = liked.tracks
    } catch {
      likedTracks = []
    }

    // Pistas de las playlists del usuario (best effort, con timeout por playlist)
    const userPlaylistTracks: TrackSummary[] = []
    try {
      const lib = await getLibraryCached()
      const playlistIds = lib.playlists.map((p) => p.id).slice(0, 10) // max 10 playlists
      const results = await Promise.allSettled(
        playlistIds.map((id) =>
          Promise.race([
            music.getPlaylist(id).then((pl) => pl.tracks),
            new Promise<TrackSummary[]>((_, reject) => setTimeout(() => reject('timeout'), 3000))
          ])
        )
      )
      for (const r of results) {
        if (r.status === 'fulfilled') userPlaylistTracks.push(...r.value)
      }
    } catch {
      /* best effort */
    }

    // Historial
    const historyTracks = getHistory(200)

    // Canciones ya visibles en Home — no duplicar en la Espiral
    let homeVideoIds: string[] = []
    try {
      const { getHome } = await import('../innertube/api')
      const homeShelves = await getHome()
      homeVideoIds = homeShelves
        .flatMap((s) => s.items)
        .filter((item) => item.kind === 'song' || item.kind === 'video')
        .map((item) => item.id)
        .filter(Boolean)
    } catch {
      /* best effort */
    }

    if (!favs.length && !likedTracks.length) return []
    return getSpiralTracks(favs, likedTracks, userPlaylistTracks, historyTracks, homeVideoIds, 60)
  })

  // ---- Streaming ----
  ipcMain.handle(IPC.STREAM_PREPARE, async (_e, videoId: string): Promise<PreparedStream> => {
    // Descargada -> directo del disco, sin tocar la red (modo offline real)
    const { getDownloadPath } = await import('../db')
    const local = getDownloadPath(videoId)
    if (local) {
      return {
        url: streamUrlFor(videoId),
        mimeType: local.endsWith('.opus') ? 'audio/ogg' : 'audio/mp4',
        via: 'local'
      }
    }
    const resolved = await resolveStream(videoId)
    return {
      url: streamUrlFor(videoId),
      mimeType: resolved.mimeType,
      durationSec: resolved.durationSec,
      bitrate: resolved.bitrate,
      via: resolved.via
    }
  })

  // ---- F68 · Last.fm scrobbling ----
  ipcMain.handle(IPC.LASTFM_AUTH_URL, async () => {
    const { getLastfmAuthUrl } = await import('../integrations/lastfm')
    return getLastfmAuthUrl()
  })
  ipcMain.handle(IPC.LASTFM_AUTH_COMPLETE, async (_e, token: string) => {
    const { completeLastfmAuth } = await import('../integrations/lastfm')
    return completeLastfmAuth(token)
  })
  ipcMain.handle(IPC.LASTFM_DISCONNECT, async () => {
    const { disconnectLastfm } = await import('../integrations/lastfm')
    disconnectLastfm()
  })
  ipcMain.handle(IPC.LASTFM_NOW_PLAYING, async (_e, params) => {
    const s = getAllSettings()
    if (!s.lastfmEnabled || !s.lastfmSessionKey) return
    const { lastfmNowPlaying } = await import('../integrations/lastfm')
    return lastfmNowPlaying(params)
  })
  ipcMain.handle(IPC.LASTFM_SCROBBLE, async (_e, params) => {
    const s = getAllSettings()
    if (!s.lastfmEnabled || !s.lastfmSessionKey) return
    const { lastfmScrobble } = await import('../integrations/lastfm')
    return lastfmScrobble(params)
  })

  // ---- F69 · ListenBrainz sync ----
  ipcMain.handle(IPC.LISTENBRAINZ_VALIDATE, async (_e, token: string) => {
    const { listenbrainzValidateToken } = await import('../integrations/listenbrainz')
    return listenbrainzValidateToken(token)
  })
  ipcMain.handle(IPC.LISTENBRAINZ_NOW_PLAYING, async (_e, params) => {
    const s = getAllSettings()
    if (!s.listenbrainzEnabled || !s.listenbrainzToken) return
    const { listenbrainzNowPlaying } = await import('../integrations/listenbrainz')
    return listenbrainzNowPlaying(s.listenbrainzToken, params)
  })
  ipcMain.handle(IPC.LISTENBRAINZ_SUBMIT, async (_e, params) => {
    const s = getAllSettings()
    if (!s.listenbrainzEnabled || !s.listenbrainzToken) return
    const { listenbrainzSubmitListen } = await import('../integrations/listenbrainz')
    return listenbrainzSubmitListen(s.listenbrainzToken, params)
  })

  // ---- F71 · Importación de playlists ----
  ipcMain.handle(IPC.IMPORT_FILE_DIALOG, async () => {
    const { dialog } = await import('electron')
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Playlists', extensions: ['m3u', 'm3u8', 'csv'] }]
    })
    return result.filePaths[0] || null
  })
  ipcMain.handle(IPC.IMPORT_SPOTIFY, async (_e, url: string) => {
    const { parseSpotifyPlaylist, matchTracksToYtMusic } = await import('../import/spotify')
    const { name, tracks } = await parseSpotifyPlaylist(url)
    const searchFn = async (query: string) => {
      const res = await music.search(query, 'song')
      return res.songs ?? []
    }
    const matches = await matchTracksToYtMusic(tracks, searchFn, (current, total, m) => {
      getMainWindow()?.webContents.send(IPC.IMPORT_PROGRESS, {
        state: 'matching', current, total, matches: m
      })
    })
    return { name, matches }
  })
  ipcMain.handle(IPC.IMPORT_FILE, async (_e, filePath: string) => {
    const { parsePlaylistFile } = await import('../import/fileImport')
    const { matchTracksToYtMusic } = await import('../import/spotify')
    const { name, tracks: fileTracks } = await parsePlaylistFile(filePath)
    const searchFn = async (query: string) => {
      const res = await music.search(query, 'song')
      return res.songs ?? []
    }
    // Convertir FileTrack[] a SpotifyTrack[] (misma forma)
    const asTracks = fileTracks.map((t) => ({ title: t.title, artist: t.artist, album: t.album }))
    const matches = await matchTracksToYtMusic(asTracks, searchFn, (current, total, m) => {
      getMainWindow()?.webContents.send(IPC.IMPORT_PROGRESS, {
        state: 'matching', current, total, matches: m
      })
    })
    return { name, matches }
  })

  // Hidrata la session key de Last.fm al arrancar
  {
    const s = getAllSettings()
    if (s.lastfmSessionKey) {
      void import('../integrations/lastfm').then(({ setLastfmSessionKey }) => {
        setLastfmSessionKey(s.lastfmSessionKey)
      })
    }
  }

  // ---- Ventana ----
  ipcMain.handle(IPC.WIN_MINIMIZE, () => getMainWindow()?.minimize())
  ipcMain.handle(IPC.WIN_MAXIMIZE, () => {
    const win = getMainWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.handle(IPC.WIN_CLOSE, () => getMainWindow()?.close())
  ipcMain.handle(IPC.WIN_IS_MAXIMIZED, () => getMainWindow()?.isMaximized() ?? false)
}
