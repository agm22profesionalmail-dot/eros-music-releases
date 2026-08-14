import { create } from 'zustand'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types'
import { engine } from '../player/engine'
import { usePlayer } from '../player/store'

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

function applyTheme(s: AppSettings): void {
  const root = document.documentElement
  root.dataset.theme = s.theme
  root.style.setProperty('--accent', s.accent)
  // Variantes derivadas del acento
  root.style.setProperty('--accent-hover', s.accent + 'dd')
  root.style.setProperty('--accent-press', s.accent + 'bb')
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
