import { create } from 'zustand'
import type { AuthState } from '@shared/types'

interface AuthStore {
  state: AuthState
  init: () => void
}

export const useAuth = create<AuthStore>((set) => ({
  state: { status: 'signedOut' },
  init: () => {
    void window.api.auth.getState().then((state) => set({ state }))
    window.api.auth.onStateChanged((state) => set({ state }))
  }
}))

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
