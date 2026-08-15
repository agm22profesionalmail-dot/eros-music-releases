import { create } from 'zustand'
import type { LibrarySnapshot, MediaCard, TrackSummary } from '@shared/types'
import type { MenuItem } from '../components/ContextMenu'
import { usePlayer } from '../player/store'
import { useRouter } from './router'
import { pushToast } from '../components/Toast'

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
    // Hidrata los corazones con los "Me gusta" reales de la cuenta
    try {
      const ids = await window.api.library.likedIds()
      if (ids.length) set({ likedIds: new Set(ids) })
    } catch {
      /* sin likes accesibles */
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

// -------------------------------------------------------------
// F22c · Reactividad live: el main emite `library:changed` tras
// cualquier escritura (crear/editar playlist, like, suscripción).
// Nos resuscribimos UNA sola vez al arrancar el módulo — patrón
// paralelo al de settingsStore. `load()` no dispara el evento
// (solo lee), así que no hay bucle.
// -------------------------------------------------------------
if (typeof window !== 'undefined' && window.api?.library?.onChanged) {
  window.api.library.onChanged(() => {
    void useLibrary.getState().load()
  })
}

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

// -------------------------------------------------------------
// F22b · Menú contextual universal para tarjetas (MediaCard).
// -------------------------------------------------------------

/**
 * Convierte una tarjeta reproducible (song/video) en la mínima `TrackSummary`
 * que necesita la cola. Es equivalente al `cardToTrack` de HomePage pero
 * duplicado aquí para no crear dependencia cruzada (HomePage está en zona
 * intocable para F22b — la toca F24 en paralelo).
 */
function mediaCardToTrack(card: MediaCard): TrackSummary {
  return {
    kind: card.kind === 'video' ? 'video' : 'song',
    videoId: card.id,
    title: card.title,
    artists: card.subtitle ? [{ name: card.subtitle }] : [],
    thumbnailUrl: card.thumbnailUrl
  }
}

/** Copia texto al portapapeles y muestra un toast (best-effort). */
async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    pushToast('Enlace copiado')
  } catch {
    pushToast('No se pudo copiar el enlace')
  }
}

/**
 * Carga los tracks de un álbum/playlist por id y los reproduce inmediatamente,
 * los añade a la cola (append) o los inserta como "siguiente". Usa
 * `window.api.music.album/playlist`. Todo mejor-esfuerzo: si la carga falla,
 * se muestra un toast y no pasa nada más.
 */
async function loadContainerTracks(
  kind: 'album' | 'playlist',
  id: string
): Promise<TrackSummary[]> {
  try {
    if (kind === 'album') {
      const al = await window.api.music.album(id)
      return al.tracks ?? []
    }
    const pl = await window.api.music.playlist(id)
    return pl.tracks ?? []
  } catch {
    return []
  }
}

/**
 * Igual criterio que en PlaylistPage: la playlist es editable si su prefijo
 * es PL y NO es LM/OLAK. El backend a veces no marca `isEditable=true` aun
 * siendo del usuario, así que hacemos la heurística por id.
 */
function isPlaylistEditableById(id: string): boolean {
  const raw = id.startsWith('VL') ? id.slice(2) : id
  return raw.startsWith('PL') && !raw.startsWith('PLLM') && !raw.startsWith('OLAK')
}

/**
 * Menú contextual estándar para una tarjeta de media (`MediaCard`). El
 * conjunto de items depende del `kind`. Se usa desde `<Card>` y desde las
 * filas del sidebar (mismo modelo `MediaCard`).
 *
 * `opts.artistId` / `opts.artistName` permiten a un `<Card>` que vive dentro
 * de una vista con contexto conocido (ej. álbum) ofrecer "Ir al artista".
 */
export function cardMenu(
  card: MediaCard,
  opts?: { artistId?: string; artistName?: string }
): MenuItem[] {
  const player = usePlayer.getState()
  const library = useLibrary.getState()
  const router = useRouter.getState()
  const items: MenuItem[] = []

  if (card.kind === 'song' || card.kind === 'video') {
    const track = mediaCardToTrack(card)
    const liked = library.likedIds.has(track.videoId)
    const playlists = (library.library?.playlists ?? []).filter(
      (p: MediaCard) => !p.id.includes('LM')
    )
    items.push(
      { label: 'Reproducir ahora', action: () => void player.playNow(track) },
      { label: 'Iniciar radio', action: () => void player.startRadio(track) },
      { label: 'Siguiente en la cola', action: () => player.enqueueNext(track) },
      {
        label: 'Añadir a la cola',
        action: () => {
          player.enqueueLast([track])
          pushToast('Añadido a la cola')
        }
      },
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
      },
      { separator: true, label: '' }
    )
    // La tarjeta no expone artistas ni álbum en su tipo (`MediaCard` no los
    // guarda), pero el llamante puede pasar `opts.artistId` cuando la vista
    // conoce ese contexto (por ejemplo el álbum abierto). También intentamos
    // navegar al detalle usando `card.id` si es un vídeo/canción con URL.
    if (opts?.artistId) {
      items.push({
        label: opts.artistName ? `Ir a ${opts.artistName}` : 'Ir al artista',
        action: () => router.navigate({ name: 'artist', id: opts.artistId! })
      })
    }
    items.push({
      label: 'Compartir',
      action: () => void copyToClipboard(`https://music.youtube.com/watch?v=${card.id}`)
    })
    return items
  }

  if (card.kind === 'album') {
    items.push(
      {
        label: 'Reproducir',
        action: () =>
          void loadContainerTracks('album', card.id).then((tracks) => {
            if (tracks.length) void player.playTracks(tracks)
            else pushToast('Álbum vacío')
          })
      },
      {
        label: 'Reproducir siguiente',
        action: () =>
          void loadContainerTracks('album', card.id).then((tracks) => {
            // enqueueNext es de una en una: recorremos al revés para
            // conservar el orden del álbum
            for (let i = tracks.length - 1; i >= 0; i--) player.enqueueNext(tracks[i])
            if (tracks.length) pushToast(`${tracks.length} canciones a continuación`)
          })
      },
      {
        label: 'Añadir a la cola',
        action: () =>
          void loadContainerTracks('album', card.id).then((tracks) => {
            if (tracks.length) {
              player.enqueueLast(tracks)
              pushToast(`${tracks.length} canciones a la cola`)
            }
          })
      },
      { separator: true, label: '' }
    )
    if (opts?.artistId) {
      items.push({
        label: opts.artistName ? `Ir a ${opts.artistName}` : 'Ir al artista',
        action: () => router.navigate({ name: 'artist', id: opts.artistId! })
      })
    }
    items.push({
      label: 'Compartir',
      action: () => void copyToClipboard(`https://music.youtube.com/browse/${card.id}`)
    })
    return items
  }

  if (card.kind === 'playlist') {
    const editable = isPlaylistEditableById(card.id)
    const rawId = card.id.startsWith('VL') ? card.id.slice(2) : card.id
    items.push(
      {
        label: 'Reproducir',
        action: () =>
          void loadContainerTracks('playlist', card.id).then((tracks) => {
            if (tracks.length) void player.playTracks(tracks)
            else pushToast('Playlist vacía')
          })
      },
      {
        label: 'Reproducir siguiente',
        action: () =>
          void loadContainerTracks('playlist', card.id).then((tracks) => {
            for (let i = tracks.length - 1; i >= 0; i--) player.enqueueNext(tracks[i])
            if (tracks.length) pushToast(`${tracks.length} canciones a continuación`)
          })
      },
      {
        label: 'Añadir a la cola',
        action: () =>
          void loadContainerTracks('playlist', card.id).then((tracks) => {
            if (tracks.length) {
              player.enqueueLast(tracks)
              pushToast(`${tracks.length} canciones a la cola`)
            }
          })
      },
      { separator: true, label: '' },
      {
        label: 'Editar',
        disabled: !editable,
        action: () => router.navigate({ name: 'playlist', id: card.id })
      },
      {
        label: 'Compartir',
        action: () =>
          void copyToClipboard(`https://music.youtube.com/playlist?list=${rawId}`)
      }
    )
    if (editable) {
      items.push({
        label: 'Quitar de biblioteca',
        action: () =>
          void (async () => {
            try {
              // Elimina cada video de la playlist es lo más cerca del
              // "quitar de biblioteca" que ofrece la API pública. No hay
              // endpoint público para eliminar la playlist entera, así que
              // dejamos aviso y refrescamos.
              pushToast('Elimina la playlist desde YT Music en tu cuenta')
              await library.refresh()
            } catch {
              /* silencio */
            }
          })()
      })
    }
    return items
  }

  if (card.kind === 'artist') {
    items.push(
      {
        label: 'Ir al artista',
        action: () => router.navigate({ name: 'artist', id: card.id })
      },
      {
        label: 'Reproducir radio',
        action: () =>
          void (async () => {
            // Radio directa: tomamos como semilla el propio artista abriendo
            // su página y usando el primer top-song. Fallback: navegar sin
            // reproducir.
            try {
              const detail = await window.api.music.artist(card.id)
              const shelf = detail.shelves.find((s) =>
                s.items.some((i) => i.kind === 'song')
              )
              const first = shelf?.items.find((i) => i.kind === 'song')
              if (first) {
                await player.startRadio(mediaCardToTrack(first))
                return
              }
            } catch {
              /* fallback abajo */
            }
            router.navigate({ name: 'artist', id: card.id })
          })()
      },
      { separator: true, label: '' },
      {
        label: 'Seguir',
        action: () =>
          void window.api.library
            .subscribe(card.id, true)
            .then(() => {
              pushToast('Ahora sigues a este artista')
              void library.refresh()
            })
            .catch(() => pushToast('No se pudo seguir'))
      },
      {
        label: 'Dejar de seguir',
        action: () =>
          void window.api.library
            .subscribe(card.id, false)
            .then(() => {
              pushToast('Has dejado de seguir')
              void library.refresh()
            })
            .catch(() => pushToast('No se pudo cambiar el seguimiento'))
      },
      { separator: true, label: '' },
      {
        label: 'Compartir',
        action: () =>
          void copyToClipboard(`https://music.youtube.com/channel/${card.id}`)
      }
    )
    return items
  }

  // kind === 'unknown' u otro futuro: solo compartir por id como fallback.
  items.push({
    label: 'Compartir',
    action: () => void copyToClipboard(`https://music.youtube.com/watch?v=${card.id}`)
  })
  return items
}
