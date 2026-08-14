import { useAuth } from '../app/authStore'
import { Logo } from '../components/Logo'

export function LoginPage(): React.JSX.Element {
  const auth = useAuth((s) => s.state)

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ margin: '0 auto' }}>
          <Logo size={56} />
        </div>
        <h1>Metrolist PC</h1>

        {auth.status === 'pendingDeviceCode' && auth.userCode ? (
          <>
            <p>
              En tu móvil (o cualquier navegador) abre{' '}
              <b style={{ color: 'var(--text-primary)' }}>
                {auth.verificationUrl ?? 'google.com/device'}
              </b>{' '}
              e introduce este código:
            </p>
            <div className="device-code">{auth.userCode}</div>
            <p>Esperando confirmación…</p>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </>
        ) : (
          <>
            <p>
              Vincula tu cuenta de YouTube Music para ver tu biblioteca, tus playlists y tus
              me&nbsp;gusta — igual que en Metrolist del móvil.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => void window.api.auth.startDeviceCode()}
            >
              Vincular con el móvil
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => void window.api.auth.openCookieLogin()}
            >
              Iniciar sesión con Google
            </button>
            <p style={{ fontSize: 12, color: 'var(--text-subdued)' }}>
              «Vincular con el móvil» muestra un código que apruebas desde el teléfono.
              «Iniciar sesión con Google» abre la página real de Google en una ventana segura;
              tus credenciales nunca pasan por esta app.
            </p>
            {auth.status === 'error' && (
              <div className="error-banner">Error de inicio de sesión: {auth.error}</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
