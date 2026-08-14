import { create } from 'zustand'
import type { LibrarySnapshot, MediaCard, TrackSummary } from '@shared/types'
import type { MenuItem } from '../components/ContextMenu'
import { usePlayer } from '../player/store'
import { useRouter } from './router'

/**
 * Estado global de la biblioteca del usuario + fábrica del menú contextual
 * de pista (compartido por todas las tablas y tarjetas).
 */

interface LibraryState {
  library: (LibrarySnapshot & { fromCache?: boolean }) | null
  likedIds: Set<string>
  load: () => Promise<void>
  refresh: () => Promise<void>
  toggleLike: (track: TrackSummary) => Promise<void>
  clear: () => void
}

export const useLibrary = create<LibraryState>((set, get) => ({
  library: null,
  likedIds: new Set<string>(),

  load: async () => {
    try {
      const lib = await window.api.music.library()
      set({ library: lib })
    } catch {
      /* sin sesión o sin red */
    }
  },

  refresh: async () => {
    try {
      const lib = await window.api.library.refresh()
      set({ library: lib })
    } catch {
      /* ignorar */
    }
  },

  toggleLike: async (track) => {
    const { likedIds } = get()
    const isLiked = likedIds.has(track.videoId)
    const next = new Set(likedIds)
    if (isLiked) next.delete(track.videoId)
    else next.add(track.videoId)
    set({ likedIds: next }) // optimista
    try {
      await window.api.library.rate(track.videoId, isLiked ? 'clear' : 'like')
    } catch {
      set({ likedIds }) // revierte
    }
  },

  clear: () => set({ library: null, likedIds: new Set() })
}))

/** Menú contextual estándar de una pista. */
export function trackMenu(track: TrackSummary, opts?: { playlistId?: string }): MenuItem[] {
  const player = usePlayer.getState()
  const library = useLibrary.getState()
  const router = useRouter.getState()
  const liked = library.likedIds.has(track.videoId)

  const playlists = (library.library?.playlists ?? []).filter(
    (p: MediaCard) => !p.id.includes('LM') // "Tus me gusta" no admite añadir directo
  )

  const items: MenuItem[] = [
    { label: 'Reproducir ahora', action: () => void player.playNow(track) },
    { label: 'Iniciar radio', action: () => void player.startRadio(track) },
    { label: 'Siguiente en la cola', action: () => player.enqueueNext(track) },
    { label: 'Añadir a la cola', action: () => player.enqueueLast([track]) },
    { separator: true, label: '' },
    {
      label: liked ? 'Quitar de Me gusta' : 'Me gusta',
      action: () => void library.toggleLike(track)
    },
    { label: 'Descargar', action: () => void window.api.downloads.add(track) },
    {
      label: 'Añadir a playlist',
      submenu: [
        {
          label: '+ Nueva playlist…',
          action: () => {
            void import('../components/TextModal').then(({ askText }) =>
              askText({
                title: 'Nueva playlist',
                placeholder: 'Nombre de la playlist',
                confirmLabel: 'Crear'
              }).then((title) => {
                if (title) {
                  void window.api.library
                    .playlistCreate(title, [track.videoId])
                    .then(() => library.refresh())
                }
              })
            )
          }
        },
        ...playlists.map((p) => ({
          label: p.title,
          action: () => void window.api.library.playlistAdd(p.id, [track.videoId])
        }))
      ]
    }
  ]

  if (opts?.playlistId) {
    items.push({
      label: 'Quitar de esta playlist',
      action: () =>
        void window.api.library
          .playlistRemove(opts.playlistId!, [track.videoId])
          .then(() => library.refresh())
    })
  }

  items.push({ separator: true, label: '' })
  const artist = track.artists.find((a) => a.id)
  if (artist?.id) {
    items.push({
      label: `Ir a ${artist.name}`,
      action: () => router.navigate({ name: 'artist', id: artist.id! })
    })
  }
  if (track.album?.id) {
    items.push({
      label: 'Ir al álbum',
      action: () => router.navigate({ name: 'album', id: track.album!.id! })
    })
  }

  return items
}
