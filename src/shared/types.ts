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
  /** F28 · Línea "oyentes mensuales" cuando la API la expone (rara vez en YT Music). */
  monthlyListeners?: string
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

// ---------- Playlist (F22): parches de edición y overrides locales ----------

/**
 * Parche parcial para editar una playlist: título y/o carátula. La carátula
 * llega como data URL (JPEG/PNG en base64) — YT Music no expone endpoint
 * para cambiarla, así que se guarda solo como override local. `null` en
 * `thumbnailDataUrl` significa "quitar override y volver a la original".
 */
export interface PlaylistEditPatch {
  title?: string
  thumbnailDataUrl?: string | null
}

/** Override local (SQLite) para una playlist — sobreescribe la del backend al mapear. */
export interface PlaylistOverride {
  id: string
  title?: string
  thumbnailDataUrl?: string
  updatedAt: number
}

// ---------- Perfil de usuario (F20) ----------

/** Referencia a un artista favorito en el perfil del usuario. */
export interface ProfileArtistRef {
  id: string
  name: string
  thumbnailUrl?: string
}

/**
 * Perfil personalizado del usuario. Persistido en `settings` bajo `app.profile`.
 * Cuando `enabled` es false la app se comporta como antes (usa nombre y foto de
 * la cuenta de Google). Cuando `enabled` es true, `displayName` y
 * `photoDataUrl` (si están puestos) sustituyen a los de Google en toda la UI.
 */
export interface UserProfile {
  /** Nombre visible del usuario (sustituye al de Google si `enabled`). */
  displayName?: string
  /** Foto de perfil subida por el usuario, ya redimensionada como data URL. */
  photoDataUrl?: string
  /** Descripción corta (máximo 200 caracteres). */
  bio?: string
  /** Artistas favoritos: se muestran en el perfil y sirven de semilla a F24. */
  favoriteArtists: ProfileArtistRef[]
  /** Playlists que el usuario marca como públicas (por id de playlist). */
  publicPlaylistIds: string[]
  /** Si es false, la app usa la foto/nombre de Google como hasta ahora. */
  enabled: boolean
}

export const DEFAULT_PROFILE: UserProfile = {
  displayName: '',
  photoDataUrl: '',
  bio: '',
  favoriteArtists: [],
  publicPlaylistIds: [],
  enabled: false
}

// ---------- Descubrimiento (F24) ----------

/**
 * Resultado del IPC `discovery:surprise`: la pista sugerida y un motivo
 * corto para mostrar como toast ("Porque escuchas a X", "Radio de Y"…).
 * `null` significa que no hay semillas suficientes (sin favoritos ni likes).
 */
export interface DiscoverySurpriseResult {
  track: TrackSummary
  reason: string
}

// ---------- Géneros (F23) ----------

/**
 * Respuesta del IPC `genre:resolve`. El renderer manda una lista de pistas y
 * recibe la clasificación por bucket (taxonomía fija de 14) junto con la
 * lista de géneros que realmente aportan una canción, para pintar solo los
 * chips con contenido.
 */
export interface GenreResolveResult {
  /** videoId → géneros asignados (al menos uno; `Sin género` como fallback). */
  tracksToGenres: Record<string, string[]>
  /** Géneros únicos presentes en la lista, ya ordenados por la taxonomía. */
  availableGenres: string[]
}

// ---------- Estadísticas (F31) ----------

/** Rango temporal cerrado en milisegundos epoch (ambos inclusive). */
export interface StatsPeriod {
  start: number
  end: number
}

/**
 * Agregado por canción para las listas Top. `playCount` y `totalSec` reflejan
 * el conteo del rango pedido (el `play_count` de la BD es global — el filtro
 * temporal se hace por `played_at`, ver limitación en el módulo `stats/`).
 */
export interface TrackStats {
  videoId: string
  title: string
  artists: string
  thumbnailUrl?: string
  playCount: number
  totalSec: number
}

/** Agregado por artista para las listas Top. */
export interface ArtistStats {
  name: string
  playCount: number
  totalSec: number
}

/** Resumen tipo "Wrapped" de los últimos N días (por defecto 30). */
export interface RecapData {
  period: StatsPeriod
  /** Horas totales estimadas de escucha en el período */
  hoursListened: number
  /** Nº de canciones únicas reproducidas en el período */
  uniqueTracks: number
  /** Nº de artistas únicos escuchados en el período */
  uniqueArtists: number
  /** Top 10 canciones del período */
  topTracks: TrackStats[]
  /** Top 5 artistas del período */
  topArtists: ArtistStats[]
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
  /** F32 · Devuelve la lista actual de estanterías detectadas (id + título) */
  HOME_SHELF_INDEX: 'home:shelfIndex',
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
  LIB_PLAYLIST_EDIT: 'library:playlistEdit',
  LIB_SUBSCRIBE: 'library:subscribe',
  LIB_LIKED_IDS: 'library:likedIds',
  /** main -> renderer: la biblioteca cambió (crear/editar playlist, like, sub…) */
  LIB_CHANGED: 'library:changed',
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
  SETTINGS_CHANGED: 'settings:changed', // main -> todas las ventanas (evento)
  // perfil de usuario (F20)
  PROFILE_GET: 'profile:get',
  PROFILE_SET: 'profile:set',
  PROFILE_CHANGED: 'profile:changed', // main -> todas las ventanas (evento)
  // géneros (F23): resolución con caché SQLite + Last.fm
  GENRE_RESOLVE: 'genre:resolve',
  // descubrimiento (F24): tarjetas "Sorpréndeme" y "Mix Personal"
  DISCOVERY_SURPRISE: 'discovery:surprise',
  DISCOVERY_MIX: 'discovery:mix',
  // estadísticas (F31): Wrapped, Top semanal/mensual, playlist auto-generada
  STATS_TOP_TRACKS: 'stats:topTracks',
  STATS_TOP_ARTISTS: 'stats:topArtists',
  STATS_RECAP: 'stats:recap',
  STATS_CREATE_TOP_PLAYLIST: 'stats:createTopPlaylist',
  // control remoto (teclas multimedia globales) main -> renderer
  MEDIA_COMMAND: 'media:command',
  // mini-player y estado de reproducción
  MINI_TOGGLE: 'mini:toggle',
  MINI_STATE: 'mini:state', // renderer principal -> main -> mini
  MINI_COMMAND: 'mini:command', // mini -> main -> renderer principal
  MINI_SHOW_MAIN: 'mini:showMain',
  MINI_SET_CORNER: 'mini:setCorner',
  MINI_OPEN_SETTINGS: 'mini:openSettings',
  MINI_SET_SCALE: 'mini:setScale',
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
  /** 'fixed' usa el acento elegido; 'dynamic' lo saca de la carátula en reproducción */
  accentMode: 'fixed' | 'dynamic'
  /** Fondo ambiental animado: off | ambient (deriva suave) | reactive (respira con el audio) */
  bgMode: 'off' | 'ambient' | 'reactive'
  /** Tinte de las superficies con el color de la carátula (0-100 %) */
  ambientTint: number
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
  /** Mostrar lo que escuchas en Discord */
  discordRpc: boolean
  /** Esquina del mini-player: tl/tr/bl/br o posición libre */
  miniCorner: 'tl' | 'tr' | 'bl' | 'br' | 'free'
  /** Modo karaoke del mini-player: letra en lugar de título/timeline */
  miniKaraoke: boolean
  /** Escala de la tarjeta del mini-player (0.8–1.6) */
  miniScale: number
  /** Posición libre del mini-player (si miniCorner = 'free') */
  miniX?: number
  miniY?: number

  // ---------- F27 · Paridad de reproducción con Metrolist Android ----------

  /** Calidad de sonido: auto (mejor disponible), alta (>=192k), media (<=192k), baja (<=96k) */
  audioQuality: 'auto' | 'high' | 'medium' | 'low'
  /** Desactivar crossfade cuando dos pistas consecutivas son del mismo álbum (gapless) */
  disableCrossfadeOnGapless: boolean
  /** Activa la normalización (compresor dinámico en la cadena) */
  normalize: boolean
  /** Nivel objetivo de la normalización: soft(-18) / normal(-14) / loud(-10) / aggressive(-7) LUFS aprox */
  normalizeLevel: 'soft' | 'normal' | 'loud' | 'aggressive'
  /** Cada seek consecutivo en <500 ms añade 5 s extra al salto */
  progressiveSeek: boolean
  /** Al añadir a la cola, si el videoId ya está, mover en vez de duplicar */
  avoidDuplicatesInQueue: boolean
  /** Al fallar el <audio>, saltar automáticamente a la siguiente */
  skipOnError: boolean
  /** Recuerda shuffle y repeat entre sesiones */
  rememberShuffleRepeat: boolean
  /** Mantiene shuffle activo al iniciar una nueva cola */
  persistentShuffle: boolean
  /** En autoplay, dispara `getUpNext` solo cuando la cola original ha terminado íntegramente */
  shuffleFirstBeforeSimilar: boolean
  /** Si repeat === 'all', no rellenar la cola con recomendaciones al final */
  disableAutoloadOnRepeatAll: boolean
  /** Al dar "me gusta" a una canción, dispara automáticamente su descarga */
  autoDownloadOnLike: boolean
  /** Habilita el contenido similar (autoplay) al agotar la cola */
  enableSimilarContent: boolean
  /** Precarga una nueva ronda de recomendaciones al 80% del último track de la cola */
  preloadMoreAt80Percent: boolean
  /** Máximo de entradas guardadas en el historial local (100..5000) */
  historyMaxEntries: number
  /** Persistencia opcional del estado de shuffle/repeat (usado por rememberShuffleRepeat) */
  lastShuffle?: boolean
  lastRepeat?: 'off' | 'all' | 'one'

  // ---------- F28 · Filtros de contenido ----------

  /** Oculta pistas marcadas como explícitas (isExplicit=true) en búsquedas, home, álbumes y playlists */
  hideExplicit: boolean
  /** Oculta canciones/tarjetas de tipo vídeo (kind='video') en cualquier listado */
  hideVideos: boolean
  /** Oculta YouTube Shorts (heurística: kind='video' con durationSec < 60) */
  hideShorts: boolean
  /** Idioma de contenido pasado a Innertube.create como `lang` (código ISO 639-1). 'auto' = locale del sistema */
  contentLanguage: string
  /** País de contenido pasado a Innertube.create como `location`. 'auto' = país del sistema */
  contentCountry: string
  /** Página del artista: mostrar/ocultar la descripción bajo el título */
  showArtistDescription: boolean
  /** Página del artista: mostrar/ocultar el número de suscriptores */
  showArtistSubscribers: boolean
  /** Página del artista: mostrar/ocultar la línea de oyentes mensuales (si existe) */
  showArtistMonthlyListeners: boolean
  /** Pausar automáticamente al cambiar el dispositivo de salida de audio por defecto */
  pauseOnAudioDeviceChange: boolean

  // ---------- F29 · Fuentes de streaming configurables ----------

  /**
   * Cadena de clientes InnerTube que el resolver prueba en orden.
   * El usuario puede reordenarlos y deshabilitar los que no le interesen.
   * Los ids que no correspondan a un cliente conocido de youtubei.js se
   * intentan igualmente; si el motor los rechaza se salta al siguiente.
   */
  streamingSources: StreamingSource[]
  /** Si todos los clientes InnerTube fallan, cae a yt-dlp como red de seguridad */
  useYtDlpFallback: boolean

  // ---------- F30 · Proveedores de letras configurables + romanización CJK ----------

  /**
   * Cadena de proveedores de letras que el orquestador prueba en orden.
   * El usuario reordena/desactiva. Ids conocidos: LRCLIB, KUGOU, YTMUSIC.
   */
  lyricsProviders: LyricsProvider[]
  /** Muestra romanización debajo de líneas con caracteres japoneses/coreanos. */
  romanizeLyrics: boolean

  // ---------- F31 · Wrapped y estadísticas ----------

  /** Longitud del top usado en Recap y en las playlists auto-generadas (10..500) */
  wrappedTopN: number
  /** Muestra la tarjeta Recap (últimos 30 días) en Inicio */
  showWrappedRecapCard: boolean
  /** Muestra la tarjeta "Top mensual" en Inicio */
  showTopMonthly: boolean
  /** Muestra la tarjeta "Top semanal" en Inicio */
  showTopWeekly: boolean

  // ---------- F32 · Personalización de Home ----------

  /** Baraja el orden de las estanterías de Inicio en cada carga (no persistente). */
  homeShuffleShelves: boolean
  /**
   * Orden custom de estanterías por `shelfId`. Cadena vacía = orden natural
   * del proveedor. Las estanterías cuyo id no esté aquí se pintan detrás en
   * el orden natural.
   */
  homeShelvesOrder: string[]
  /** Ids de estantería (`shelfId(title)`) que se ocultan de Inicio. */
  homeHiddenShelves: string[]
  /**
   * Categorías destacadas (chips) que aparecen encima del HomeHero. Ver
   * `HOME_QUICK_PICK_CATEGORIES` para el catálogo. Vacío = no se pinta la
   * fila de selecciones rápidas.
   */
  homeQuickPicks: string[]
}

/**
 * F32 · Catálogo de categorías destacadas mostradas como chips en Inicio.
 * El id coincide con los que devuelve `categorizeShelf()` para permitir hacer
 * scroll a la primera estantería que matchee.
 */
export const HOME_QUICK_PICK_CATEGORIES: { id: string; label: string; emoji: string }[] = [
  { id: 'recientes', label: 'Recientes', emoji: '⏱️' },
  { id: 'novedades', label: 'Novedades', emoji: '✨' },
  { id: 'mixes', label: 'Mixes', emoji: '🎧' },
  { id: 'radios', label: 'Radios', emoji: '📻' },
  { id: 'topcharts', label: 'Top Charts', emoji: '📈' },
  { id: 'sugerencias', label: 'Sugerencias', emoji: '💡' }
]

/** F32 · Selecciones rápidas por defecto. */
export const DEFAULT_HOME_QUICK_PICKS: string[] = ['recientes', 'novedades', 'mixes', 'radios']

/** F30 · Un proveedor de letras en la cadena configurable. */
export interface LyricsProvider {
  id: string
  enabled: boolean
}

/**
 * F30 · Orden y estado por defecto de la cadena de proveedores de letras.
 * Coincide con la cadena histórica: LRCLIB → KUGOU → YTMUSIC.
 */
export const DEFAULT_LYRICS_PROVIDERS: LyricsProvider[] = [
  { id: 'LRCLIB', enabled: true },
  { id: 'KUGOU', enabled: true },
  { id: 'YTMUSIC', enabled: true }
]

/** F29 · Un cliente configurable en la cadena de streaming. */
export interface StreamingSource {
  id: string
  enabled: boolean
}

/**
 * F29 · Orden y estado por defecto de la cadena de streaming.
 * Coincide con la cadena histórica del resolver (v0.3): YTMUSIC → IOS →
 * ANDROID → TV_EMBEDDED. Si un usuario tiene ajustes guardados sin este
 * campo, `getAllSettings()` los rellena con estos defaults.
 */
export const DEFAULT_STREAMING_SOURCES: StreamingSource[] = [
  { id: 'YTMUSIC', enabled: true },
  { id: 'IOS', enabled: true },
  { id: 'ANDROID', enabled: true },
  { id: 'TV_EMBEDDED', enabled: true }
]

export type MiniCorner = AppSettings['miniCorner']

export const DEFAULT_SETTINGS: AppSettings = {
  downloadsDir: '',
  theme: 'dark',
  accent: '#f43f4f',
  accentMode: 'fixed',
  bgMode: 'ambient',
  ambientTint: 60,
  crossfadeSec: 0,
  autoplay: true,
  eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  preampDb: 0,
  playbackRate: 1,
  preservePitch: true,
  closeToTray: false,
  discordRpc: false,
  miniCorner: 'br',
  miniKaraoke: false,
  miniScale: 1,
  // F27
  audioQuality: 'auto',
  disableCrossfadeOnGapless: true,
  normalize: false,
  normalizeLevel: 'normal',
  progressiveSeek: false,
  avoidDuplicatesInQueue: true,
  skipOnError: true,
  rememberShuffleRepeat: true,
  persistentShuffle: false,
  shuffleFirstBeforeSimilar: true,
  disableAutoloadOnRepeatAll: true,
  autoDownloadOnLike: false,
  enableSimilarContent: true,
  preloadMoreAt80Percent: false,
  historyMaxEntries: 500,
  // F28
  hideExplicit: false,
  hideVideos: false,
  hideShorts: true,
  contentLanguage: 'auto',
  contentCountry: 'auto',
  showArtistDescription: true,
  showArtistSubscribers: true,
  showArtistMonthlyListeners: true,
  pauseOnAudioDeviceChange: false,
  // F29 · fuentes de streaming (misma cadena histórica) + yt-dlp de rescate
  streamingSources: DEFAULT_STREAMING_SOURCES,
  useYtDlpFallback: true,
  // F30 · proveedores de letras y romanización CJK
  lyricsProviders: DEFAULT_LYRICS_PROVIDERS,
  romanizeLyrics: false,
  // F31 · Wrapped y estadísticas
  wrappedTopN: 50,
  showWrappedRecapCard: true,
  showTopMonthly: true,
  showTopWeekly: true,
  // F32 · personalización de Home (por defecto sin cambios: orden natural,
  // sin barajar, sin ocultar, chips clásicos)
  homeShuffleShelves: false,
  homeShelvesOrder: [],
  homeHiddenShelves: [],
  homeQuickPicks: DEFAULT_HOME_QUICK_PICKS
}

export interface LyricWord {
  /** Inicio absoluto de la palabra en ms */
  timeMs: number
  /** Duración cantada de la palabra en ms */
  durMs: number
  text: string
}

export interface LyricLine {
  timeMs: number
  text: string
  /** Tiempos por palabra (KRC de KuGou): karaoke que sigue al cantante */
  words?: LyricWord[]
}

export interface LyricsData {
  source: string
  /** Texto plano (no sincronizado) */
  plain?: string
  /** Líneas sincronizadas si existen */
  synced?: LyricLine[]
}
