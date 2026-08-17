import { create } from 'zustand'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types'
import { engine } from '../player/engine'
import { usePlayer, runtimeFlags } from '../player/store'
import { extractAccent } from './artworkColor'
import { resolveLocale, useI18n } from './i18n'
import { applyPresetToDom, getThemePreset } from './themePresets'

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
  // F70 · EQ multi-banda: aplica el modo y las ganancias correspondientes
  const eqGains = s.eqMode === '31' ? s.eqGains31 : s.eqMode === '15' ? s.eqGains15 : s.eqGains
  if (engine.eqBandCount !== eqGains.length) {
    engine.setEqMode(s.eqMode ?? '10', eqGains)
  } else {
    engine.setEq(eqGains)
  }
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

/** Canal sRGB (0-1) a espacio lineal, para luminancia relativa WCAG. */
function toLinear(c: number): number {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/**
 * F62 · Color de texto legible sobre `hex`, por contraste WCAG real.
 * La heurística anterior (`0.299r+0.587g+0.114b > 0.62`) ignoraba la
 * corrección gamma y elegía blanco en colores medios donde el negro contrasta
 * mucho más — con el acento caramelo #c98f55, negro da 7.5:1 y blanco 2.8:1.
 * El punto donde ambos empatan en luminancia relativa es 0.179.
 */
function contrastForHex(hex: string): string {
  if (!hex.startsWith('#') || (hex.length !== 7 && hex.length !== 4)) return '#000'
  const full = hex.length === 4 ? '#' + hex.slice(1).split('').map((c) => c + c).join('') : hex
  const r = parseInt(full.slice(1, 3), 16) / 255
  const g = parseInt(full.slice(3, 5), 16) / 255
  const b = parseInt(full.slice(5, 7), 16) / 255
  const lum = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  return lum > 0.179 ? '#000' : '#fff'
}

function setAccentVars(accent: string): void {
  const root = document.documentElement
  root.style.setProperty('--accent', accent)
  root.style.setProperty('--accent-hover', accent + 'dd')
  root.style.setProperty('--accent-press', accent + 'bb')
  root.style.setProperty('--accent-fg', contrastForHex(accent))
}

function applyTheme(s: AppSettings): void {
  // F36 · Preset de colores fijos: si hay uno activo pinta su paleta y fuerza
  // el data-theme base de su modo (para que las reglas CSS claras/oscuras
  // acompañen). Sin preset, se limpia y manda el tema clásico.
  const presetMode = applyPresetToDom(getThemePreset(s.themePreset))
  document.documentElement.dataset.theme = presetMode ?? s.theme
  // El ambientStore lee esto para decidir si el acento sigue a la carátula
  document.documentElement.dataset.accentMode = s.accentMode
  if (s.accentMode === 'fixed') setAccentVars(s.accent)
  else applyDynamicAccent()
  // F36 · Re-tinta el ambiente AHORA: al activar un preset hay que retirar el
  // tinte de carátula ya pintado (si no, queda pegado hasta el siguiente
  // cambio de pista); al desactivarlo, se restaura de inmediato.
  void import('./ambientStore')
    .then(({ useAmbient }) => {
      const amb = useAmbient.getState()
      amb.setEnabled(amb.enabled)
    })
    .catch(() => undefined)
}

/** F34 · Aplica el idioma de la UI al store i18n. */
function applyLocale(s: AppSettings): void {
  const locale = resolveLocale(s.uiLanguage)
  useI18n.getState().setLocale(locale)
  // Refleja en <html lang> para lectores de pantalla y CSS.
  try {
    document.documentElement.lang = locale
  } catch {
    /* jsdom / entornos sin document */
  }
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
      applyLocale(settings)
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
      applyLocale(s)
    })
  },

  update: async (patch) => {
    const merged = { ...get().settings, ...patch }
    set({ settings: merged })
    applyToEngine(merged)
    applyTheme(merged)
    applyLocale(merged)
    await window.api.settings.set(patch).catch(() => undefined)
  }
}))

// F27 · Expone la referencia al store para que `player/store.ts` pueda
// persistir shuffle/repeat sin importar el módulo (evita ciclos).
if (typeof window !== 'undefined') {
  ;(window as unknown as { __erosMusicSettingsStore?: unknown }).__erosMusicSettingsStore = {
    useSettings
  }
}
