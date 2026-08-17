import { useT } from '../../app/i18n'
import { Logo } from '../Logo'
import { onboardingDemo } from '../../data/onboardingDemoData'

/**
 * F61 · Bienvenida: logo, saludo y —si la muestra está capturada— un pequeño
 * mosaico de carátulas reales de fondo para que la primera impresión no sea
 * una pantalla vacía.
 */
export function StepWelcome(): React.JSX.Element {
  const t = useT()
  const covers = [...onboardingDemo.likedTracks, ...onboardingDemo.playlistTracks]
    .map((tr) => tr.thumbnailUrl)
    .filter((u): u is string => Boolean(u))
    .slice(0, 6)

  return (
    <div className="onb-step onb-step-welcome">
      {covers.length > 0 && (
        <div className="onb-cover-mosaic" aria-hidden="true">
          {covers.map((url, i) => (
            <img key={url} src={url} alt="" style={{ ['--i' as string]: i }} />
          ))}
        </div>
      )}
      <div className="onb-logo">
        <Logo size={72} />
      </div>
      <h1>{t('onboarding.welcome.title')}</h1>
      <p className="onb-lead">{t('onboarding.welcome.body')}</p>
      <p className="onb-finePrint">{t('onboarding.welcome.hint')}</p>
    </div>
  )
}
