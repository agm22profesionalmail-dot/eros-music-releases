import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'

/** Menú contextual global: cualquier componente lo abre con openContextMenu(). */

export interface MenuItem {
  label: string
  action?: () => void
  submenu?: MenuItem[]
  separator?: boolean
  disabled?: boolean
  /* F43 · Acción destructiva: se pinta en rojo para diferenciarla del resto. */
  danger?: boolean
}

interface MenuState {
  open: boolean
  x: number
  y: number
  items: MenuItem[]
  show: (x: number, y: number, items: MenuItem[]) => void
  hide: () => void
}

export const useContextMenu = create<MenuState>((set) => ({
  open: false,
  x: 0,
  y: 0,
  items: [],
  show: (x, y, items) => set({ open: true, x, y, items }),
  hide: () => set({ open: false })
}))

export function openContextMenu(e: React.MouseEvent, items: MenuItem[]): void {
  e.preventDefault()
  e.stopPropagation()
  useContextMenu.getState().show(e.clientX, e.clientY, items)
}

function MenuList({ items, onDone }: { items: MenuItem[]; onDone: () => void }): React.JSX.Element {
  const [subOpen, setSubOpen] = useState<number | null>(null)
  return (
    <>
      {items.map((item, i) =>
        item.separator ? (
          /* F43 · `<hr>` semántico + clase única (no compartida) para el estilo. */
          <hr key={i} className="context-menu-sep" />
        ) : (
          <div
            key={i}
            style={{ position: 'relative' }}
            onMouseEnter={() => setSubOpen(item.submenu ? i : null)}
          >
            <button
              /* F43 · `context-menu-item` para poder colgar variantes (danger) sin
                 depender del descendiente `button` genérico. */
              className={`context-menu-item${item.danger ? ' danger' : ''}`}
              disabled={item.disabled}
              onClick={() => {
                if (item.submenu) return
                item.action?.()
                onDone()
              }}
            >
              {item.label}
              {item.submenu && <span style={{ marginLeft: 'auto', opacity: 0.6 }}>▸</span>}
            </button>
            {item.submenu && subOpen === i && (
              <div
                className="context-menu"
                style={{ position: 'absolute', left: '100%', top: 0, maxHeight: 320, overflowY: 'auto' }}
              >
                <MenuList items={item.submenu} onDone={onDone} />
              </div>
            )}
          </div>
        )
      )}
    </>
  )
}

export function ContextMenuHost(): React.JSX.Element | null {
  const { open, x, y, items, hide } = useContextMenu()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (): void => hide()
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close, true)
    window.addEventListener('blur', close)
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') hide()
    }
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close, true)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open, hide])

  // Reposiciona si se sale de la ventana
  useEffect(() => {
    const el = ref.current
    if (!el || !open) return
    const rect = el.getBoundingClientRect()
    if (rect.right > window.innerWidth) el.style.left = `${x - rect.width}px`
    if (rect.bottom > window.innerHeight) el.style.top = `${Math.max(8, y - rect.height)}px`
  }, [open, x, y])

  if (!open) return null
  return (
    <div ref={ref} className="context-menu" style={{ left: x, top: y }}>
      <MenuList items={items} onDone={hide} />
    </div>
  )
}
