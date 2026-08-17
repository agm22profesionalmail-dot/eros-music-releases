import type { AppSettings } from '@shared/types'
import { applyPresetToDom, getThemePreset } from './themePresets'

/**
 * Aplica tema + acento fijo al DOM. Compartido por las ventanas secundarias
 * (mini-player, ajustes del mini) que no cargan el settingsStore completo
 * porque este arrastra el motor de audio.
 */
export function applyThemeDom(s: AppSettings): void {
  const root = document.documentElement
  // F36 · el preset de colores fijos también viste al mini-player
  const presetMode = applyPresetToDom(getThemePreset(s.themePreset))
  root.dataset.theme = presetMode ?? s.theme
  if (s.accentMode === 'fixed') {
    root.style.setProperty('--accent', s.accent)
    root.style.setProperty('--accent-hover', s.accent + 'dd')
  }
}
