import { create } from 'zustand'
import type { Shelf } from '@shared/types'

/**
 * F88 · Caché de la Home: las estanterías se cargan una vez y se reutilizan
 * al volver a la página. Un `refresh()` fuerza la recarga (por ejemplo tras
 * crear/borrar playlists). La espiral tiene su propia caché interna en
 * HomeSpiral.tsx.
 */
interface HomeStore {
  shelves: Shelf[] | null
  error: string | null
  /** true solo durante la primera carga (shelves === null). */
  loading: boolean
  /** Carga shelves si no están en caché; no hace nada si ya se cargaron. */
  fetchIfNeeded: () => void
  /** Fuerza recarga (tras cambio de biblioteca, etc.). */
  refresh: () => void
}

export const useHome = create<HomeStore>((set, get) => ({
  shelves: null,
  error: null,
  loading: false,

  fetchIfNeeded: () => {
    const { shelves, loading } = get()
    if (shelves !== null || loading) return
    set({ loading: true, error: null })
    void window.api.music
      .home()
      .then((data) => set({ shelves: data, loading: false }))
      .catch((err) => set({ error: String(err?.message ?? err), loading: false }))
  },

  refresh: () => {
    set({ loading: true, error: null })
    void window.api.music
      .home()
      .then((data) => set({ shelves: data, loading: false }))
      .catch((err) => set({ error: String(err?.message ?? err), loading: false }))
  }
}))
