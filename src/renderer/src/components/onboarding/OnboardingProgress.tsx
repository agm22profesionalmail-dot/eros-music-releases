import { STEP_ORDER, type OnboardingStep } from '../../app/onboardingStore'
import { useT } from '../../app/i18n'

/**
 * F61 · Puntos de progreso del wizard. Solo pinta los pasos visibles del
 * recorrido actual (sin `done`, sin `language` al repetir desde Ajustes y sin
 * `login` si ya hay sesión iniciada).
 */
export function OnboardingProgress({
  step,
  visibleSteps
}: {
  step: OnboardingStep
  visibleSteps: OnboardingStep[]
}): React.JSX.Element {
  const t = useT()
  const idx = visibleSteps.indexOf(step)
  return (
    <div
      className="onb-progress"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={visibleSteps.length}
      aria-valuenow={idx + 1}
      aria-label={t('onboarding.progress', { n: idx + 1, total: visibleSteps.length })}
    >
      {visibleSteps.map((s) => {
        const pos = STEP_ORDER.indexOf(s)
        const cur = STEP_ORDER.indexOf(step)
        return (
          <span
            key={s}
            className={`onb-dot ${s === step ? 'active' : ''} ${pos < cur ? 'past' : ''}`}
            aria-hidden="true"
          />
        )
      })}
    </div>
  )
}
