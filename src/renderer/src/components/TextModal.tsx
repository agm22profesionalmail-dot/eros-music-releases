import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'

/**
 * Diálogo modal de texto propio (window.prompt no existe en Electron).
 * Uso: askText({ title, placeholder, confirmLabel }).then(valor|null)
 */

interface ModalState {
  open: boolean
  title: string
  placeholder: string
  confirmLabel: string
  initial: string
  resolve: ((value: string | null) => void) | null
  show: (opts: {
    title: string
    placeholder?: string
    confirmLabel?: string
    initial?: string
  }) => Promise<string | null>
  close: (value: string | null) => void
}

export const useTextModal = create<ModalState>((set, get) => ({
  open: false,
  title: '',
  placeholder: '',
  confirmLabel: 'Crear',
  initial: '',
  resolve: null,

  show: (opts) =>
    new Promise<string | null>((resolve) => {
      // Si había uno abierto, ciérralo como cancelado
      get().resolve?.(null)
      set({
        open: true,
        title: opts.title,
        placeholder: opts.placeholder ?? '',
        confirmLabel: opts.confirmLabel ?? 'Crear',
        initial: opts.initial ?? '',
        resolve
      })
    }),

  close: (value) => {
    get().resolve?.(value)
    set({ open: false, resolve: null })
  }
}))

export function askText(opts: {
  title: string
  placeholder?: string
  confirmLabel?: string
  initial?: string
}): Promise<string | null> {
  return useTextModal.getState().show(opts)
}

export function TextModalHost(): React.JSX.Element | null {
  const { open, title, placeholder, confirmLabel, initial, close } = useTextModal()
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setValue(initial)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open, initial])

  if (!open) return null

  const confirm = (): void => {
    const v = value.trim()
    close(v.length ? v : null)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 2000
      }}
      onClick={() => close(null)}
    >
      <div
        className="login-card"
        style={{ width: 380, padding: 28, gap: 14, textAlign: 'left' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h1 style={{ fontSize: 20 }}>{title}</h1>
        <input
          ref={inputRef}
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirm()
            if (e.key === 'Escape') close(null)
          }}
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--divider)',
            borderRadius: 6,
            padding: '12px 14px',
            color: 'var(--text-primary)',
            fontSize: 15,
            outline: 'none'
          }}
        />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" style={{ padding: '10px 20px' }} onClick={() => close(null)}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            style={{ padding: '10px 20px' }}
            disabled={!value.trim()}
            onClick={confirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
