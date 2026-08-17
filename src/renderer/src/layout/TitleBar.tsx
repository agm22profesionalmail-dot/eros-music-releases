import { CloseIcon, MaximizeIcon, MinimizeIcon } from '../components/Icons'
import { Logo } from '../components/Logo'
import { useT } from '../app/i18n'

export function TitleBar(): React.JSX.Element {
  const t = useT()
  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <Logo size={18} />
        ERO'S Music
      </div>
      <div className="titlebar-controls">
        <button
          className="titlebar-btn"
          aria-label={t('titlebar.minimize')}
          onClick={() => void window.api.win.minimize()}
        >
          <MinimizeIcon size={15} />
        </button>
        <button
          className="titlebar-btn"
          aria-label={t('titlebar.maximize')}
          onClick={() => void window.api.win.maximize()}
        >
          <MaximizeIcon size={14} />
        </button>
        <button
          className="titlebar-btn close"
          aria-label={t('btn.close')}
          onClick={() => void window.api.win.close()}
        >
          <CloseIcon size={15} />
        </button>
      </div>
    </header>
  )
}
