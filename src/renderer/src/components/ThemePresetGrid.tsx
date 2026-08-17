import { THEME_PRESETS } from '../app/themePresets'
import { useT } from '../app/i18n'
import { CheckIcon } from './Icons'

/**
 * F61 · Grid de swatches de temas predefinidos (F36), extraído de SettingsPage
 * para compartirlo con el paso `theme` del onboarding. Mismo look exacto:
 * degradado del preset, borde activo y check con contraste según el modo.
 *
 * `onChange` recibe el id del preset pulsado, o `'none'` si se vuelve a pulsar
 * el activo (toggle, como en Ajustes).
 */
export function ThemePresetGrid({
  value,
  onChange
}: {
  value: string
  onChange: (id: string) => void
}): React.JSX.Element {
  const t = useT()
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {THEME_PRESETS.map((p) => {
        const active = value === p.id
        return (
          <button
            key={p.id}
            title={p.name}
            aria-label={t('settings.themes.themeAria', { name: p.name })}
            aria-pressed={active}
            onClick={() => onChange(active ? 'none' : p.id)}
            style={{
              width: 64,
              height: 40,
              borderRadius: 10,
              background: `linear-gradient(135deg, ${p.from} 0%, ${p.to} 100%)`,
              border: active ? '3px solid var(--text-primary)' : '3px solid var(--divider)',
              boxShadow: active ? '0 0 0 2px var(--accent)' : 'none',
              transition: 'border-color 0.15s, box-shadow 0.15s',
              position: 'relative'
            }}
          >
            {active && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'grid',
                  placeItems: 'center',
                  color: p.mode === 'light' ? '#161616' : '#ffffff'
                }}
              >
                <CheckIcon size={16} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
