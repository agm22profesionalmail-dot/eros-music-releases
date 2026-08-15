import { create } from 'zustand'

/**
 * Router mínimo con pila de historial (atrás/adelante como Spotify).
 */

export type Route =
  | { name: 'home' }
  | { name: 'search'; query?: string }
  | { name: 'library' }
  | { name: 'playlist'; id: string }
  | { name: 'album'; id: string }
  | { name: 'artist'; id: string }
  | { name: 'lyrics' }
  | { name: 'visualizer' }
  | { name: 'settings' }
  | { name: 'profile' }
  | { name: 'recap' }

interface RouterState {
  stack: Route[]
  pos: number
  route: () => Route
  navigate: (route: Route) => void
  back: () => void
  forward: () => void
  canBack: () => boolean
  canForward: () => boolean
}

export const useRouter = create<RouterState>((set, get) => ({
  stack: [{ name: 'home' }],
  pos: 0,

  route: () => {
    const { stack, pos } = get()
    return stack[pos]
  },

  navigate: (route) => {
    const { stack, pos } = get()
    const current = stack[pos]
    if (JSON.stringify(current) === JSON.stringify(route)) return
    const newStack = [...stack.slice(0, pos + 1), route]
    set({ stack: newStack, pos: newStack.length - 1 })
  },

  back: () => {
    const { pos } = get()
    if (pos > 0) set({ pos: pos - 1 })
  },

  forward: () => {
    const { stack, pos } = get()
    if (pos < stack.length - 1) set({ pos: pos + 1 })
  },

  canBack: () => get().pos > 0,
  canForward: () => get().pos < get().stack.length - 1
}))
