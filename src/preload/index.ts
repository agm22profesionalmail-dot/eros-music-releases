import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC } from '../shared/types'
import type {
  AlbumDetail,
  AppSettings,
  ArtistDetail,
  ArtistStats,
  AuthState,
  DiscoverySurpriseResult,
  GenreResolveResult,
  LibrarySnapshot,
  LyricsData,
  PlaylistDetail,
  PlaylistEditPatch,
  PlaylistOverride,
  PreparedStream,
  RecapData,
  SearchFilter,
  SearchResults,
  Shelf,
  SpiralTrack,
  StatsPeriod,
  TrackStats,
  TrackSummary,
  UserProfile
} from '../shared/types'

const api = {
  ping: (): Promise<string> => ipcRenderer.invoke('app:ping'),

  // F65 · Metadatos de la aplicación (versión visible en Ajustes → Sistema)
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.APP_GET_VERSION)
  },

  // F67 · Auto-actualización: acciones renderer→main + eventos main→renderer
  // (mismo patrón on/cleanup que settings.onChanged / profile.onChanged).
  updater: {
    /** Comprobación manual (botón de Ajustes). */
    check: (): Promise<void> => ipcRenderer.invoke(IPC.UPDATE_CHECK),
    /** Descarga la actualización anunciada (tras "Actualizar ahora"). */
    startDownload: (): Promise<void> => ipcRenderer.invoke(IPC.UPDATE_START_DOWNLOAD),
    /** Instala lo descargado y reinicia la app. */
    installNow: (): Promise<void> => ipcRenderer.invoke(IPC.UPDATE_INSTALL_NOW),
    onAvailable: (cb: (payload: { version: string }) => void): (() => void) => {
      const listener = (_e: unknown, payload: { version: string }): void => cb(payload)
      ipcRenderer.on(IPC.UPDATE_AVAILABLE, listener)
      return () => ipcRenderer.removeListener(IPC.UPDATE_AVAILABLE, listener)
    },
    /** Solo se emite tras una comprobación MANUAL sin novedades. */
    onNotAvailable: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on(IPC.UPDATE_NOT_AVAILABLE, listener)
      return () => ipcRenderer.removeListener(IPC.UPDATE_NOT_AVAILABLE, listener)
    },
    onDownloadProgress: (cb: (payload: { percent: number }) => void): (() => void) => {
      const listener = (_e: unknown, payload: { percent: number }): void => cb(payload)
      ipcRenderer.on(IPC.UPDATE_DOWNLOAD_PROGRESS, listener)
      return () => ipcRenderer.removeListener(IPC.UPDATE_DOWNLOAD_PROGRESS, listener)
    },
    onDownloaded: (cb: (payload: { version: string }) => void): (() => void) => {
      const listener = (_e: unknown, payload: { version: string }): void => cb(payload)
      ipcRenderer.on(IPC.UPDATE_DOWNLOADED, listener)
      return () => ipcRenderer.removeListener(IPC.UPDATE_DOWNLOADED, listener)
    },
    onError: (cb: (payload: { message: string }) => void): (() => void) => {
      const listener = (_e: unknown, payload: { message: string }): void => cb(payload)
      ipcRenderer.on(IPC.UPDATE_ERROR, listener)
      return () => ipcRenderer.removeListener(IPC.UPDATE_ERROR, listener)
    }
  },

  auth: {
    getState: (): Promise<AuthState> => ipcRenderer.invoke(IPC.AUTH_GET_STATE),
    startDeviceCode: (): Promise<void> => ipcRenderer.invoke(IPC.AUTH_START_DEVICE),
    openCookieLogin: (): Promise<void> => ipcRenderer.invoke(IPC.AUTH_OPEN_COOKIE_LOGIN),
    signOut: (): Promise<void> => ipcRenderer.invoke(IPC.AUTH_SIGN_OUT),
    onStateChanged: (cb: (state: AuthState) => void): (() => void) => {
      const listener = (_e: unknown, state: AuthState): void => cb(state)
      ipcRenderer.on(IPC.AUTH_STATE_CHANGED, listener)
      return () => ipcRenderer.removeListener(IPC.AUTH_STATE_CHANGED, listener)
    }
  },

  music: {
    search: (query: string, filter?: SearchFilter): Promise<SearchResults> =>
      ipcRenderer.invoke(IPC.MUSIC_SEARCH, query, filter),
    suggestions: (input: string): Promise<string[]> =>
      ipcRenderer.invoke(IPC.MUSIC_SUGGESTIONS, input),
    home: (): Promise<Shelf[]> => ipcRenderer.invoke(IPC.MUSIC_HOME),
    /** F32 · Índice ligero de estanterías detectadas para el editor de Ajustes. */
    homeShelfIndex: (): Promise<{ id: string; title: string; category: string | null }[]> =>
      ipcRenderer.invoke(IPC.HOME_SHELF_INDEX),
    library: (): Promise<LibrarySnapshot & { fromCache: boolean; updatedAt: number }> =>
      ipcRenderer.invoke(IPC.MUSIC_LIBRARY),
    playlist: (id: string): Promise<PlaylistDetail> => ipcRenderer.invoke(IPC.MUSIC_PLAYLIST, id),
    album: (id: string): Promise<AlbumDetail> => ipcRenderer.invoke(IPC.MUSIC_ALBUM, id),
    artist: (id: string): Promise<ArtistDetail> => ipcRenderer.invoke(IPC.MUSIC_ARTIST, id),
    upNext: (videoId: string): Promise<{ tracks: unknown[]; playlistId?: string }> =>
      ipcRenderer.invoke(IPC.MUSIC_UP_NEXT, videoId),
    lyrics: (params: {
      videoId: string
      title: string
      artists: string[]
      album?: string
      durationSec?: number
    }): Promise<LyricsData | null> => ipcRenderer.invoke(IPC.MUSIC_LYRICS, params)
  },

  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.SETTINGS_GET),
    set: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC.SETTINGS_SET, patch),
    onChanged: (cb: (settings: AppSettings) => void): (() => void) => {
      const listener = (_e: unknown, s: AppSettings): void => cb(s)
      ipcRenderer.on(IPC.SETTINGS_CHANGED, listener)
      return () => ipcRenderer.removeListener(IPC.SETTINGS_CHANGED, listener)
    },
    changeDownloadsDir: (): Promise<{ dir: string; moved: number } | null> =>
      ipcRenderer.invoke(IPC.DL_CHANGE_DIR),
    openDownloadsDir: (): Promise<void> => ipcRenderer.invoke(IPC.DL_OPEN_DIR)
  },

  // F61 · Flag persistido del asistente de bienvenida
  onboarding: {
    getCompleted: (): Promise<boolean> => ipcRenderer.invoke(IPC.ONBOARDING_GET_COMPLETED),
    setCompleted: (v: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.ONBOARDING_SET_COMPLETED, v)
  },

  profile: {
    get: (): Promise<UserProfile> => ipcRenderer.invoke(IPC.PROFILE_GET),
    set: (patch: Partial<UserProfile>): Promise<UserProfile> =>
      ipcRenderer.invoke(IPC.PROFILE_SET, patch),
    onChanged: (cb: (profile: UserProfile) => void): (() => void) => {
      const listener = (_e: unknown, p: UserProfile): void => cb(p)
      ipcRenderer.on(IPC.PROFILE_CHANGED, listener)
      return () => ipcRenderer.removeListener(IPC.PROFILE_CHANGED, listener)
    }
  },

  genre: {
    /**
     * Resuelve géneros para una lista de pistas (F23). El main consulta la
     * caché SQLite y, si faltan artistas, dispara Last.fm con concurrencia
     * limitada. Devuelve videoId → géneros y la lista de géneros presentes.
     */
    resolve: (tracks: TrackSummary[]): Promise<GenreResolveResult> =>
      ipcRenderer.invoke(IPC.GENRE_RESOLVE, tracks)
  },

  discovery: {
    /**
     * F24 · "Sorpréndeme" — devuelve UNA canción de un artista relacionado
     * a los favoritos/historial, o `null` si no hay semillas.
     */
    surprise: (): Promise<DiscoverySurpriseResult | null> =>
      ipcRenderer.invoke(IPC.DISCOVERY_SURPRISE),
    /**
     * F24 · "Mix Personal" — devuelve ~25 pistas mezclando favoritas,
     * top de artistas favoritos y recomendaciones. Vacío si no hay semillas.
     */
    mix: (): Promise<TrackSummary[]> => ipcRenderer.invoke(IPC.DISCOVERY_MIX),
    /** F80 · Espiral Musical — ~45 pistas únicas para el scroll infinito. */
    spiral: (): Promise<SpiralTrack[]> => ipcRenderer.invoke(IPC.DISCOVERY_SPIRAL)
  },

  stats: {
    /** F31 · Top de canciones para un rango temporal. */
    topTracks: (period: StatsPeriod, topN?: number): Promise<TrackStats[]> =>
      ipcRenderer.invoke(IPC.STATS_TOP_TRACKS, period, topN),
    /** F31 · Top de artistas para un rango temporal. */
    topArtists: (period: StatsPeriod, topN?: number): Promise<ArtistStats[]> =>
      ipcRenderer.invoke(IPC.STATS_TOP_ARTISTS, period, topN),
    /** F31 · Resumen tipo Wrapped (últimos N días, por defecto 30). */
    recap: (days?: number): Promise<RecapData> => ipcRenderer.invoke(IPC.STATS_RECAP, days),
    /**
     * F31 · Crea una playlist con el top del período pedido en la cuenta.
     * Devuelve el playlist_id o null si el historial está vacío.
     */
    createTopPlaylist: (range: 'week' | 'month', topN?: number): Promise<string | null> =>
      ipcRenderer.invoke(IPC.STATS_CREATE_TOP_PLAYLIST, range, topN)
  },

  media: {
    onCommand: (cb: (cmd: string) => void): (() => void) => {
      const listener = (_e: unknown, cmd: string): void => cb(cmd)
      ipcRenderer.on(IPC.MEDIA_COMMAND, listener)
      return () => ipcRenderer.removeListener(IPC.MEDIA_COMMAND, listener)
    }
  },

  mini: {
    toggle: (): Promise<void> => ipcRenderer.invoke(IPC.MINI_TOGGLE),
    showMain: (): Promise<void> => ipcRenderer.invoke(IPC.MINI_SHOW_MAIN),
    /** Publica el estado de reproducción (ventana principal -> main) */
    publishState: (state: unknown): void => ipcRenderer.send(IPC.MINI_STATE, state),
    /** Recibe el estado (ventana mini) */
    onState: (cb: (state: unknown) => void): (() => void) => {
      const listener = (_e: unknown, state: unknown): void => cb(state)
      ipcRenderer.on(IPC.MINI_STATE, listener)
      return () => ipcRenderer.removeListener(IPC.MINI_STATE, listener)
    },
    /** Envía un comando de control (ventana mini -> ventana principal) */
    command: (cmd: string): Promise<void> => ipcRenderer.invoke(IPC.MINI_COMMAND, cmd),
    /** Ancla el mini a una esquina o lo deja en posición libre */
    setCorner: (corner: 'tl' | 'tr' | 'bl' | 'br' | 'free'): Promise<void> =>
      ipcRenderer.invoke(IPC.MINI_SET_CORNER, corner),
    /** Abre/cierra la ventana de ajustes del mini-player */
    openSettings: (): Promise<void> => ipcRenderer.invoke(IPC.MINI_OPEN_SETTINGS),
    /** Escala de la tarjeta (0.8–1.6): redimensiona ventana y contenido */
    setScale: (scale: number): Promise<void> => ipcRenderer.invoke(IPC.MINI_SET_SCALE, scale)
  },

  // F68 · Last.fm scrobbling
  lastfm: {
    authUrl: (): Promise<string> => ipcRenderer.invoke(IPC.LASTFM_AUTH_URL),
    authComplete: (token: string): Promise<{ username: string; sessionKey: string }> =>
      ipcRenderer.invoke(IPC.LASTFM_AUTH_COMPLETE, token),
    disconnect: (): Promise<void> => ipcRenderer.invoke(IPC.LASTFM_DISCONNECT),
    nowPlaying: (params: { title: string; artist: string; album?: string; duration?: number }): Promise<void> =>
      ipcRenderer.invoke(IPC.LASTFM_NOW_PLAYING, params),
    scrobble: (params: { title: string; artist: string; album?: string; duration?: number; timestamp: number }): Promise<void> =>
      ipcRenderer.invoke(IPC.LASTFM_SCROBBLE, params)
  },

  // F69 · ListenBrainz sync
  listenbrainz: {
    validate: (token: string): Promise<{ valid: boolean; userName?: string }> =>
      ipcRenderer.invoke(IPC.LISTENBRAINZ_VALIDATE, token),
    nowPlaying: (params: { title: string; artist: string; album?: string }): Promise<void> =>
      ipcRenderer.invoke(IPC.LISTENBRAINZ_NOW_PLAYING, params),
    submit: (params: { title: string; artist: string; album?: string; timestamp: number }): Promise<void> =>
      ipcRenderer.invoke(IPC.LISTENBRAINZ_SUBMIT, params)
  },

  // F71 · Importación de playlists
  import: {
    spotify: (url: string): Promise<{ name: string; matches: import('@shared/types').ImportTrackMatch[] }> =>
      ipcRenderer.invoke(IPC.IMPORT_SPOTIFY, url),
    file: (filePath: string): Promise<{ name: string; matches: import('@shared/types').ImportTrackMatch[] }> =>
      ipcRenderer.invoke(IPC.IMPORT_FILE, filePath),
    fileDialog: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.IMPORT_FILE_DIALOG),
    onProgress: (cb: (progress: import('@shared/types').ImportProgress) => void): (() => void) => {
      const listener = (_e: unknown, p: import('@shared/types').ImportProgress): void => cb(p)
      ipcRenderer.on(IPC.IMPORT_PROGRESS, listener)
      return () => ipcRenderer.removeListener(IPC.IMPORT_PROGRESS, listener)
    }
  },

  player: {
    prepare: (videoId: string): Promise<PreparedStream> =>
      ipcRenderer.invoke(IPC.STREAM_PREPARE, videoId)
  },

  library: {
    refresh: (): Promise<LibrarySnapshot & { fromCache: boolean; updatedAt: number }> =>
      ipcRenderer.invoke(IPC.LIB_REFRESH),
    rate: (videoId: string, action: 'like' | 'dislike' | 'clear'): Promise<void> =>
      ipcRenderer.invoke(IPC.LIB_RATE, videoId, action),
    playlistAdd: (playlistId: string, videoIds: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC.LIB_PLAYLIST_ADD, playlistId, videoIds),
    playlistRemove: (playlistId: string, videoIds: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC.LIB_PLAYLIST_REMOVE, playlistId, videoIds),
    playlistCreate: (title: string, videoIds: string[]): Promise<string | null> =>
      ipcRenderer.invoke(IPC.LIB_PLAYLIST_CREATE, title, videoIds),
    playlistEdit: (
      id: string,
      patch: PlaylistEditPatch
    ): Promise<{ remoteTitleOk: boolean; override: PlaylistOverride | null }> =>
      ipcRenderer.invoke(IPC.LIB_PLAYLIST_EDIT, id, patch),
    /** F36 · Borra la playlist (propia) o la quita de la biblioteca (ajena) */
    playlistDelete: (id: string): Promise<'deleted' | 'removedFromLibrary'> =>
      ipcRenderer.invoke(IPC.LIB_PLAYLIST_DELETE, id),
    subscribe: (channelId: string, subscribed: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.LIB_SUBSCRIBE, channelId, subscribed),
    likedIds: (): Promise<string[]> => ipcRenderer.invoke(IPC.LIB_LIKED_IDS),
    /**
     * Suscripción a cambios de la biblioteca (F22c). El main lo emite tras
     * cualquier escritura (crear/editar playlist, like, suscribir). Devuelve
     * un cleanup que quita el listener.
     */
    onChanged: (cb: (payload: { reason: string }) => void): (() => void) => {
      const listener = (_e: unknown, payload: { reason: string }): void => cb(payload)
      ipcRenderer.on(IPC.LIB_CHANGED, listener)
      return () => ipcRenderer.removeListener(IPC.LIB_CHANGED, listener)
    }
  },

  history: {
    add: (track: TrackSummary): Promise<void> => ipcRenderer.invoke(IPC.HISTORY_ADD, track),
    list: (limit?: number): Promise<TrackSummary[]> =>
      ipcRenderer.invoke(IPC.HISTORY_LIST, limit)
  },

  downloads: {
    add: (track: TrackSummary): Promise<void> => ipcRenderer.invoke(IPC.DL_ADD, track),
    remove: (videoId: string): Promise<void> => ipcRenderer.invoke(IPC.DL_REMOVE, videoId),
    list: (): Promise<{ track: TrackSummary; filePath: string }[]> =>
      ipcRenderer.invoke(IPC.DL_LIST),
    onProgress: (
      cb: (p: { videoId: string; state: string; progress?: number; error?: string }) => void
    ): (() => void) => {
      const listener = (
        _e: unknown,
        p: { videoId: string; state: string; progress?: number; error?: string }
      ): void => cb(p)
      ipcRenderer.on(IPC.DL_PROGRESS, listener)
      return () => ipcRenderer.removeListener(IPC.DL_PROGRESS, listener)
    }
  },

  win: {
    minimize: (): Promise<void> => ipcRenderer.invoke(IPC.WIN_MINIMIZE),
    maximize: (): Promise<void> => ipcRenderer.invoke(IPC.WIN_MAXIMIZE),
    close: (): Promise<void> => ipcRenderer.invoke(IPC.WIN_CLOSE),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke(IPC.WIN_IS_MAXIMIZED)
  }
}

export type PreloadApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
