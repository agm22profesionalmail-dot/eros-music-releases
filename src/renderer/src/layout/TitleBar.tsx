import { CloseIcon, MaximizeIcon, MinimizeIcon } from '../components/Icons'
import { Logo } from '../components/Logo'

export function TitleBar(): React.JSX.Element {
  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <Logo size={18} />
        Metrolist
      </div>
      <div className="titlebar-controls">
        <button
          className="titlebar-btn"
          aria-label="Minimizar"
          onClick={() => void window.api.win.minimize()}
        >
          <MinimizeIcon size={15} />
        </button>
        <button
          className="titlebar-btn"
          aria-label="Maximizar"
          onClick={() => void window.api.win.maximize()}
        >
          <MaximizeIcon size={14} />
        </button>
        <button
          className="titlebar-btn close"
          aria-label="Cerrar"
          onClick={() => void window.api.win.close()}
        >
          <CloseIcon size={15} />
        </button>
      </div>
    </header>
  )
}
