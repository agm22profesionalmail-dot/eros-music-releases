// Tipos de dominio compartidos entre main y renderer.
// Todo debe ser serializable por structured clone (IPC).

export interface ArtistRef {
  name: string
  id?: string
}

export interface TrackSummary {
  kind: 'song' | 'video'
  videoId: string
  title: string
  artists: ArtistRef[]
  album?: { name: string; id?: string }
  durationSec?: number
  durationText?: string
  thumbnailUrl?: string
  isExplicit?: boolean
}

export interface MediaCard {
  kind: 'song' | 'video' | 'album' | 'playlist' | 'artist' | 'unknown'
  /** videoId para canciones/vídeos, browseId para álbumes/artistas/playlists */
  id: string
  title: string
  subtitle?: string
  thumbnailUrl?: string
}

export interface Shelf {
  title: string
  items: MediaCard[]
}

export interface PlaylistDetail {
  id: string
  title: string
  author?: string
  description?: string
  thumbnailUrl?: string
  trackCount?: number
  durationText?: string
  tracks: TrackSummary[]
  /** Cursor opaco para paginación (si hay más pistas) */
  hasContinuation?: boolean
  isEditable?: boolean
}

export interface AlbumDetail {
  id: string
  title: string
  artists: ArtistRef[]
  year?: string
  thumbnailUrl?: string
  trackCount?: number
  durationText?: string
  tracks: TrackSummary[]
  playlistId?: string
}

export interface ArtistDetail {
  id: string
  name: string
  description?: string
  thumbnailUrl?: string
  subscribers?: string
  isSubscribed?: boolean
  shelves: Shelf[]
  /** videoId de arranque para "reproducir radio" */
  radioPlaylistId?: string
  shufflePlaylistId?: string
}

export interface SearchResults {
  topResult?: MediaCard
  songs: TrackSummary[]
  videos: TrackSummary[]
  albums: MediaCard[]
  artists: MediaCard[]
  playlists: MediaCard[]
}

export type SearchFilter = 'all' | 'song' | 'video' | 'album' | 'artist' | 'playlist'

export interface TrackDetail extends TrackSummary {
  lyricsBrowseId?: string
  likeStatus?: 'LIKE' | 'DISLIKE' | 'INDIFFERENT'
}

export interface QueueItem extends TrackSummary {
  /** id único dentro de la cola (una misma canción puede repetirse) */
  queueId: string
}

// ---------- Autenticación ----------

export type AuthMethod = 'oauth' | 'cookie'

export interface AuthState {
  status: 'signedOut' | 'pendingDeviceCode' | 'signingIn' | 'signedIn' | 'error'
  method?: AuthMethod
  /** Código para mostrar al usuario durante el device flow */
  userCode?: string
  verificationUrl?: string
  accountName?: string
  accountPhotoUrl?: string
  error?: string
}

// ---------- Canales IPC ----------

export const IPC = {
  // auth
  AUTH_GET_STATE: 'auth:getState',
  AUTH_START_DEVICE: 'auth:startDeviceCode',
  AUTH_CANCEL_DEVICE: 'auth:cancelDeviceCode',
  AUTH_OPEN_COOKIE_LOGIN: 'auth:openCookieLogin',
  AUTH_SIGN_OUT: 'auth:signOut',
  AUTH_STATE_CHANGED: 'auth:stateChanged', // main -> renderer (evento)
  // música
  MUSIC_SEARCH: 'music:search',
  MUSIC_SUGGESTIONS: 'music:suggestions',
  MUSIC_HOME: 'music:home',
  MUSIC_LIBRARY: 'music:library',
  MUSIC_PLAYLIST: 'music:playlist',
  MUSIC_ALBUM: 'music:album',
  MUSIC_ARTIST: 'music:artist',
  MUSIC_TRACK: 'music:track',
  MUSIC_UP_NEXT: 'music:upNext',
  MUSIC_LYRICS: 'music:lyrics',
  // biblioteca (escrituras) e historial
  LIB_REFRESH: 'library:refresh',
  LIB_RATE: 'library:rate',
  LIB_PLAYLIST_ADD: 'library:playlistAdd',
  LIB_PLAYLIST_REMOVE: 'library:playlistRemove',
  LIB_PLAYLIST_CREATE: 'library:playlistCreate',
  LIB_SUBSCRIBE: 'library:subscribe',
  HISTORY_ADD: 'history:add',
  HISTORY_LIST: 'history:list',
  // descargas
  DL_ADD: 'downloads:add',
  DL_REMOVE: 'downloads:remove',
  DL_LIST: 'downloads:list',
  DL_PROGRESS: 'downloads:progress', // main -> renderer (evento)
  DL_CHANGE_DIR: 'downloads:changeDir',
  DL_OPEN_DIR: 'downloads:openDir',
  // ajustes
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  // control remoto (teclas multimedia globales) main -> renderer
  MEDIA_COMMAND: 'media:command',
  // streaming
  STREAM_PREPARE: 'stream:prepare',
  // ventana
  WIN_MINIMIZE: 'win:minimize',
  WIN_MAXIMIZE: 'win:maximize',
  WIN_CLOSE: 'win:close',
  WIN_IS_MAXIMIZED: 'win:isMaximized',
  WIN_MAXIMIZED_CHANGED: 'win:maximizedChanged'
} as const

export interface PreparedStream {
  /** URL local (proxy 127.0.0.1) lista para asignar a <audio>.src */
  url: string
  mimeType: string
  durationSec?: number
  bitrate?: number
  /** Cliente que resolvió el stream (diagnóstico) */
  via: string
}

export interface LibrarySnapshot {
  playlists: MediaCard[]
  albums: MediaCard[]
  artists: MediaCard[]
  songs: TrackSummary[]
}

export interface AppSettings {
  /** Carpeta de descargas */
  downloadsDir: string
  /** Tema visual */
  theme: 'dark' | 'black' | 'light'
  /** Color de acento (hex) */
  accent: string
  /** Segundos de crossfade entre pistas (0 = desactivado) */
  crossfadeSec: number
  /** Continuar con radio al agotar la cola */
  autoplay: boolean
  /** Ganancias del ecualizador en dB (10 bandas) */
  eqGains: number[]
  /** Preamplificador en dB */
  preampDb: number
  /** Velocidad de reproducción */
  playbackRate: number
  /** Mantener tono al cambiar velocidad */
  preservePitch: boolean
  /** Cerrar a la bandeja en vez de salir */
  closeToTray: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  downloadsDir: '',
  theme: 'dark',
  accent: '#f43f4f',
  crossfadeSec: 0,
  autoplay: true,
  eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  preampDb: 0,
  playbackRate: 1,
  preservePitch: true,
  closeToTray: false
}

export interface LyricsData {
  source: string
  /** Texto plano (no sincronizado) */
  plain?: string
  /** Líneas sincronizadas si existen */
  synced?: { timeMs: number; text: string }[]
}
