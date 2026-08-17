import { useUpdater } from '../app/updaterStore'
import { useT } from '../app/i18n'

/**
 * F67 · Banner de actualización — no modal, persistente.
 *
 * No reutiliza el sistema Toast (un toast se auto-descarta a los ~2 s; este
 * aviso debe quedarse hasta que el usuario actualice o lo cierre), pero sí su
 * lenguaje visual: tarjeta flotante sobre la barra de reproducción, en la
 * esquina inferior derecha para no pisar los toasts centrados (`.toast-host`).
 *
 * Estados que pinta (los demás no tienen UI):
 *  - available   → título + versión + "Actualizar ahora" / "Ahora no"
 *  - downloading → barra de progreso con porcentaje, sin botones (no cancelable)
 *  - downloaded  → "Instalando, la app se reiniciará…" (dura un instante:
 *                  el store encadena installNow() automáticamente)
 *  - error       → fallo de DESCARGA (los de comprobación nunca llegan aquí:
 *                  automáticos se silencian en el main, manuales van a toast)
 */
export function UpdateBanner(): React.JSX.Element | null {
  const t = useT()
  const state = useUpdater((s) => s.state)
  const version = useUpdater((s) => s.version)
  const progress = useUpdater((s) => s.progress)
  const startDownload = useUpdater((s) => s.startDownload)
  const dismiss = useUpdater((s) => s.dismiss)

  if (state === 'idle' || state === 'checking') return null

  const pct = Math.min(100, Math.max(0, Math.round(progress)))

  return (
    <div className="update-banner" role="status" aria-live="polite">
      {state === 'available' && (
        <>
          <div className="update-banner-text">
            <strong>{t('update.available.title')}</strong>
            <span>{t('update.available.body', { version: version ?? '' })}</span>
          </div>
          <div className="update-banner-actions">
            <button className="btn btn-secondary" onClick={dismiss}>
              {t('update.available.dismiss')}
            </button>
            <button className="btn btn-primary" onClick={startDownload}>
              {t('update.available.cta')}
            </button>
          </div>
        </>
      )}

      {state === 'downloading' && (
        <div className="update-banner-text">
          <span>{t('update.downloading', { percent: pct })}</span>
          <div className="update-banner-progress">
            <div style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {state === 'downloaded' && (
        <div className="update-banner-text">
          <span>{t('update.installing')}</span>
        </div>
      )}

      {state === 'error' && (
        <>
          <div className="update-banner-text">
            <span>{t('update.downloadError')}</span>
          </div>
          <div className="update-banner-actions">
            <button className="btn btn-secondary" onClick={dismiss}>
              {t('update.available.dismiss')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
