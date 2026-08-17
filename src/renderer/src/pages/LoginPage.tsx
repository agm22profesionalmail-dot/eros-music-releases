import { useAuth } from '../app/authStore'
import { Logo } from '../components/Logo'
import { useT } from '../app/i18n'

/**
 * Pantalla de inicio de sesión.
 *
 * F61 · `variant="onboarding"`: versión embebida en el último paso del
 * asistente de bienvenida — solo ofrece "Iniciar sesión con Google"
 * (`auth.openCookieLogin()`), sin la vinculación por móvil/device-code y sin
 * el encabezado con logo (el wizard ya pone el suyo). La LoginPage normal
 * (fuera del onboarding) conserva ambas opciones sin cambios.
 */
export function LoginPage({
  variant = 'default'
}: {
  variant?: 'default' | 'onboarding'
}): React.JSX.Element {
  const t = useT()
  const auth = useAuth((s) => s.state)
  const embedded = variant === 'onboarding'

  return (
    <div className="login-page">
      <div className="login-card">
        {!embedded && (
          <>
            <div style={{ margin: '0 auto' }}>
              <Logo size={56} />
            </div>
            <h1>ERO'S Music</h1>
          </>
        )}

        {auth.status === 'pendingDeviceCode' && auth.userCode ? (
          <>
            <p>
              {t('login.deviceIntro1')}{' '}
              <b style={{ color: 'var(--text-primary)' }}>
                {auth.verificationUrl ?? 'google.com/device'}
              </b>{' '}
              {t('login.deviceIntro2')}
            </p>
            <div className="device-code">{auth.userCode}</div>
            <p>{t('login.waiting')}</p>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </>
        ) : (
          <>
            {/* F61 · En el onboarding el copy de cierre lo pone StepLogin */}
            {!embedded && (
              <p>
                {t('login.pitch')}
              </p>
            )}
            {!embedded && (
              <button
                className="btn btn-primary"
                onClick={() => void window.api.auth.startDeviceCode()}
              >
                {t('login.linkPhone')}
              </button>
            )}
            <button
              className={`btn ${embedded ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => void window.api.auth.openCookieLogin()}
            >
              {t('login.googleSignIn')}
            </button>
            <p style={{ fontSize: 12, color: 'var(--text-subdued)' }}>
              {embedded ? t('onboarding.login.finePrint') : t('login.finePrint')}
            </p>
            {auth.status === 'error' && (
              <div className="error-banner">{t('login.error', { msg: auth.error ?? '' })}</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
