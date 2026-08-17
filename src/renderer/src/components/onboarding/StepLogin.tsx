import { useEffect } from 'react'
import { LoginPage } from '../../pages/LoginPage'
import { useAuth } from '../../app/authStore'
import { useOnboarding } from '../../app/onboardingStore'
import { useT } from '../../app/i18n'

/**
 * F61 · Último paso: cierre natural del tour. Envuelve el `LoginPage`
 * existente en su variante `onboarding` (solo Google, sin device-code — fuera
 * del wizard LoginPage conserva ambas opciones). Si el login se completa
 * (`auth.status === 'signedIn'`), el wizard termina solo y `HomePage` hace su
 * carga real de biblioteca con el LoadingSpinner. "Continuar sin cuenta"
 * cierra el onboarding igualmente: el tour nunca dependió de la cuenta.
 */
export function StepLogin(): React.JSX.Element {
  const t = useT()
  const finish = useOnboarding((s) => s.finish)
  const signedIn = useAuth((s) => s.state.status === 'signedIn')

  useEffect(() => {
    if (signedIn) void finish()
  }, [signedIn, finish])

  return (
    <div className="onb-step onb-step-login">
      <h1>{t('onboarding.login.title')}</h1>
      <p className="onb-lead">{t('onboarding.login.body')}</p>
      <LoginPage variant="onboarding" />
      <button className="onb-login-guest" onClick={() => void finish()}>
        {t('onboarding.login.noAccount')}
      </button>
    </div>
  )
}
