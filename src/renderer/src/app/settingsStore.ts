import { create } from 'zustand'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types'
import { engine } from '../player/engine'
import { usePlayer } from '../player/store'
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
  usePlayer.getState().setAutoplay(s.autoplay)
}

function setAccentVars(accent: string): void {
  const root = document.documentElement
  root.style.setProperty('--accent', accent)
  root.style.setProperty('--accent-hover', accent + 'dd')
  root.style.setProperty('--accent-press', accent + 'bb')
}

function applyTheme(s: AppSettings): void {
  document.documentElement.dataset.theme = s.theme
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
    } catch {
      set({ loaded: true })
    }
  },

  update: async (patch) => {
    const merged = { ...get().settings, ...patch }
    set({ settings: merged })
    applyToEngine(merged)
    applyTheme(merged)
    await window.api.settings.set(patch).catch(() => undefined)
  }
}))
