import { create } from 'zustand'
import type { QueueItem, TrackSummary } from '@shared/types'
import { engine } from './engine'

/**
 * F27 · Flags de reproducción controlados desde ajustes. Se guardan en
 * variables de módulo (no en el store, para no obligar a re-renderizados) y
 * los toca `settingsStore.applyToEngine` al hidratar/actualizar los ajustes.
 * Defaults conservadores: coinciden con `DEFAULT_SETTINGS`.
 */
export const runtimeFlags = {
  avoidDuplicatesInQueue: true,
  skipOnError: true,
  progressiveSeek: false,
  disableCrossfadeOnGapless: false, // F50 · fundido también dentro de álbumes

  disableAutoloadOnRepeatAll: true,
  enableSimilarContent: true,
  shuffleFirstBeforeSimilar: true,
  preloadMoreAt80Percent: false,
  persistentShuffle: false
}

/**
 * Estado global de reproducción: cola, pista actual, controles.
 * El motor (engine.ts) hace el audio; aquí vive la lógica de cola.
 */

export type RepeatMode = 'off' | 'all' | 'one'

interface PlayerState {
  queue: QueueItem[]
  index: number
  isPlaying: boolean
  isBuffering: boolean
  currentTime: number
  duration: number
  volume: number
  repeat: RepeatMode
  shuffle: boolean
  /** Pistas del orden original cuando shuffle está activo */
  originalQueue: QueueItem[] | null
  error: string | null
  /** Al agotar la cola, sigue con recomendaciones (radio de YT Music) */
  autoplay: boolean
  /**
   * F46 · Info del cruce en curso, para que la UI pueda solapar visualmente
   * carátula/colores/texto con la misma duración que el fade de audio.
   * `null` fuera de un crossfade.
   */
  crossfading: {
    fromTrack: QueueItem
    startedAt: number
    durationMs: number
    /** Token único para poder detectar si nuestro setTimeout sigue vigente */
    token: number
  } | null
  /**
   * F54 · Salto manual en curso: la fila clicada mientras se resuelve su URL
   * (la UI la marca "cargando"; el aspecto global NO cambia hasta que el
   * audio puede arrancar — aspecto y sonido cambian JUNTOS).
   */
  pendingJump: { videoId: string } | null
  setAutoplay: (v: boolean) => void
  startRadio: (track: TrackSummary) => Promise<void>

  current: () => QueueItem | null
  playTracks: (tracks: TrackSummary[], startIndex?: number) => Promise<void>
  playNow: (track: TrackSummary) => Promise<void>
  enqueueNext: (track: TrackSummary) => void
  enqueueLast: (tracks: TrackSummary[]) => void
  removeFromQueue: (queueId: string) => void
  moveInQueue: (fromIdx: number, toIdx: number) => void
  /**
   * Avanza a la siguiente pista.
   *
   * F47 · Opcional `internal: true` cuando la llamada viene del propio motor
   * (early-trigger del crossfade o `ended`) — en ese caso, si xfade > 0 se
   * publica `crossfading` para que la UI funda visualmente y el audio hace
   * su fade en `engine.load(..., {crossfadeFrom: true})`. Los clicks del
   * usuario en "siguiente" (llamadas SIN internal) NO usan crossfade: salto
   * limpio y directo, como en cualquier reproductor.
   */
  next: (opts?: { internal?: boolean }) => Promise<void>
  previous: () => Promise<void>
  togglePlay: () => void
  seek: (seconds: number) => void
  setVolume: (v: number) => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  clearQueue: () => void
}

// F27 · Estado interno de la búsqueda progresiva.
let lastSeekAt = 0
let progressiveExtra = 0

// F47 · Refs internas compartidas entre el callback del create() y el
// subscribe posterior — el callback se ejecuta ANTES de que `usePlayer`
// esté disponible, por eso usamos este objeto como puente.
const crossfadeInternals: {
  firedFor: Set<string> | null
  getLastEndedAt: () => number
} = {
  firedFor: null,
  getLastEndedAt: () => 0
}

/**
 * F27 · Persiste shuffle/repeat en los ajustes cuando `rememberShuffleRepeat`
 * está activo. Import perezoso para evitar dependencia cíclica con settingsStore.
 */
let persistShuffleRepeatTimer = 0
function persistShuffleRepeat(patch: { shuffle?: boolean; repeat?: RepeatMode }): void {
  window.clearTimeout(persistShuffleRepeatTimer)
  persistShuffleRepeatTimer = window.setTimeout(() => {
    try {
      // Import perezoso del settingsStore para evitar el ciclo
      // (settingsStore importa store para setAutoplay).
      const mod = (
        window as unknown as {
          __erosMusicSettingsStore?: {
            useSettings: {
              getState: () => {
                settings: { rememberShuffleRepeat?: boolean }
                update: (patch: Record<string, unknown>) => Promise<void>
              }
            }
          }
        }
      ).__erosMusicSettingsStore
      if (!mod) return
      const st = mod.useSettings.getState()
      if (!st.settings.rememberShuffleRepeat) return
      const p: Record<string, unknown> = {}
      if (patch.shuffle !== undefined) p.lastShuffle = patch.shuffle
      if (patch.repeat !== undefined) p.lastRepeat = patch.repeat
      if (Object.keys(p).length) void st.update(p)
    } catch {
      /* silencio: los ajustes cargarán en la siguiente sesión */
    }
  }, 300)
}

let queueCounter = 0
function toQueueItem(t: TrackSummary): QueueItem {
  return { ...t, queueId: `q${++queueCounter}` }
}

// ---------- Cola persistente entre sesiones ----------

const QUEUE_KEY = 'eros.queue.v1'
// F63 · Clave usada hasta v1.1.x. Se lee como fallback si la nueva aún no
// existe (primer arranque tras el rebranding) y se limpia en cuanto la cola
// se persiste con la clave nueva. No borrar este fallback hasta estar seguro
// de que ningún perfil pre-v1.2.0 queda vivo.
const LEGACY_QUEUE_KEY = 'metrolist.queue.v1'

interface PersistedQueue {
  queue: QueueItem[]
  index: number
  currentTime: number
}

let persistTimer = 0
function schedulePersist(state: { queue: QueueItem[]; index: number }): void {
  window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    try {
      const payload: PersistedQueue = {
        queue: state.queue,
        index: state.index,
        currentTime: engine.currentTime
      }
      localStorage.setItem(QUEUE_KEY, JSON.stringify(payload))
      // Ya persistimos con la clave nueva: la vieja sobra (migración F63).
      localStorage.removeItem(LEGACY_QUEUE_KEY)
    } catch {
      /* almacenamiento lleno o similar: no es crítico */
    }
  }, 1500)
}

function readPersistedQueue(): PersistedQueue | null {
  try {
    const raw = localStorage.getItem(QUEUE_KEY) ?? localStorage.getItem(LEGACY_QUEUE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedQueue
    if (!Array.isArray(parsed.queue) || !parsed.queue.length) return null
    return parsed
  } catch {
    return null
  }
}

/** Pista restaurada pendiente de cargar en el motor (carga perezosa al dar play). */
let pendingRestore: { videoId: string; seekTo: number } | null = null

/**
 * F42 · Cinturón de seguridad del renderer: el main ya tiene timeouts en
 * cada paso de la resolución (getInfo, decipher, yt-dlp — ver resolver.ts),
 * pero esto es la segunda línea de defensa por si algo se escapa (p. ej. el
 * propio `<audio>.play()` del navegador, que en teoría podría no resolver
 * nunca). Sin esto, un cuelgue en CUALQUIER punto dejaba `isBuffering=true`
 * fijo — la canción "cargando" para siempre sin error visible ni forma de
 * recuperarse salvo reiniciar la app.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`timeout de ${ms / 1000}s en ${label}`)), ms)
    promise.then(
      (v) => {
        window.clearTimeout(t)
        resolve(v)
      },
      (e) => {
        window.clearTimeout(t)
        reject(e)
      }
    )
  })
}

/**
 * F53 · Duración del mini-fundido "de cortesía" en saltos manuales: cuando el
 * usuario clica una canción arbitraria con la música sonando, la actual sigue
 * sonando durante el prepare y al arrancar la nueva se funden 1 s — cero
 * silencio, cero corte seco, cero spinner con la app muda. Independiente del
 * `crossfadeSec` de Ajustes (que gobierna solo las transiciones naturales).
 */
const MANUAL_FADE_SEC = 1

/**
 * F54 · Resuelve la URL de stream de una pista (mapa de precarga o prepare
 * con timeout). Separado de la carga de audio para que los saltos MANUALES
 * puedan esperar la URL ANTES de cambiar el aspecto de la UI — así nunca se
 * ve "la canción nueva" mientras sigue sonando la anterior.
 */
async function resolveUrl(item: QueueItem): Promise<string> {
  // Cualquier carga explícita invalida la restauración perezosa pendiente
  pendingRestore = null
  const cached = preloadUrls.get(item.videoId)
  if (cached) return cached
  const prepared = await withTimeout(
    window.api.player.prepare(item.videoId),
    15_000,
    'preparar stream'
  )
  preloadUrls.set(item.videoId, prepared.url)
  return prepared.url
}

async function loadAndPlay(item: QueueItem, crossfade: boolean, fadeSec?: number): Promise<void> {
  const url = await resolveUrl(item)
  // 10 s tope para arrancar audio (típico: <1 s si hay precarga, ~2-3 s si no).
  await withTimeout(
    engine.load(url, { crossfadeFrom: crossfade, durationSec: fadeSec }),
    10_000,
    'arrancar audio'
  )
  // Historial local + sincronizado (mejor-esfuerzo)
  void window.api.history.add({ ...item, queueId: undefined } as never).catch(() => undefined)
}

const preloadUrls = new Map<string, string>()

// F27 · Recuerda para qué track ya lanzamos la precarga al 80% (evita spam).
const preloadedMoreFor = new Set<string>()

async function maybePreloadMore(videoId: string | undefined): Promise<void> {
  if (!videoId) return
  if (preloadedMoreFor.has(videoId)) return
  preloadedMoreFor.add(videoId)
  try {
    const state = usePlayer.getState()
    const last = state.queue[state.queue.length - 1]
    if (!last) return
    const upNext = await window.api.music.upNext(last.videoId)
    const inQueue = new Set(state.queue.map((q) => q.videoId))
    const fresh = ((upNext.tracks as TrackSummary[]) ?? []).filter(
      (t) => !inQueue.has(t.videoId)
    )
    if (!fresh.length) return
    usePlayer.setState({ queue: [...state.queue, ...fresh.map(toQueueItem)] })
    void preloadQueueUrls() // F54 · las nuevas también quedan listas
  } catch {
    /* mejor-esfuerzo */
  }
}

/**
 * F47b · Precarga en cascada: +1 en el deck inactivo (listo para crossfade
 * instantáneo) y +2 en el mapa (URL resuelta pero sin ocupar deck). Así si
 * el usuario adelanta 2 pistas seguidas, la segunda ya tiene URL sin
 * necesidad de re-preparar → no se queda "cargando".
 *
 * `preloadingSet` evita disparar múltiples prepares en paralelo del mismo
 * videoId (si `preloadUpcoming` se llama varias veces mientras uno está en
 * curso, los siguientes son no-ops).
 */
const preloadingSet = new Set<string>()

async function preloadOne(videoId: string, intoDeck: boolean): Promise<void> {
  // F50 · Camino rápido sin IPC: si la URL ya está resuelta, solo falta (si
  // procede) cargar el deck. `engine.preloadNext` se auto-protege durante un
  // fade en curso (F49), así que llamarlo repetidamente desde los milestones
  // de timeupdate es inocuo y AUTO-REPARA el deck cuando el fade termina.
  const cached = preloadUrls.get(videoId)
  if (cached) {
    if (intoDeck && !engine.hasPreloaded(videoId)) engine.preloadNext(videoId, cached)
    return
  }
  if (preloadingSet.has(videoId)) return
  preloadingSet.add(videoId)
  try {
    const prepared = await window.api.player.prepare(videoId)
    preloadUrls.set(videoId, prepared.url)
    if (intoDeck) engine.preloadNext(videoId, prepared.url)
  } catch {
    /* la precarga es mejor-esfuerzo */
  } finally {
    preloadingSet.delete(videoId)
  }
}

async function preloadUpcoming(state: Pick<PlayerState, 'queue' | 'index'>): Promise<void> {
  const next1 = state.queue[state.index + 1]
  const next2 = state.queue[state.index + 2]
  // +1: al deck inactivo → crossfade audio instantáneo cuando llegue
  if (next1) void preloadOne(next1.videoId, true)
  // +2: solo URL en el mapa → si el usuario adelanta, loadAndPlay la usa
  // directamente sin hacer prepare de nuevo (evita el "cargando" al saltar)
  if (next2) void preloadOne(next2.videoId, false)
}

/**
 * F54 · Precarga las URLs de TODA la cola, por cercanía al índice actual,
 * para que un salto manual a CUALQUIER canción sea instantáneo (la URL ya
 * está y el fundido arranca al momento). Serializada con pausa entre
 * prepares de red para no estresar a innertube; las ya cacheadas no cuentan.
 * Un token por pasada: si la cola cambia, la pasada vieja se aborta sola.
 */
let preloadQueueToken = 0
async function preloadQueueUrls(): Promise<void> {
  const token = ++preloadQueueToken
  const { queue, index } = usePlayer.getState()
  const byDistance = queue
    .map((q, i) => ({ q, d: Math.abs(i - index) }))
    .sort((a, b) => a.d - b.d)
    .map((x) => x.q)
  for (const item of byDistance) {
    if (token !== preloadQueueToken) return // cola nueva → pasada obsoleta
    if (preloadUrls.has(item.videoId)) continue
    await preloadOne(item.videoId, false)
    // Pausa suave solo tras un prepare real (con red de por medio)
    await new Promise((r) => setTimeout(r, 1200))
  }
}

export const usePlayer = create<PlayerState>((set, get) => {
  // Cableado de eventos del motor -> store (una sola vez)
  engine.on('timeupdate', (currentTime, duration) => {
    set({ currentTime, duration })
  })
  engine.on('playing', () => set({ isPlaying: true, isBuffering: false, error: null }))
  engine.on('paused', () => set({ isPlaying: false }))
  engine.on('buffering', (isBuffering) => set({ isBuffering }))
  engine.on('error', (message) => {
    set({ error: message, isPlaying: false })
    // F27 · Saltar al haber error: pasa automáticamente a la siguiente.
    if (runtimeFlags.skipOnError) {
      // pequeño respiro para que no se dispare en bucle si toda la cola falla
      setTimeout(() => void get().next({ internal: true }), 250)
    }
  })
  // F47 · Track del último 'ended' para que si el early trigger no llegó a
  // dispararse (pista corta, spool lento, streaming caído a mitad), aún
  // hagamos un fundido visual mínimo de 400 ms en `next()` — menos brusco
  // que el cambio seco anterior.
  let lastEndedAt = 0
  // F50 · Guard anti doble-avance: si el early-trigger disparó `next()` y el
  // prepare tarda (pista sin precargar, red lenta), la canción llega a
  // `ended` con ese next() aún EN VUELO → el handler de ended lanzaba un
  // SEGUNDO next() → saltaba una pista entera y el corte era seco. Con el
  // flag, mientras un avance interno está en curso los ended/error internos
  // se ignoran; los clics manuales del usuario siempre pasan.
  let advancing = false
  engine.on('ended', () => {
    lastEndedAt = Date.now()
    if (advancing) return
    // F47 · internal:true → avance natural, permite crossfade audio+visual
    void get().next({ internal: true })
  })

  // F37/F45/F47 · Crossfade real al estilo de la app Android original.
  //
  // Estrategia definitiva tras varias iteraciones y observar en vídeo que
  // "el fade a veces no ocurría":
  //
  // 1. Precarga en TRES hitos (30 %, 50 %, 75 %) para que la URL esté lista
  //    con muchísimo margen incluso si el spool va lento. Antes se disparaba
  //    solo al 55 % y con pistas cortas o red mala llegaba tarde.
  //
  // 2. Early-trigger CON MARGEN: `remaining <= xfade + 2` — hay 2 segundos
  //    extra para que `next()` (async) llegue a `engine.load()` y arranque
  //    el `to.el.play()`. Antes con `remaining <= xfade` justo el fade
  //    empezaba silencioso porque la nueva no había arrancado todavía.
  //
  // 3. Si NO hay precarga al llegar el trigger, disparamos de todas formas
  //    y dejamos que `next()` haga el prepare durante el fade — mejor un
  //    solape corto que ninguno.
  //
  // 4. `crossfading` visual: publica ANTES de `next()` para que el UI
  //    empiece a fundir carátula/colores/texto en cuanto el early-trigger
  //    dispara. Duración = `min(xfade, remaining)` — nunca queda "colgando"
  //    si la pista termina antes.
  //
  // 5. Fallback en `ended`: `next()` mira `lastEndedAt` y si sucedió hace
  //    <200 ms sin `crossfading` activo, lanza un mini-fade visual de 400
  //    ms — así incluso los cambios secos no se sienten como corte.
  const firedFor = new Set<string>()
  engine.on('timeupdate', (currentTime, duration) => {
    const xfade = engine.crossfadeSec
    if (xfade <= 0) return
    if (!isFinite(duration) || duration < 2) return
    const { queue, index, isPlaying, repeat, autoplay } = get()
    if (!isPlaying || index < 0 || repeat === 'one') return
    const cur = queue[index]
    if (!cur) return
    const key = `${index}:${cur.videoId}`
    const upcoming = queue[index + 1] ?? (repeat === 'all' ? queue[0] : undefined)
    if (!upcoming) {
      // F50 · Última pista de la cola con autoplay: amplía la cola con la
      // radio ANTES de que termine — sin esto el early-trigger nunca
      // disparaba (no había `upcoming`) y el paso a las recomendaciones
      // era SIEMPRE un corte seco tras un silencio de red.
      if (autoplay && runtimeFlags.enableSimilarContent && duration > 0) {
        const pct = currentTime / duration
        if (pct > 0.5 || duration - currentTime <= 30) {
          void maybePreloadMore(cur.videoId)
        }
      }
      return
    }
    // Gapless: mismo álbum consecutivo con el ajuste activo → transición al
    // corte natural sin adelantar (next() ya pone el fade a 0 en ese caso).
    if (
      runtimeFlags.disableCrossfadeOnGapless &&
      cur.album?.id &&
      upcoming.album?.id &&
      cur.album.id === upcoming.album.id
    ) {
      return
    }
    const remaining = duration - currentTime
    const pctPlayed = currentTime / duration
    // F50 · El criterio es "¿está en el DECK?" — la URL en el mapa no basta:
    // si `preloadNext` se saltó la carga por un fade en curso (F49), esto
    // reintenta en cada timeupdate hasta que el deck quede cargado (el
    // camino cacheado de preloadOne no hace IPC, así que es barato).
    const preloaded = engine.hasPreloaded(upcoming.videoId)
    if (!preloaded) {
      if (pctPlayed > 0.3 || remaining <= xfade + 8) {
        void preloadUpcoming({ queue, index })
      }
    }
    if (firedFor.has(key)) return
    // F50 · Con un avance ya en curso (clic manual, error en cadena) no
    // dispares el trigger: publicaría `crossfading` visual y un next()
    // interno que chocarían con el avance en vuelo.
    if (advancing) return
    // Trigger CON margen extra: 2 s más para que next()/load() arranquen a
    // tiempo el sonido de la siguiente antes de que la actual termine.
    const trigger = remaining <= xfade + 2
    if (!trigger) return
    firedFor.add(key)
    // Publica el estado de crossfade ANTES de next() para que la UI
    // empiece a fundir carátula/colores/texto al instante. Duración =
    // min(xfade, remaining) para que no quede colgando si la pista acaba.
    const visualMs = Math.min(xfade, Math.max(1, remaining)) * 1000
    const token = Math.random()
    set({
      crossfading: { fromTrack: cur, startedAt: Date.now(), durationMs: visualMs, token }
    })
    window.setTimeout(() => {
      const st = get()
      if (st.crossfading?.token === token) set({ crossfading: null })
    }, visualMs + 250)
    // F47 · internal:true → next() no publica otro crossfading (cxAlready)
    // pero pasa `crossfade:true` a engine.load para el fade audio.
    void get().next({ internal: true })
  })
  // F47 · Exponer las refs internas para que `next()` (dentro del mismo
  // create) pueda leer lastEndedAt y para que el subscribe (después del
  // create) limpie firedFor. Ambos se hacen tras la definición de usePlayer.
  crossfadeInternals.firedFor = firedFor
  crossfadeInternals.getLastEndedAt = () => lastEndedAt
  // F27 · preload al 80% del último track de la cola (autoplay más agresivo).
  engine.on('timeupdate', (currentTime, duration) => {
    if (!runtimeFlags.preloadMoreAt80Percent) return
    if (!duration || duration <= 0) return
    if (currentTime / duration < 0.8) return
    const { queue, index, autoplay } = get()
    // Solo si estamos en el último track de la cola actual y con autoplay/similar habilitados
    if (index !== queue.length - 1) return
    if (!autoplay || !runtimeFlags.enableSimilarContent) return
    // Evita disparar dos veces por track (marca con una clave por videoId)
    void maybePreloadMore(queue[index]?.videoId)
  })

  // F53 · Publica el estado `crossfading` para un salto MANUAL: fundido corto
  // (1 s) para que carátula/colores/texto/cola acompañen al mini-fade audio.
  const publishManualFade = (fromTrack: QueueItem): void => {
    const durationMs = MANUAL_FADE_SEC * 1000
    const token = Math.random()
    set({ crossfading: { fromTrack, startedAt: Date.now(), durationMs, token } })
    window.setTimeout(() => {
      const st = get()
      if (st.crossfading?.token === token) set({ crossfading: null })
    }, durationMs + 250)
  }
  // ¿Hay audio sonando de verdad? (en pausa, el salto manual es directo)
  const isAudible = (): boolean => !engine.paused && engine.currentTime > 0

  return {
    queue: [],
    index: -1,
    isPlaying: false,
    isBuffering: false,
    currentTime: 0,
    duration: 0,
    volume: 0.8,
    repeat: 'off',
    shuffle: false,
    originalQueue: null,
    error: null,
    autoplay: true,
    crossfading: null,
    pendingJump: null,

    setAutoplay: (v) => set({ autoplay: v }),

    startRadio: async (track) => {
      set({ isBuffering: true })
      try {
        const upNext = await window.api.music.upNext(track.videoId)
        const radioTracks = (upNext.tracks as TrackSummary[]) ?? []
        const all = radioTracks.length && radioTracks[0].videoId === track.videoId
          ? radioTracks
          : [track, ...radioTracks]
        await get().playTracks(all, 0)
      } catch {
        await get().playTracks([track], 0)
      }
    },

    current: () => {
      const { queue, index } = get()
      return index >= 0 && index < queue.length ? queue[index] : null
    },

    playTracks: async (tracks, startIndex = 0) => {
      if (!tracks.length) return
      preloadedMoreFor.clear()
      firedFor.clear() // F50 · cola nueva → rearma triggers de crossfade
      // F53/F54 · Salto manual con la música sonando: la actual SIGUE
      // sonando mientras se resuelve la URL de la nueva; el ASPECTO (índice,
      // carátula, colores) NO cambia hasta que el audio puede arrancar —
      // así nunca se ve la canción nueva con la anterior aún sonando.
      // Mientras tanto, `pendingJump` marca la fila clicada como "cargando".
      const prevTrack = get().current()
      const manualFade = Boolean(prevTrack) && isAudible()
      const queue = tracks.map(toQueueItem)
      const target = queue[startIndex]
      // F27 · shuffle persistente: si está activo mantenemos shuffle=true al
      // arrancar nueva cola (por defecto lo desactivábamos).
      const keepShuffle = runtimeFlags.persistentShuffle && get().shuffle
      let advGuard = false
      if (manualFade && prevTrack) {
        // F54 · Sin avances internos (trigger/ended) mientras resolvemos el
        // salto — si la actual está cerca del final, un crossfade natural en
        // paralelo haría un doble avance.
        advancing = true
        advGuard = true
        set({ pendingJump: { videoId: target.videoId }, isBuffering: true, error: null })
        try {
          await resolveUrl(target) // puebla el mapa; loadAndPlay dará hit
        } catch (err) {
          // La URL no llegó: NADA cambió de aspecto (la anterior sigue
          // sonando coherente). Solo avisamos del error.
          advancing = false
          set({ pendingJump: null, error: String((err as Error)?.message ?? err), isBuffering: false })
          return
        }
        set({
          queue,
          index: startIndex,
          originalQueue: null,
          shuffle: false,
          pendingJump: null,
          currentTime: 0
        })
        publishManualFade(prevTrack)
      } else {
        set({
          queue,
          index: startIndex,
          originalQueue: null,
          shuffle: false,
          error: null,
          isBuffering: true
        })
      }
      try {
        await loadAndPlay(target, manualFade, manualFade ? MANUAL_FADE_SEC : undefined)
        void preloadUpcoming({ queue, index: startIndex })
      } catch (err) {
        set({ error: String((err as Error)?.message ?? err), isBuffering: false })
      } finally {
        if (advGuard) advancing = false
      }
      // Re-activa shuffle si procede (después de arrancar para que el índice
      // baraje ya sobre la cola cargada).
      if (keepShuffle) get().toggleShuffle()
      // F54 · Deja TODA la cola con URL resuelta en segundo plano: cualquier
      // salto manual posterior será instantáneo.
      void preloadQueueUrls()
    },

    playNow: async (track) => {
      await get().playTracks([track], 0)
    },

    enqueueNext: (track) => {
      const { queue, index } = get()
      // F27 · Evitar duplicados: si ya está en la cola, mueve la fila existente
      //       justo después del índice actual en vez de duplicar.
      if (runtimeFlags.avoidDuplicatesInQueue) {
        const existingIdx = queue.findIndex((q) => q.videoId === track.videoId)
        if (existingIdx !== -1) {
          if (existingIdx === index + 1) return // ya está justo detrás
          const copy = [...queue]
          const [item] = copy.splice(existingIdx, 1)
          // El splice puede haber bajado el índice actual si estaba antes
          const currentIdx = existingIdx < index ? index - 1 : index
          copy.splice(currentIdx + 1, 0, item)
          set({ queue: copy, index: currentIdx })
          return
        }
      }
      const copy = [...queue]
      copy.splice(index + 1, 0, toQueueItem(track))
      set({ queue: copy })
    },

    enqueueLast: (tracks) => {
      const { queue } = get()
      if (runtimeFlags.avoidDuplicatesInQueue) {
        // Para cada pista: si está, muévela al final; si no, la añadimos.
        // Aplicamos secuencialmente conservando el orden pedido.
        let working = [...queue]
        const currentId = get().current()?.videoId
        let idx = get().index
        for (const t of tracks) {
          const existingIdx = working.findIndex((q) => q.videoId === t.videoId)
          if (existingIdx !== -1) {
            // No movemos la que se está reproduciendo
            if (working[existingIdx].videoId === currentId) continue
            const [item] = working.splice(existingIdx, 1)
            // Recalcula índice actual tras el splice
            if (existingIdx < idx) idx--
            working.push(item)
          } else {
            working.push(toQueueItem(t))
          }
        }
        set({ queue: working, index: idx })
        return
      }
      set({ queue: [...queue, ...tracks.map(toQueueItem)] })
    },

    removeFromQueue: (queueId) => {
      const { queue, index } = get()
      const idx = queue.findIndex((q) => q.queueId === queueId)
      if (idx === -1 || idx === index) return
      const copy = queue.filter((q) => q.queueId !== queueId)
      set({ queue: copy, index: idx < index ? index - 1 : index })
    },

    moveInQueue: (fromIdx, toIdx) => {
      const { queue, index } = get()
      if (fromIdx === index || toIdx === index) return
      const copy = [...queue]
      const [item] = copy.splice(fromIdx, 1)
      copy.splice(toIdx, 0, item)
      let newIndex = index
      if (fromIdx < index && toIdx >= index) newIndex--
      else if (fromIdx > index && toIdx <= index) newIndex++
      set({ queue: copy, index: newIndex })
    },

    next: async (opts) => {
      const internal = Boolean(opts?.internal)
      // F50 · Avances internos (early-trigger, ended, skipOnError) no se
      // apilan: si ya hay uno en vuelo, este se descarta. Los manuales
      // (clic del usuario) siempre pasan — dos clics = saltar dos.
      if (internal && advancing) return
      advancing = true
      try {
      const { queue, index, repeat, autoplay, crossfading: cxAlready } = get()
      if (repeat === 'one' && index >= 0) {
        engine.seek(0)
        engine.play()
        return
      }
      // F47 · Publica `crossfading` visual SOLO cuando el avance viene del
      // propio motor (early-trigger o `ended`): así el fundido audio+visual
      // acompaña una transición natural. Clic manual del usuario = salto
      // limpio, sin fade. Si el early-trigger ya publicó, no lo pisamos.
      const xfade = engine.crossfadeSec
      const curForCx = queue[index]
      let manualFade = false
      if (internal && xfade > 0 && curForCx && !cxAlready) {
        // Duración visual = min(xfade, tiempo audio restante). Si venimos
        // de 'ended' (lastEndedAt reciente), no hay solape audio real →
        // fade visual mínimo (400 ms) para que el cambio no sea seco.
        const now = Date.now()
        const audioRemaining = Math.max(0, engine.duration - engine.currentTime)
        const cameFromEnded = now - crossfadeInternals.getLastEndedAt() < 200
        const visualMs = cameFromEnded ? 400 : Math.min(xfade * 1000, Math.max(400, audioRemaining * 1000))
        const token = Math.random()
        set({
          crossfading: { fromTrack: curForCx, startedAt: now, durationMs: visualMs, token }
        })
        window.setTimeout(() => {
          const st = get()
          if (st.crossfading?.token === token) set({ crossfading: null })
        }, visualMs + 250)
      } else if (!internal) {
        // F53 · Manual con audio sonando: mini-fundido de cortesía. El
        // publish se hace MÁS ABAJO, cuando la URL ya está resuelta (F54) —
        // aspecto y sonido deben cambiar juntos.
        if (curForCx && isAudible()) {
          manualFade = true
        } else if (cxAlready) {
          // F47 · Manual en silencio: descarta el fundido visual colgado.
          set({ crossfading: null })
        }
      }
      let nextIndex = index + 1
      if (nextIndex >= queue.length) {
        // F27 · Si repeat === 'all' y `disableAutoloadOnRepeatAll`, no rellenamos
        // con recomendaciones: sencillamente volvemos al principio de la cola.
        if (repeat === 'all' && queue.length) {
          nextIndex = 0
          // F50 · Al dar la vuelta a la cola los pares index:videoId se
          // repiten — sin limpiar, el early-trigger jamás volvería a
          // disparar en la segunda pasada (crossfade solo la 1ª vez).
          firedFor.clear()
        }
        // F27 · `enableSimilarContent` gatea el autoplay real (compat con
        // `autoplay`: si el usuario apagó cualquiera de los dos, no se rellena).
        else if (autoplay && runtimeFlags.enableSimilarContent && queue.length) {
          // Radio: amplía la cola con recomendaciones a partir de la última pista
          try {
            const last = queue[queue.length - 1]
            const upNext = await window.api.music.upNext(last.videoId)
            const inQueue = new Set(queue.map((q) => q.videoId))
            const fresh = ((upNext.tracks as TrackSummary[]) ?? []).filter(
              (t) => !inQueue.has(t.videoId)
            )
            if (!fresh.length) {
              set({ isPlaying: false })
              return
            }
            set({ queue: [...queue, ...fresh.map(toQueueItem)] })
            void preloadQueueUrls() // F54 · las nuevas también quedan listas
          } catch {
            set({ isPlaying: false })
            return
          }
        } else {
          set({ isPlaying: false })
          return
        }
      }
      const liveQueue = get().queue // puede haber crecido con la radio
      // F27 · Crossfade desactivado en álbumes gapless: si la siguiente pista es
      // del mismo álbum que la anterior, forzamos crossfade a 0 solo para esta
      // transición (restauramos justo después).
      const prev = liveQueue[index]
      const upcoming = liveQueue[nextIndex]
      let restoreXfade: number | null = null
      if (
        runtimeFlags.disableCrossfadeOnGapless &&
        prev?.album?.id &&
        upcoming?.album?.id &&
        prev.album.id === upcoming.album.id
      ) {
        restoreXfade = engine.crossfadeSec
        engine.setCrossfade(0)
      }
      // F54 · Manual: resuelve la URL ANTES de tocar el aspecto — si tarda,
      // la canción actual sigue sonando con su propia carátula/colores y la
      // fila destino queda marcada "cargando" (pendingJump).
      if (manualFade) {
        set({ pendingJump: { videoId: liveQueue[nextIndex].videoId }, isBuffering: true })
        try {
          await resolveUrl(liveQueue[nextIndex])
        } catch (err) {
          set({
            pendingJump: null,
            error: String((err as Error)?.message ?? err),
            isBuffering: false
          })
          if (restoreXfade !== null) engine.setCrossfade(restoreXfade)
          if (runtimeFlags.skipOnError) {
            setTimeout(() => void get().next({ internal: true }), 300)
          }
          return
        }
        if (curForCx) publishManualFade(curForCx)
      }
      set({ index: nextIndex, isBuffering: true, currentTime: 0, pendingJump: null })
      try {
        // F47/F53 · Avance interno → crossfade natural (crossfadeSec).
        // Manual con audio sonando → mini-fundido de cortesía de 1 s.
        await loadAndPlay(
          liveQueue[nextIndex],
          internal || manualFade,
          manualFade ? MANUAL_FADE_SEC : undefined
        )
        // F49 · CRÍTICO: si acabamos de disparar un crossfade audio, NO
        // llames a preloadUpcoming ahora mismo — engine.preloadNext
        // reasigna .src + .load() al deck inactivo, que durante el
        // fade-out ES el deck que sigue sonando. Eso pausaba el `from` a
        // currentTime=0 a mitad del ramp del gain → SALTO SECO. Diferir
        // hasta que el fade termine (con margen extra).
        const isCrossfading = internal && xfade > 0
        const delay = isCrossfading ? xfade * 1000 + 500 : 0
        if (delay > 0) {
          window.setTimeout(
            () => preloadUpcoming({ queue: get().queue, index: get().index }),
            delay
          )
        } else {
          void preloadUpcoming({ queue: liveQueue, index: nextIndex })
        }
      } catch (err) {
        set({ error: String((err as Error)?.message ?? err), isBuffering: false })
        // F47 · Blindaje adicional: si un manual next() falla, salta a la
        // siguiente automáticamente para no dejar la app "colgada
        // cargando". Reutiliza la lógica de skipOnError sin loop infinito.
        if (!internal && runtimeFlags.skipOnError) {
          setTimeout(() => void get().next({ internal: true }), 300)
        }
      } finally {
        if (restoreXfade !== null) engine.setCrossfade(restoreXfade)
      }
      } finally {
        advancing = false
      }
    },

    previous: async () => {
      const { queue, index } = get()
      // Con >3 s reproducidos, "anterior" reinicia la pista (como Spotify)
      if (engine.currentTime > 3 || index <= 0) {
        engine.seek(0)
        return
      }
      const prevIndex = index - 1
      // F53/F54 · Igual que el resto de saltos manuales: URL primero, y solo
      // entonces aspecto + mini-fundido (si había audio sonando).
      const curTrack = queue[index]
      const manualFade = Boolean(curTrack) && isAudible()
      if (manualFade && curTrack) {
        set({ pendingJump: { videoId: queue[prevIndex].videoId }, isBuffering: true })
        try {
          await resolveUrl(queue[prevIndex])
        } catch (err) {
          set({
            pendingJump: null,
            error: String((err as Error)?.message ?? err),
            isBuffering: false
          })
          return
        }
        publishManualFade(curTrack)
      }
      set({ index: prevIndex, isBuffering: true, currentTime: 0, pendingJump: null })
      try {
        await loadAndPlay(queue[prevIndex], manualFade, manualFade ? MANUAL_FADE_SEC : undefined)
        void preloadUpcoming({ queue, index: prevIndex })
      } catch (err) {
        set({ error: String((err as Error)?.message ?? err), isBuffering: false })
      }
    },

    togglePlay: () => {
      const { index, queue } = get()
      if (index < 0) return
      // Cola restaurada de la sesión anterior: carga perezosa al primer play
      if (pendingRestore && queue[index]?.videoId === pendingRestore.videoId) {
        const { seekTo } = pendingRestore
        pendingRestore = null
        set({ isBuffering: true })
        void loadAndPlay(queue[index], false)
          .then(() => {
            if (seekTo > 2) engine.seek(seekTo)
            void preloadUpcoming({ queue, index })
          })
          .catch((err) => {
            // F47c · Si el prepare falló (URL inaccesible, resolver KO,
            // yt-dlp sin runtime JS...) NO nos quedamos con el spinner:
            // limpiamos estado, mostramos error y saltamos a la siguiente
            // pista automáticamente si `skipOnError` está activo.
            set({
              error: String((err as Error)?.message ?? err),
              isBuffering: false,
              isPlaying: false
            })
            if (runtimeFlags.skipOnError && queue.length > index + 1) {
              setTimeout(() => void get().next({ internal: true }), 300)
            }
          })
        return
      }
      if (engine.paused) engine.play()
      else engine.pause()
    },

    seek: (seconds) => {
      // F27 · Búsqueda progresiva: si el usuario encadena seeks separados por
      // <500 ms, cada salto añade 5 s extra al pedido (acumulativo). Reset a 0
      // si pasa más de 500 ms sin llamar.
      let target = seconds
      if (runtimeFlags.progressiveSeek) {
        const now = performance.now()
        if (now - lastSeekAt < 500) {
          progressiveExtra += 5
          target = seconds + progressiveExtra
        } else {
          progressiveExtra = 0
        }
        lastSeekAt = now
      }
      // Clampa al rango válido para no romper el <audio>
      const dur = engine.duration || Infinity
      const clamped = Math.max(0, Math.min(dur, target))
      engine.seek(clamped)
      set({ currentTime: clamped })
      // F50 · Rearma el early-trigger para esta pista: si el usuario ya
      // pasó por la zona de crossfade y vuelve atrás (o arrastra la barra
      // repetidamente para probar), el fundido debe poder disparar de
      // nuevo — antes `firedFor` lo bloqueaba para siempre.
      const st = get()
      const cur = st.queue[st.index]
      if (cur) firedFor.delete(`${st.index}:${cur.videoId}`)
    },

    setVolume: (v) => {
      engine.setVolume(v)
      set({ volume: v })
    },

    toggleShuffle: () => {
      firedFor.clear() // F50 · los pares index:videoId cambian al barajar
      const { shuffle, queue, index, originalQueue } = get()
      if (!shuffle) {
        const current = queue[index]
        const rest = queue.filter((_, i) => i !== index)
        for (let i = rest.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[rest[i], rest[j]] = [rest[j], rest[i]]
        }
        set({
          shuffle: true,
          originalQueue: queue,
          queue: current ? [current, ...rest] : rest,
          index: current ? 0 : -1
        })
      } else {
        const current = queue[index]
        const restored = originalQueue ?? queue
        const newIndex = current
          ? restored.findIndex((q) => q.queueId === current.queueId)
          : -1
        set({ shuffle: false, originalQueue: null, queue: restored, index: newIndex })
      }
      // F27 · Persistencia opcional del estado de shuffle en los ajustes.
      persistShuffleRepeat({ shuffle: get().shuffle })
    },

    cycleRepeat: () => {
      const order: RepeatMode[] = ['off', 'all', 'one']
      const next = order[(order.indexOf(get().repeat) + 1) % order.length]
      set({ repeat: next })
      // F27 · Persistencia opcional del estado de repeat en los ajustes.
      persistShuffleRepeat({ repeat: next })
    },

    clearQueue: () => {
      engine.stop()
      set({ queue: [], index: -1, isPlaying: false, currentTime: 0, duration: 0 })
      localStorage.removeItem(QUEUE_KEY)
      localStorage.removeItem(LEGACY_QUEUE_KEY)
    }
  }
})

// Persistencia: guarda la cola al cambiar y restaura al arrancar (en pausa)
usePlayer.subscribe((state) => {
  if (state.queue.length) schedulePersist(state)
})

// F50 · Referencia para pruebas E2E/diagnóstico (solo lectura), simétrica a
// la de `__erosMusicSettingsStore` en settingsStore.
;(window as unknown as { __erosMusicPlayerStore?: unknown }).__erosMusicPlayerStore = usePlayer

// ---------- F68/F69 · Scrobbling (Last.fm + ListenBrainz) ----------
// Se dispara vía subscribe al store: al empezar una canción (nowPlaying) y
// al cumplir la regla de scrobble (≥30 s O ≥50 % de duración).
{
  let scrobbleTrackId: string | null = null
  let scrobbleStarted = false
  let scrobbleSent = false
  let scrobbleStartTime = 0

  /** Lee los ajustes sin importar el módulo (evita ciclo). */
  const getSettings = (): {
    lastfmEnabled?: boolean; lastfmSessionKey?: string
    listenbrainzEnabled?: boolean; listenbrainzToken?: string
  } | null => {
    const w = window as unknown as {
      __erosMusicSettingsStore?: {
        useSettings: { getState: () => { settings: Record<string, unknown> } }
      }
    }
    return (w.__erosMusicSettingsStore?.useSettings.getState().settings as Record<string, unknown>) ?? null
  }

  usePlayer.subscribe((state) => {
    const cur = state.current()
    if (!cur) return

    // Canción nueva → enviar nowPlaying y rearmar el flag de scrobble
    if (cur.videoId !== scrobbleTrackId) {
      scrobbleTrackId = cur.videoId
      scrobbleStarted = false
      scrobbleSent = false
      scrobbleStartTime = Date.now() / 1000
    }

    // Solo scrobblear si está reproduciendo
    if (!state.isPlaying) return

    const s = getSettings()
    if (!s) return
    const hasLastfm = Boolean(s.lastfmEnabled && s.lastfmSessionKey)
    const hasLb = Boolean(s.listenbrainzEnabled && s.listenbrainzToken)
    if (!hasLastfm && !hasLb) return

    const artist = cur.artists.map((a) => a.name).join(', ')
    const album = cur.album?.name

    // NowPlaying: al empezar la reproducción de una canción
    if (!scrobbleStarted) {
      scrobbleStarted = true
      scrobbleStartTime = Date.now() / 1000
      if (hasLastfm) {
        void window.api.lastfm.nowPlaying({
          title: cur.title, artist, album, duration: cur.durationSec
        }).catch(() => undefined)
      }
      if (hasLb) {
        void window.api.listenbrainz.nowPlaying({
          title: cur.title, artist, album
        }).catch(() => undefined)
      }
    }

    // Scrobble: ≥30s O ≥50% de duración (una sola vez por reproducción)
    if (!scrobbleSent && state.duration > 0) {
      const playedSec = state.currentTime
      const threshold = Math.min(30, state.duration * 0.5)
      if (playedSec >= threshold) {
        scrobbleSent = true
        const timestamp = Math.round(scrobbleStartTime)
        if (hasLastfm) {
          void window.api.lastfm.scrobble({
            title: cur.title, artist, album,
            duration: cur.durationSec, timestamp
          }).catch(() => undefined)
        }
        if (hasLb) {
          void window.api.listenbrainz.submit({
            title: cur.title, artist, album, timestamp
          }).catch(() => undefined)
        }
      }
    }
  })
}
// F54 · Métricas de precarga para las pruebas E2E (cola lista para saltos).
function preloadStatsForE2E(): { urls: number } {
  return { urls: preloadUrls.size }
}
;(window as unknown as { __erosMusicPreloadStats?: unknown }).__erosMusicPreloadStats =
  preloadStatsForE2E

{
  const persisted = readPersistedQueue()
  if (persisted) {
    const maxQ = Math.max(...persisted.queue.map((q) => Number(q.queueId.slice(1)) || 0))
    queueCounter = Math.max(queueCounter, maxQ)
    const index = Math.min(Math.max(0, persisted.index), persisted.queue.length - 1)
    pendingRestore = {
      videoId: persisted.queue[index]?.videoId ?? '',
      seekTo: persisted.currentTime || 0
    }
    usePlayer.setState({
      queue: persisted.queue,
      index,
      currentTime: persisted.currentTime || 0,
      duration: persisted.queue[index]?.durationSec ?? 0
    })
  }
}
