import { BrowserWindow } from 'electron'
import { sessionManager } from './session'
import { getLibrary } from './api'
import {
  cacheLibrarySection,
  readLibrarySection,
  recordPlay,
  readHistory,
  setPlaylistOverride,
  getPlaylistOverride
} from '../db'
import {
  IPC,
  type LibrarySnapshot,
  type PlaylistEditPatch,
  type PlaylistOverride,
  type TrackSummary
} from '@shared/types'

/**
 * Notifica a todas las ventanas que la biblioteca cambió tras una escritura
 * (crear/editar/borrar playlist, like, suscripción). El renderer se resuscribe
 * a `library.onChanged` y dispara `useLibrary.load()` para refrescar la UI sin
 * intervención del usuario. Es un aviso — no espera a que `refreshLibrary()`
 * termine su red porque `load()` ya lee la caché SQLite recién actualizada.
 */
function notifyLibraryChanged(reason: string): void {
  for (const w of BrowserWindow.getAllWindows()) {
    try {
      w.webContents.send(IPC.LIB_CHANGED, { reason })
    } catch {
      /* ventana cerrándose */
    }
  }
}

/**
 * Biblioteca con caché: sirve al instante la última instantánea guardada en
 * SQLite y refresca de la red en segundo plano. Las escrituras (me gusta,
 * playlists, suscripciones) van directas a la cuenta vía youtubei.js y
 * invalidan la caché.
 */

const SECTION = 'library'

export interface LibraryResult extends LibrarySnapshot {
  fromCache: boolean
  updatedAt: number
}

export async function getLibraryCached(forceRefresh = false): Promise<LibraryResult> {
  const cached = readLibrarySection<LibrarySnapshot>(SECTION)
  const cachedHasContent =
    cached &&
    (cached.data.playlists?.length ||
      cached.data.albums?.length ||
      cached.data.artists?.length ||
      cached.data.songs?.length)
  if (cached && cachedHasContent && !forceRefresh) {
    // Refresco en segundo plano sin bloquear la respuesta
    void refreshLibrary().catch(() => undefined)
    return { ...cached.data, fromCache: true, updatedAt: cached.updatedAt }
  }
  // Sin caché o caché vacía (p. ej. guardada por un fallo antiguo): refresco directo
  return refreshLibrary()
}

export async function refreshLibrary(): Promise<LibraryResult> {
  const fresh = await getLibrary()
  // No machacar una caché buena con una instantánea vacía (fallo transitorio)
  const hasContent =
    fresh.playlists.length || fresh.albums.length || fresh.artists.length || fresh.songs.length
  if (hasContent) cacheLibrarySection(SECTION, fresh)
  return { ...fresh, fromCache: false, updatedAt: Date.now() }
}

// ---------- Escrituras contra la cuenta ----------

export type LikeAction = 'like' | 'dislike' | 'clear'

export async function setTrackRating(videoId: string, action: LikeAction): Promise<void> {
  const yt = await sessionManager.get()
  // El InteractionManager de youtubei.js manda target como string y cliente TV,
  // que InnerTube rechaza con 400 para YT Music. Llamada directa correcta:
  const endpoint =
    action === 'like' ? '/like/like' : action === 'dislike' ? '/like/dislike' : '/like/removelike'
  await yt.actions.execute(endpoint, {
    client: 'YTMUSIC',
    target: { videoId }
  } as never)
  // Los "me gusta" también forman parte de la biblioteca (playlist LM) y del
  // panel de corazones — notificamos para que la UI se resuscribe sin refresh.
  notifyLibraryChanged('rate')
}

/** IDs de las canciones con "Me gusta" (playlist LM), para hidratar los corazones. */
export async function getLikedIds(): Promise<string[]> {
  try {
    const { getPlaylist } = await import('./api')
    const liked = await getPlaylist('LM')
    return liked.tracks.map((t) => t.videoId)
  } catch {
    return []
  }
}

export async function addToPlaylist(playlistId: string, videoIds: string[]): Promise<void> {
  const yt = await sessionManager.get()
  await yt.playlist.addVideos(normalizePlaylistId(playlistId), videoIds)
  void refreshLibrary()
    .catch(() => undefined)
    .finally(() => notifyLibraryChanged('playlistAdd'))
}

export async function removeFromPlaylist(playlistId: string, videoIds: string[]): Promise<void> {
  const yt = await sessionManager.get()
  await yt.playlist.removeVideos(normalizePlaylistId(playlistId), videoIds)
  void refreshLibrary()
    .catch(() => undefined)
    .finally(() => notifyLibraryChanged('playlistRemove'))
}

export async function createPlaylist(title: string, videoIds: string[]): Promise<string | null> {
  const yt = await sessionManager.get()
  const res = await yt.playlist.create(title, videoIds)
  void refreshLibrary()
    .catch(() => undefined)
    .finally(() => notifyLibraryChanged('playlistCreate'))
  return (res as { playlist_id?: string })?.playlist_id ?? null
}

/**
 * Edita título y/o carátula de una playlist propia (F22).
 *
 * - El **título** se intenta cambiar en la cuenta con `yt.playlist.setName()`;
 *   si la llamada falla o no existe se guarda solo como override local, y aun
 *   así se aplica en toda la UI la próxima vez que se pinte la playlist.
 * - La **carátula** NO tiene endpoint público en YT Music, así que siempre se
 *   guarda como override local (data URL). El resto de la UI usa
 *   `applyPlaylistOverrides()` para pintar el override encima del backend.
 *
 * Devuelve `{ remoteTitleOk, override }` para que la UI sepa si el título llegó
 * al servidor. `override` es `null` si el usuario quitó tanto título como
 * carátula (equivalente a "restaurar la playlist original").
 */
export async function editPlaylist(
  id: string,
  patch: PlaylistEditPatch
): Promise<{ remoteTitleOk: boolean; override: PlaylistOverride | null }> {
  let remoteTitleOk = false
  if (typeof patch.title === 'string' && patch.title.trim().length) {
    try {
      const yt = await sessionManager.get()
      await yt.playlist.setName(normalizePlaylistId(id), patch.title.trim())
      remoteTitleOk = true
    } catch {
      // Si YT rechaza (playlist ajena, sesión sin permisos, endpoint eliminado)
      // seguimos con el override local — el usuario ve su cambio igualmente.
      remoteTitleOk = false
    }
  }

  // Persistimos el override con el id normalizado para que casen las lecturas
  // desde `getPlaylist(VL…)` y desde el sidebar.
  const nid = normalizePlaylistId(id)
  const override = setPlaylistOverride(nid, {
    // Título: si vino y se envió al servidor, seguimos guardando el override
    // igualmente porque la caché de la biblioteca aún tendrá el nombre viejo.
    title: patch.title === undefined ? undefined : patch.title ?? null,
    thumbnailDataUrl:
      patch.thumbnailDataUrl === undefined ? undefined : patch.thumbnailDataUrl ?? null
  })

  // Invalida la caché para que el próximo `getLibrary()` traiga datos frescos
  // y aplique los overrides encima.
  void refreshLibrary()
    .catch(() => undefined)
    .finally(() => notifyLibraryChanged('playlistEdit'))
  return { remoteTitleOk, override }
}

/** Consulta el override local aplicado a una playlist (para debug/tests). */
export function readPlaylistOverride(id: string): PlaylistOverride | null {
  return getPlaylistOverride(id) ?? getPlaylistOverride(normalizePlaylistId(id))
}

export async function setSubscribed(channelId: string, subscribed: boolean): Promise<void> {
  const yt = await sessionManager.get()
  if (subscribed) await yt.interact.subscribe(channelId)
  else await yt.interact.unsubscribe(channelId)
  void refreshLibrary()
    .catch(() => undefined)
    .finally(() => notifyLibraryChanged('subscribe'))
}

/** Los browseId de playlist llegan como VLPL...; la API de escritura quiere PL... */
function normalizePlaylistId(id: string): string {
  return id.startsWith('VL') ? id.slice(2) : id
}

// ---------- Historial local ----------

export function addHistoryEntry(track: TrackSummary): void {
  // F27 · pasa el techo del historial al recordPlay para poder recortar la tabla.
  let cap = 500
  try {
    // Importación perezosa para evitar ciclos con settings.ts en tests aislados
    // (settings depende de db, y db no debe depender de settings).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const s = require('../settings') as { getAllSettings: () => { historyMaxEntries?: number } }
    cap = s.getAllSettings().historyMaxEntries ?? 500
  } catch {
    /* fallback al defecto */
  }
  recordPlay(track.videoId, track, cap)
  // Además, informa a YouTube para que el historial se sincronice con el móvil
  void (async () => {
    try {
      const yt = await sessionManager.get()
      if (sessionManager.authState.status !== 'signedIn') return
      const info = await yt.music.getInfo(track.videoId)
      await info.addToWatchHistory()
    } catch {
      /* mejor-esfuerzo: el historial local ya quedó registrado */
    }
  })()
}

export function getHistory(limit = 100): TrackSummary[] {
  return readHistory(limit) as TrackSummary[]
}
