import { create } from 'zustand'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types'
import { engine } from '../player/engine'
import { usePlayer, runtimeFlags } from '../player/store'
import { extractAccent } from './artworkColor'

/**
 * Ajustes de la app: se hidratan del main (SQLite), se aplican al motor de
 * audio y al tema, y cada cambio se persiste.
 */

interface SettingsState {
  settings: AppSettings
  loaded: boolean
  init: () => Promise<void>
  update: (patch: Partial<AppSettings>) => Promise<void>
}

function applyToEngine(s: AppSettings): void {
  engine.setEq(s.eqGains)
  engine.setPreamp(s.preampDb)
  engine.setPlaybackRate(s.playbackRate, s.preservePitch)
  engine.setCrossfade(s.crossfadeSec)
  // F27 · Normalización
  engine.setNormalize(Boolean(s.normalize), s.normalizeLevel ?? 'normal')
  usePlayer.getState().setAutoplay(s.autoplay)
  // F27 · Volca los flags de comportamiento en las banderas del store
  runtimeFlags.avoidDuplicatesInQueue = Boolean(s.avoidDuplicatesInQueue)
  runtimeFlags.skipOnError = Boolean(s.skipOnError)
  runtimeFlags.progressiveSeek = Boolean(s.progressiveSeek)
  runtimeFlags.disableCrossfadeOnGapless = Boolean(s.disableCrossfadeOnGapless)
  runtimeFlags.disableAutoloadOnRepeatAll = Boolean(s.disableAutoloadOnRepeatAll)
  runtimeFlags.enableSimilarContent = Boolean(s.enableSimilarContent)
  runtimeFlags.shuffleFirstBeforeSimilar = Boolean(s.shuffleFirstBeforeSimilar)
  runtimeFlags.preloadMoreAt80Percent = Boolean(s.preloadMoreAt80Percent)
  runtimeFlags.persistentShuffle = Boolean(s.persistentShuffle)
}

function contrastForHex(hex: string): string {
  if (!hex.startsWith('#') || (hex.length !== 7 && hex.length !== 4)) return '#000'
  const full = hex.length === 4 ? '#' + hex.slice(1).split('').map((c) => c + c).join('') : hex
  const r = parseInt(full.slice(1, 3), 16) / 255
  const g = parseInt(full.slice(3, 5), 16) / 255
  const b = parseInt(full.slice(5, 7), 16) / 255
  const l = 0.299 * r + 0.587 * g + 0.114 * b
  return l > 0.62 ? '#000' : '#fff'
}

function setAccentVars(accent: string): void {
  const root = document.documentElement
  root.style.setProperty('--accent', accent)
  root.style.setProperty('--accent-hover', accent + 'dd')
  root.style.setProperty('--accent-press', accent + 'bb')
  root.style.setProperty('--accent-fg', contrastForHex(accent))
}

function applyTheme(s: AppSettings): void {
  document.documentElement.dataset.theme = s.theme
  // El ambientStore lee esto para decidir si el acento sigue a la carátula
  document.documentElement.dataset.accentMode = s.accentMode
  if (s.accentMode === 'fixed') setAccentVars(s.accent)
  else applyDynamicAccent()
}

/** Acento dinámico: sigue la carátula de la pista en reproducción. */
let dynamicWired = false
function applyDynamicAccent(): void {
  const current = usePlayer.getState().current()
  if (current?.thumbnailUrl) {
    void extractAccent(current.thumbnailUrl).then((c) => {
      if (c && useSettings.getState().settings.accentMode === 'dynamic') setAccentVars(c)
    })
  }
  if (!dynamicWired) {
    dynamicWired = true
    let lastUrl: string | undefined
    usePlayer.subscribe((state) => {
      const url = state.current()?.thumbnailUrl
      if (url === lastUrl) return
      lastUrl = url
      if (useSettings.getState().settings.accentMode !== 'dynamic' || !url) return
      void extractAccent(url).then((c) => {
        if (c && useSettings.getState().settings.accentMode === 'dynamic') setAccentVars(c)
      })
    })
  }
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  init: async () => {
    try {
      const settings = await window.api.settings.get()
      set({ settings, loaded: true })
      applyToEngine(settings)
      applyTheme(settings)
      // F27 · Restaura shuffle/repeat de la sesión anterior si el usuario lo pidió.
      if (settings.rememberShuffleRepeat) {
        const player = usePlayer.getState()
        if (typeof settings.lastRepeat === 'string' && settings.lastRepeat !== player.repeat) {
          usePlayer.setState({ repeat: settings.lastRepeat })
        }
        // shuffle solo se puede recuperar si ya hay cola (la persistente
        // se carga al final de player/store.ts). Si no hay cola aún, se aplicará
        // al arrancar una nueva vía `persistentShuffle`.
        if (settings.lastShuffle && !player.shuffle && player.queue.length > 1) {
          player.toggleShuffle()
        }
      }
    } catch {
      set({ loaded: true })
    }
    // Escucha cambios que vienen del main (ventana de ajustes del mini,
    // otros procesos, o llamadas directas a window.api.settings.set desde
    // fuera del store). Sin esto, el <html> del main no se re-tinta ni el
    // motor de audio adopta cambios de EQ/tempo/crossfade hechos por otros.
    window.api.settings.onChanged((s) => {
      const same = JSON.stringify(s) === JSON.stringify(get().settings)
      if (same) return
      set({ settings: s })
      applyToEngine(s)
      applyTheme(s)
    })
  },

  update: async (patch) => {
    const merged = { ...get().settings, ...patch }
    set({ settings: merged })
    applyToEngine(merged)
    applyTheme(merged)
    await window.api.settings.set(patch).catch(() => undefined)
  }
}))

// F27 · Expone la referencia al store para que `player/store.ts` pueda
// persistir shuffle/repeat sin importar el módulo (evita ciclos).
if (typeof window !== 'undefined') {
  ;(window as unknown as { __metrolistSettingsStore?: unknown }).__metrolistSettingsStore = {
    useSettings
  }
}
