import { useEffect } from 'react'
import { create } from 'zustand'

/**
 * Toast global mínimo: aviso breve en la esquina inferior, sin dependencias.
 * Uso: `pushToast('Enlace copiado')` desde cualquier componente. El host se
 * monta una vez en `App.tsx`.
 */

interface ToastItem {
  id: number
  text: string
  /** Duración en ms; por defecto 2000. */
  ms: number
}

interface ToastState {
  items: ToastItem[]
  push: (text: string, ms?: number) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToast = create<ToastState>((set) => ({
  items: [],
  push: (text, ms = 2000) => {
    const id = nextId++
    set((s) => ({ items: [...s.items, { id, text, ms }] }))
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) }))
}))

/** Atajo: `pushToast('Enlace copiado')`. */
export function pushToast(text: string, ms?: number): void {
  useToast.getState().push(text, ms)
}

/** Un solo toast — se auto-descarta pasado su `ms`. */
function Toast({ item }: { item: ToastItem }): React.JSX.Element {
  const dismiss = useToast((s) => s.dismiss)
  useEffect(() => {
    const t = setTimeout(() => dismiss(item.id), item.ms)
    return () => clearTimeout(t)
  }, [item.id, item.ms, dismiss])
  return (
    <div className="toast" role="status" onClick={() => dismiss(item.id)}>
      {item.text}
    </div>
  )
}

export function ToastHost(): React.JSX.Element | null {
  const items = useToast((s) => s.items)
  if (!items.length) return null
  return (
    <div className="toast-host" aria-live="polite">
      {items.map((it) => (
        <Toast key={it.id} item={it} />
      ))}
    </div>
  )
}
