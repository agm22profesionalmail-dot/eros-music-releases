import { sessionManager } from './session'
import { getLibrary } from './api'
import { cacheLibrarySection, readLibrarySection, recordPlay, readHistory } from '../db'
import type { LibrarySnapshot, TrackSummary } from '@shared/types'

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
  if (cached && !forceRefresh) {
    // Refresco en segundo plano sin bloquear la respuesta
    void refreshLibrary().catch(() => undefined)
    return { ...cached.data, fromCache: true, updatedAt: cached.updatedAt }
  }
  return refreshLibrary()
}

export async function refreshLibrary(): Promise<LibraryResult> {
  const fresh = await getLibrary()
  cacheLibrarySection(SECTION, fresh)
  return { ...fresh, fromCache: false, updatedAt: Date.now() }
}

// ---------- Escrituras contra la cuenta ----------

export type LikeAction = 'like' | 'dislike' | 'clear'

export async function setTrackRating(videoId: string, action: LikeAction): Promise<void> {
  const yt = await sessionManager.get()
  if (action === 'like') await yt.interact.like(videoId)
  else if (action === 'dislike') await yt.interact.dislike(videoId)
  else await yt.interact.removeRating(videoId)
}

export async function addToPlaylist(playlistId: string, videoIds: string[]): Promise<void> {
  const yt = await sessionManager.get()
  await yt.playlist.addVideos(normalizePlaylistId(playlistId), videoIds)
  void refreshLibrary().catch(() => undefined)
}

export async function removeFromPlaylist(playlistId: string, videoIds: string[]): Promise<void> {
  const yt = await sessionManager.get()
  await yt.playlist.removeVideos(normalizePlaylistId(playlistId), videoIds)
  void refreshLibrary().catch(() => undefined)
}

export async function createPlaylist(title: string, videoIds: string[]): Promise<string | null> {
  const yt = await sessionManager.get()
  const res = await yt.playlist.create(title, videoIds)
  void refreshLibrary().catch(() => undefined)
  return (res as { playlist_id?: string })?.playlist_id ?? null
}

export async function setSubscribed(channelId: string, subscribed: boolean): Promise<void> {
  const yt = await sessionManager.get()
  if (subscribed) await yt.interact.subscribe(channelId)
  else await yt.interact.unsubscribe(channelId)
  void refreshLibrary().catch(() => undefined)
}

/** Los browseId de playlist llegan como VLPL...; la API de escritura quiere PL... */
function normalizePlaylistId(id: string): string {
  return id.startsWith('VL') ? id.slice(2) : id
}

// ---------- Historial local ----------

export function addHistoryEntry(track: TrackSummary): void {
  recordPlay(track.videoId, track)
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
