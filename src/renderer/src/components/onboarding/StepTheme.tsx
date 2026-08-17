import { useEffect, useRef } from 'react'
import { useSettings } from '../../app/settingsStore'
import { useT } from '../../app/i18n'
import { ThemePresetGrid } from '../ThemePresetGrid'
import { THEME_PRESETS } from '../../app/themePresets'

/**
 * F61 · Paso de tema: mismo grid de presets que Ajustes (componente compartido
 * ThemePresetGrid), pero SOLO como previsualización. Pulsar un swatch aplica
 * el tema en vivo vía settingsStore (el wizard y la app de fondo, visible tras
 * el blur, se repintan al momento), y al SALIR del paso — Siguiente, Atrás,
 * Saltar o cierre del wizard — el cleanup restaura el tema que el usuario
 * tenía al entrar. El cambio de verdad se hace en Ajustes → Apariencia →
 * Temas predefinidos. Coffee Cream ya es el default de usuarios nuevos (F60).
 */
export function StepTheme(): React.JSX.Element {
  const t = useT()
  const { settings, update } = useSettings()
  const activeName = THEME_PRESETS.find((p) => p.id === settings.themePreset)?.name

  // Tema del usuario AL ENTRAR al paso; el ref congela el valor del primer
  // render, así los clicks de previsualización no lo pisan.
  const original = useRef(settings.themePreset)
  useEffect(
    () => () => {
      const { settings: s, update: u } = useSettings.getState()
      if (s.themePreset !== original.current) void u({ themePreset: original.current })
    },
    []
  )

  return (
    <div className="onb-step onb-step-theme">
      <h1>{t('onboarding.theme.title')}</h1>
      <p className="onb-lead">{t('onboarding.theme.body')}</p>
      <ThemePresetGrid
        value={settings.themePreset}
        onChange={(id) => void update({ themePreset: id })}
      />
      <p className="onb-finePrint">
        {activeName
          ? `${t('settings.themes.active')} ${activeName}`
          : t('onboarding.theme.classic')}
        {' · '}
        {t('onboarding.theme.note')}
      </p>
    </div>
  )
}
