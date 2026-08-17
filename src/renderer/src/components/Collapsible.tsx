import { useState } from 'react'
import { ChevronRightIcon } from './Icons'

/**
 * F60 · Sección plegable reutilizable. Estado local, sin persistencia —
 * arranca siempre cerrada por defecto salvo que se pida lo contrario con
 * `defaultOpen`. Header clicable con `aria-expanded` + chevron animado.
 */
interface CollapsibleProps {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}

export function Collapsible({ title, defaultOpen = false, children }: CollapsibleProps): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`collapsible ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="collapsible-header"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronRightIcon size={16} className="collapsible-chevron" />
        <span>{title}</span>
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  )
}
