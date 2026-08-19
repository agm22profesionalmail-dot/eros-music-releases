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

/** Pista de música local del usuario (archivo que posee). */
export interface LocalTrack {
  /** id único auto-incrementado en SQLite */
  id: number
  /** Ruta absoluta del archivo de audio */
  filePath: string
  /** Nombre visible (editable por el usuario) */
  title: string
  /** Artista (editable) */
  artist: string
  /** Álbum (editable) */
  album: string
  /** Duración en segundos (0 si no se pudo leer) */
  durationSec: number
  /** Ruta a la carátula extraída/personalizada, o data URL */
  coverPath?: string
  /** Formatos soportados */
  format: string
  /** Tamaño del archivo en bytes */
  sizeBytes: number
  /** Timestamp de adición a la biblioteca */
  addedAt: number
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

/** F80 · Pista para la Espiral Musical con metadatos de descubrimiento. */
export interface SpiralTrack extends TrackSummary {
  /** Canción que encaja con los gustos del usuario */
  isMatch: boolean
  /** Artista con pocos seguidores / poco conocido */
  isSmallArtist: boolean
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
  thumbnailUrl?: string
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
  /** F36 · Borra (propia) o quita de la biblioteca (ajena) una playlist */
  LIB_PLAYLIST_DELETE: 'library:playlistDelete',
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
  // música local
  LOCAL_LIST: 'local:list',
  LOCAL_SCAN: 'local:scan',
  LOCAL_EDIT_META: 'local:editMeta',
  LOCAL_REMOVE: 'local:remove',
  LOCAL_CHANGE_DIR: 'local:changeDir',
  LOCAL_OPEN_DIR: 'local:openDir',
  /** main -> renderer: la carpeta de música local cambió (añadido/eliminado/modificado) */
  LOCAL_CHANGED: 'local:changed',
  // ajustes
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_CHANGED: 'settings:changed', // main -> todas las ventanas (evento)
  // onboarding (F61): flag "asistente de bienvenida completado"
  ONBOARDING_GET_COMPLETED: 'onboarding:getCompleted',
  ONBOARDING_SET_COMPLETED: 'onboarding:setCompleted',
  // perfil de usuario (F20)
  PROFILE_GET: 'profile:get',
  PROFILE_SET: 'profile:set',
  PROFILE_CHANGED: 'profile:changed', // main -> todas las ventanas (evento)
  // géneros (F23): resolución con caché SQLite + Last.fm
  GENRE_RESOLVE: 'genre:resolve',
  // descubrimiento (F24): tarjetas "Sorpréndeme" y "Mix Personal"
  DISCOVERY_SURPRISE: 'discovery:surprise',
  DISCOVERY_MIX: 'discovery:mix',
  DISCOVERY_SPIRAL: 'discovery:spiral',
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
  WIN_MAXIMIZED_CHANGED: 'win:maximizedChanged',
  // app (F65): metadatos de la aplicación
  APP_GET_VERSION: 'app:getVersion',
  // auto-actualización (F67)
  UPDATE_CHECK: 'update:check', // renderer -> main (comprobación manual, botón en Ajustes)
  UPDATE_START_DOWNLOAD: 'update:startDownload', // renderer -> main (tras pulsar "Actualizar ahora")
  UPDATE_INSTALL_NOW: 'update:installNow', // renderer -> main (instala lo descargado y reinicia)
  UPDATE_AVAILABLE: 'update:available', // main -> renderer (evento): { version: string }
  UPDATE_NOT_AVAILABLE: 'update:notAvailable', // main -> renderer (evento, solo tras comprobación MANUAL)
  UPDATE_DOWNLOAD_PROGRESS: 'update:downloadProgress', // main -> renderer (evento): { percent: number }
  UPDATE_DOWNLOADED: 'update:downloaded', // main -> renderer (evento): { version: string }
  UPDATE_ERROR: 'update:error', // main -> renderer (evento): { message: string }
  // ---- F68 · Last.fm scrobbling ----
  LASTFM_AUTH_URL: 'lastfm:authUrl',
  LASTFM_AUTH_COMPLETE: 'lastfm:authComplete',
  LASTFM_DISCONNECT: 'lastfm:disconnect',
  LASTFM_SCROBBLE: 'lastfm:scrobble',
  LASTFM_NOW_PLAYING: 'lastfm:nowPlaying',
  // ---- F69 · ListenBrainz sync ----
  LISTENBRAINZ_SUBMIT: 'listenbrainz:submit',
  LISTENBRAINZ_NOW_PLAYING: 'listenbrainz:nowPlaying',
  LISTENBRAINZ_VALIDATE: 'listenbrainz:validate',
  // ---- F71 · Importación de playlists ----
  IMPORT_SPOTIFY: 'import:spotify',
  IMPORT_FILE: 'import:file',
  IMPORT_FILE_DIALOG: 'import:fileDialog',
  IMPORT_PROGRESS: 'import:progress' // main -> renderer (evento)
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
  /** Carpeta de música local del usuario */
  localMusicDir: string
  /** Tema visual */
  theme: 'dark' | 'black' | 'light'
  /**
   * F36 · Tema predefinido con colores fijos (paletas estilo Discord Nitro).
   * 'none' = usar el tema clásico de arriba. Cualquier otro valor debe casar
   * con un id de THEME_PRESETS; si no casa, se ignora (equivale a 'none').
   */
  themePreset: string
  /** Color de acento (hex) */
  accent: string
  /** 'fixed' usa el acento elegido; 'dynamic' lo saca de la carátula en reproducción */
  accentMode: 'fixed' | 'dynamic'
  /** Fondo ambiental animado: off | ambient (deriva suave) | reactive (respira con el audio) */
  bgMode: 'off' | 'ambient' | 'reactive'
  /**
   * Diseño visual del fondo ambiental (independiente de `bgMode`, que sólo
   * decide si reacciona al audio). No confundir con el visualizador a pantalla
   * completa: todos estos diseños son capas ambientales difuminadas de fondo.
   *  - blobs     · manchas de color que derivan (diseño original)
   *  - waves     · ondas que se deforman con el ritmo
   *  - particles · puntos/estrellas que brillan por banda de frecuencia
   *  - aurora    · cortinas de color tipo aurora que respiran
   *  - artwork   · carátula muy difuminada con zoom lento
   */
  bgDesign: 'blobs' | 'waves' | 'particles' | 'aurora' | 'artwork'
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

  // ---------- F27 · Paridad de reproducción con la app Android original ----------

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

  // ---------- F33 · Proxy HTTP/SOCKS ----------

  /**
   * Modo de proxy aplicado a `session.defaultSession` y propagado a yt-dlp:
   *   - `off`     — sin proxy (comportamiento por defecto).
   *   - `system`  — usa la configuración de proxy del sistema operativo.
   *   - `http`    — proxy HTTP explícito (ver `proxyUrl`).
   *   - `socks5`  — proxy SOCKS5 explícito (ver `proxyUrl`).
   */
  proxyMode: 'off' | 'system' | 'http' | 'socks5'
  /**
   * URL del proxy cuando `proxyMode` es `http` o `socks5`. Se admite el
   * esquema (`http://`, `socks5://`) pero se ignora al aplicar — la parte
   * útil es `usuario:password@host:puerto` o `host:puerto`.
   */
  proxyUrl: string

  // ---------- F34 · Idioma de la interfaz ----------

  /**
   * Idioma de la UI. 'auto' detecta el sistema (fallback a 'es' si no es EN).
   * NO afecta a `contentLanguage` (F28) — ese sigue rigiendo InnerTube.
   */
  uiLanguage: 'auto' | 'es' | 'en'

  // ---------- F68 · Last.fm scrobbling ----------
  /** Last.fm habilitado */
  lastfmEnabled: boolean
  /** Session key de Last.fm (obtenida tras auth) */
  lastfmSessionKey: string
  /** Nombre de usuario de Last.fm (para mostrar en la UI) */
  lastfmUsername: string

  // ---------- F69 · ListenBrainz sync ----------
  /** ListenBrainz habilitado */
  listenbrainzEnabled: boolean
  /** Token de usuario de ListenBrainz */
  listenbrainzToken: string

  // ---------- F70 · EQ multi-banda ----------
  /** Modo del ecualizador: 10, 15 o 31 bandas */
  eqMode: '10' | '15' | '31'
  /** Ganancias del EQ de 15 bandas en dB */
  eqGains15: number[]
  /** Ganancias del EQ de 31 bandas en dB */
  eqGains31: number[]

  // ---------- F72 · Desfase de letras por canción ----------
  /** Desfase global de letras en ms (se suma al timing sincronizado) */
  lyricsOffsetMs: number
}

// ---------- Importación de playlists (F71) ----------

export interface ImportTrackMatch {
  /** Título original del track en la fuente */
  sourceTitle: string
  /** Artista original del track en la fuente */
  sourceArtist: string
  /** Track encontrado en YouTube Music (null si no se encontró) */
  match: TrackSummary | null
  /** Calidad del match: 'exact', 'partial', 'none' */
  quality: 'exact' | 'partial' | 'none'
}

export interface ImportProgress {
  state: 'parsing' | 'matching' | 'creating' | 'done' | 'error'
  current: number
  total: number
  matches: ImportTrackMatch[]
  error?: string
  playlistId?: string
}

/**
 * F32 · Catálogo de categorías destacadas mostradas como chips en Inicio.
 * El id coincide con los que devuelve `categorizeShelf()` para permitir hacer
 * scroll a la primera estantería que matchee.
 */
/** F57/F58 · Identificadores de icono SVG (ver Icons.tsx) para cada categoría. */
export type HomeQuickPickIcon = 'recent' | 'sparkle' | 'headphones' | 'radio' | 'chart' | 'lightbulb'

export const HOME_QUICK_PICK_CATEGORIES: { id: string; label: string; icon: HomeQuickPickIcon }[] = [
  { id: 'recientes', label: 'Recientes', icon: 'recent' },
  { id: 'novedades', label: 'Novedades', icon: 'sparkle' },
  { id: 'mixes', label: 'Mixes', icon: 'headphones' },
  { id: 'radios', label: 'Radios', icon: 'radio' },
  { id: 'topcharts', label: 'Top Charts', icon: 'chart' },
  { id: 'sugerencias', label: 'Sugerencias', icon: 'lightbulb' }
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
  localMusicDir: '',
  theme: 'dark',
  // F60 · Rediseño café: los usuarios nuevos arrancan con el tema de la casa
  // (preset "Coffee Cream", a juego con el logo) y acento caramelo. Quien ya
  // tiene ajustes guardados en SQLite no se ve afectado.
  themePreset: 'coffee-cream',
  accent: '#c98f55',
  accentMode: 'fixed',
  bgMode: 'ambient',
  bgDesign: 'blobs',
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
  // F50 · false: el crossfade suena también entre pistas del mismo álbum
  // (el usuario puede reactivar la excepción gapless en Ajustes)
  disableCrossfadeOnGapless: false,
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
  homeQuickPicks: DEFAULT_HOME_QUICK_PICKS,
  // F33 · proxy desactivado por defecto
  proxyMode: 'off',
  proxyUrl: '',
  // F34 · idioma de la UI (auto = detecta del sistema)
  uiLanguage: 'auto',
  // F68 · Last.fm scrobbling
  lastfmEnabled: false,
  lastfmSessionKey: '',
  lastfmUsername: '',
  // F69 · ListenBrainz sync
  listenbrainzEnabled: false,
  listenbrainzToken: '',
  // F70 · EQ multi-banda
  eqMode: '10' as const,
  eqGains15: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  eqGains31: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  // F72 · Desfase de letras
  lyricsOffsetMs: 0
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

/** Extensiones de audio aceptadas como música local. */
export const SUPPORTED_LOCAL_FORMATS = ['.mp3', '.m4a', '.flac', '.opus', '.wav', '.ogg', '.aac', '.wma'] as const
