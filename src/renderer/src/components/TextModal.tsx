import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'

/**
 * Diálogo modal propio (window.prompt/confirm no existen en Electron).
 * - Texto:        askText({ title, placeholder, confirmLabel }).then(valor|null)
 * - Confirmación: askConfirm({ title, message, confirmLabel, danger }).then(bool)
 */

interface ModalState {
  open: boolean
  mode: 'text' | 'confirm'
  title: string
  /** Solo en mode='confirm': cuerpo explicativo */
  message: string
  /** Solo en mode='confirm': pinta el botón de confirmar como destructivo */
  danger: boolean
  placeholder: string
  confirmLabel: string
  initial: string
  resolve: ((value: string | null) => void) | null
  show: (opts: {
    mode?: 'text' | 'confirm'
    title: string
    message?: string
    danger?: boolean
    placeholder?: string
    confirmLabel?: string
    initial?: string
  }) => Promise<string | null>
  close: (value: string | null) => void
}

export const useTextModal = create<ModalState>((set, get) => ({
  open: false,
  mode: 'text',
  title: '',
  message: '',
  danger: false,
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
        mode: opts.mode ?? 'text',
        title: opts.title,
        message: opts.message ?? '',
        danger: opts.danger ?? false,
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
  return useTextModal.getState().show({ ...opts, mode: 'text' })
}

/** Confirmación sí/no. Resuelve `true` solo si el usuario confirma. */
export function askConfirm(opts: {
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
}): Promise<boolean> {
  return useTextModal
    .getState()
    .show({
      mode: 'confirm',
      title: opts.title,
      message: opts.message,
      confirmLabel: opts.confirmLabel ?? 'Confirmar',
      danger: opts.danger
    })
    .then((v) => v === 'ok')
}

export function TextModalHost(): React.JSX.Element | null {
  const { open, mode, title, message, danger, placeholder, confirmLabel, initial, close } =
    useTextModal()
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) {
      setValue(initial)
      setTimeout(() => {
        if (mode === 'text') inputRef.current?.focus()
        else confirmBtnRef.current?.focus()
      }, 50)
    }
  }, [open, initial, mode])

  if (!open) return null

  const confirm = (): void => {
    if (mode === 'confirm') {
      close('ok')
      return
    }
    const v = value.trim()
    close(v.length ? v : null)
  }

  return (
    <div
      className="text-modal-overlay"
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
        className="text-modal login-card"
        style={{ width: 380, padding: 28, gap: 14, textAlign: 'left' }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close(null)
        }}
      >
        <h1 style={{ fontSize: 20 }}>{title}</h1>
        {mode === 'confirm' ? (
          message && (
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.45 }}>
              {message}
            </p>
          )
        ) : (
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
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" style={{ padding: '10px 20px' }} onClick={() => close(null)}>
            Cancelar
          </button>
          <button
            ref={confirmBtnRef}
            className="btn btn-primary"
            style={{
              padding: '10px 20px',
              ...(mode === 'confirm' && danger
                ? { background: '#c0392b', color: '#fff' }
                : {})
            }}
            disabled={mode === 'text' && !value.trim()}
            onClick={confirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
