import { useSettings } from '../../app/settingsStore'
import { useOnboarding } from '../../app/onboardingStore'
import { Logo } from '../Logo'

/**
 * F61 · Primer paso, siempre: elegir idioma antes que cualquier otra cosa.
 * Sin "Atrás" ni "Saltar" (los oculta el shell). La elección se persiste al
 * momento vía settingsStore (que ya sincroniza useI18n), así que el resto del
 * wizard —y la app entera— cambia de idioma en vivo y la elección sobrevive
 * aunque se cierre la app a mitad del tutorial.
 *
 * El copy de este paso es deliberadamente bilingüe: aún no sabemos el idioma.
 */
export function StepLanguage(): React.JSX.Element {
  const update = useSettings((s) => s.update)
  const next = useOnboarding((s) => s.next)

  const choose = (lang: 'es' | 'en'): void => {
    void update({ uiLanguage: lang })
    next()
  }

  return (
    <div className="onb-step onb-step-language">
      <div className="onb-logo">
        <Logo size={64} />
      </div>
      <h1>ERO'S Music</h1>
      <p className="onb-lead">
        Elige tu idioma · <span lang="en">Choose your language</span>
      </p>
      <div className="onb-language-options">
        <button className="btn btn-primary" onClick={() => choose('es')}>
          Español
        </button>
        <button className="btn btn-primary" lang="en" onClick={() => choose('en')}>
          English
        </button>
      </div>
      <p className="onb-finePrint">
        Podrás cambiarlo en Ajustes · <span lang="en">You can change it later in Settings</span>
      </p>
    </div>
  )
}
