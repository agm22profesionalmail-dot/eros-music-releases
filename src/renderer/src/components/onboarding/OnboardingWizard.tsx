import { useMemo } from 'react'
import { STEP_ORDER, useOnboarding, type OnboardingStep } from '../../app/onboardingStore'
import { useAuth } from '../../app/authStore'
import { useT } from '../../app/i18n'
import { OnboardingProgress } from './OnboardingProgress'
import { StepLanguage } from './StepLanguage'
import { StepWelcome } from './StepWelcome'
import { StepTour } from './StepTour'
import { StepTheme } from './StepTheme'
import { StepLife } from './StepLife'
import { StepLogin } from './StepLogin'

/**
 * F61 · Shell del asistente de bienvenida: overlay modal centrado con blur
 * sobre la app visible detrás (no splash a pantalla completa), tarjeta con
 * progreso, cuerpo del paso y footer Atrás/Siguiente/Saltar.
 *
 * Reglas del footer:
 *  - `language`: sin botones — la propia elección de idioma avanza. Tampoco
 *    hay "Saltar": el idioma es la primera decisión, siempre.
 *  - `login`: los CTA viven dentro del paso (Google / "Continuar sin cuenta"),
 *    el footer solo ofrece Atrás y Saltar.
 *  - resto: Atrás (salvo primer paso), Siguiente y "Saltar introducción".
 */
export function OnboardingWizard(): React.JSX.Element {
  const t = useT()
  const step = useOnboarding((s) => s.step)
  const fromSettings = useOnboarding((s) => s.fromSettings)
  const next = useOnboarding((s) => s.next)
  const back = useOnboarding((s) => s.back)
  const skip = useOnboarding((s) => s.skip)
  const signedIn = useAuth((s) => s.state.status === 'signedIn')

  const visibleSteps = useMemo(
    () =>
      STEP_ORDER.filter((s) => {
        if (s === 'done') return false
        if (s === 'language' && fromSettings) return false
        if (s === 'login' && signedIn) return false
        return true
      }),
    [fromSettings, signedIn]
  )

  const firstStep: OnboardingStep = visibleSteps[0] ?? 'welcome'
  const isFirst = step === firstStep
  const showFooterNav = step !== 'language'
  const showNext = showFooterNav && step !== 'login'

  return (
    <div className="onb-overlay" role="dialog" aria-modal="true" aria-label={t('onboarding.aria')}>
      <div className="onb-card">
        <OnboardingProgress step={step} visibleSteps={visibleSteps} />

        <div className="onb-body" key={step}>
          {step === 'language' && <StepLanguage />}
          {step === 'welcome' && <StepWelcome />}
          {step === 'tour' && <StepTour />}
          {step === 'theme' && <StepTheme />}
          {step === 'life' && <StepLife />}
          {step === 'login' && <StepLogin />}
        </div>

        {showFooterNav && (
          <footer className="onb-footer">
            <button className="onb-skip" onClick={() => void skip()}>
              {t('onboarding.skip')}
            </button>
            <div className="onb-footer-nav">
              {!isFirst && (
                <button className="btn btn-secondary" onClick={back}>
                  {t('onboarding.back')}
                </button>
              )}
              {showNext && (
                <button className="btn btn-primary" onClick={next}>
                  {step === 'life' && signedIn
                    ? t('onboarding.finish')
                    : t('onboarding.next')}
                </button>
              )}
            </div>
          </footer>
        )}
      </div>
    </div>
  )
}
