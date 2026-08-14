import { sessionManager } from './session'
import {
  bestThumbnail,
  mapListItemToTrack,
  mapShelf,
  mapToCard,
  upscaleThumb
} from './mappers'
import type {
  AlbumDetail,
  ArtistDetail,
  LibrarySnapshot,
  MediaCard,
  PlaylistDetail,
  SearchFilter,
  SearchResults,
  Shelf,
  TrackSummary
} from '@shared/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Fachada tipada sobre yt.music.*: cada método devuelve DTOs planos listos
 * para cruzar el IPC. Toda la lógica de parseo defensivo vive en mappers.ts.
 */

export async function search(query: string, filter: SearchFilter): Promise<SearchResults> {
  const yt = await sessionManager.get()
  const filters =
    filter === 'all' ? undefined : ({ type: filter } as { type: Exclude<SearchFilter, 'all'> })
  const res: any = await yt.music.search(query, filters)

  const out: SearchResults = { songs: [], videos: [], albums: [], artists: [], playlists: [] }

  const sections: any[] = res?.contents ?? []
  for (const section of sections) {
    const typeName = String(section?.type ?? '')
    const contents: any[] = section?.contents ?? []
    if (typeName.includes('MusicCardShelf')) {
      // "Mejor resultado"
      const card = mapToCard(section)
      if (card) out.topResult = card
      continue
    }
    const title = String(section?.header?.title ?? section?.title ?? '').toLowerCase()
    for (const item of contents) {
      const itemType = item?.item_type
      if (itemType === 'song' || (title.includes('canciones') && itemType !== 'video')) {
        const t = mapListItemToTrack(item)
        if (t) out.songs.push(t)
      } else if (itemType === 'video') {
        const t = mapListItemToTrack(item)
        if (t) out.videos.push(t)
      } else {
        const card = mapToCard(item)
        if (!card) continue
        if (card.kind === 'album') out.albums.push(card)
        else if (card.kind === 'artist') out.artists.push(card)
        else if (card.kind === 'playlist') out.playlists.push(card)
        else if (card.kind === 'song') {
          const t = mapListItemToTrack(item)
          if (t) out.songs.push(t)
        }
      }
    }
  }
  return out
}

export async function getSuggestions(input: string): Promise<string[]> {
  const yt = await sessionManager.get()
  const sections: any = await yt.music.getSearchSuggestions(input)
  const out: string[] = []
  for (const section of sections ?? []) {
    for (const item of section?.contents ?? []) {
      const text = item?.suggestion?.toString?.() ?? item?.suggestion?.text
      if (text) out.push(text)
    }
  }
  return out
}

export async function getHome(): Promise<Shelf[]> {
  const yt = await sessionManager.get()
  const home: any = await yt.music.getHomeFeed()
  const shelves: Shelf[] = []
  for (const section of home?.sections ?? []) {
    const shelf = mapShelf(section)
    if (shelf) shelves.push(shelf)
  }
  return shelves
}

export async function getLibrary(): Promise<LibrarySnapshot> {
  const yt = await sessionManager.get()
  const lib: any = await yt.music.getLibrary()
  const snapshot: LibrarySnapshot = { playlists: [], albums: [], artists: [], songs: [] }

  const consume = (items: any[]): void => {
    for (const item of items ?? []) {
      const itemType = item?.item_type
      if (itemType === 'song') {
        const t = mapListItemToTrack(item)
        if (t) snapshot.songs.push(t)
        continue
      }
      const card = mapToCard(item)
      if (!card) continue
      if (card.kind === 'playlist') snapshot.playlists.push(card)
      else if (card.kind === 'album') snapshot.albums.push(card)
      else if (card.kind === 'artist') snapshot.artists.push(card)
    }
  }

  // La biblioteca llega como secciones (grid o shelves)
  for (const section of lib?.items ?? lib?.sections ?? []) {
    if (Array.isArray(section?.contents ?? section?.items)) {
      consume(section.contents ?? section.items)
    } else {
      consume([section])
    }
  }
  return snapshot
}

export async function getPlaylist(id: string): Promise<PlaylistDetail> {
  const yt = await sessionManager.get()
  const pl: any = await yt.music.getPlaylist(id)

  const tracks: TrackSummary[] = []
  for (const item of pl?.items ?? pl?.contents ?? []) {
    const t = mapListItemToTrack(item)
    if (t) tracks.push(t)
  }

  const header = pl?.header
  return {
    id,
    title: header?.title?.toString?.() ?? pl?.title?.toString?.() ?? 'Playlist',
    author: header?.author?.name ?? header?.subtitle?.toString?.(),
    description: header?.description?.toString?.(),
    thumbnailUrl: upscaleThumb(bestThumbnail(header) ?? bestThumbnail(pl)),
    trackCount: tracks.length,
    durationText: header?.duration?.toString?.() ?? header?.second_subtitle?.toString?.(),
    tracks,
    hasContinuation: Boolean(pl?.has_continuation)
  }
}

export async function getAlbum(id: string): Promise<AlbumDetail> {
  const yt = await sessionManager.get()
  const album: any = await yt.music.getAlbum(id)

  const tracks: TrackSummary[] = []
  for (const item of album?.contents ?? []) {
    const t = mapListItemToTrack(item)
    if (t) {
      t.thumbnailUrl = t.thumbnailUrl ?? upscaleThumb(bestThumbnail(album?.header), 256)
      tracks.push(t)
    }
  }

  const header: any = album?.header
  const artists = (header?.strapline_text_one?.runs ?? [])
    .filter((r: any) => r?.endpoint?.payload?.browseId)
    .map((r: any) => ({ name: r.text, id: r.endpoint.payload.browseId }))

  return {
    id,
    title: header?.title?.toString?.() ?? 'Álbum',
    artists: artists.length ? artists : [{ name: header?.subtitle?.toString?.() ?? '' }],
    year: header?.subtitle?.runs?.at?.(-1)?.text,
    thumbnailUrl: upscaleThumb(bestThumbnail(header) ?? bestThumbnail(album)),
    trackCount: tracks.length,
    tracks,
    playlistId: album?.url?.match(/list=([^&]+)/)?.[1]
  }
}

export async function getArtist(id: string): Promise<ArtistDetail> {
  const yt = await sessionManager.get()
  const artist: any = await yt.music.getArtist(id)

  const shelves: Shelf[] = []
  for (const section of artist?.sections ?? []) {
    const shelf = mapShelf(section)
    if (shelf) shelves.push(shelf)
  }

  const header: any = artist?.header
  return {
    id,
    name: header?.title?.toString?.() ?? 'Artista',
    description: header?.description?.toString?.(),
    thumbnailUrl: upscaleThumb(bestThumbnail(header)),
    subscribers: header?.subscribers?.toString?.(),
    shelves
  }
}

export interface UpNextResult {
  tracks: TrackSummary[]
  playlistId?: string
}

export async function getUpNext(videoId: string): Promise<UpNextResult> {
  const yt = await sessionManager.get()
  const panel: any = await yt.music.getUpNext(videoId, true)
  const tracks: TrackSummary[] = []
  for (const item of panel?.contents ?? []) {
    const vid = item?.video_id ?? item?.endpoint?.payload?.videoId
    const title = item?.title?.toString?.()
    if (!vid || !title) continue
    tracks.push({
      kind: 'song',
      videoId: vid,
      title,
      artists: [{ name: item?.author?.toString?.() ?? item?.artists?.toString?.() ?? '' }],
      durationText: item?.duration?.text ?? item?.duration?.toString?.(),
      durationSec: item?.duration?.seconds,
      thumbnailUrl: upscaleThumb(bestThumbnail(item), 256)
    })
  }
  return { tracks, playlistId: panel?.playlist_id }
}

export interface YtLyrics {
  text: string
  footer?: string
}

export async function getYtLyrics(videoId: string): Promise<YtLyrics | null> {
  const yt = await sessionManager.get()
  try {
    const shelf: any = await yt.music.getLyrics(videoId)
    const text = shelf?.description?.toString?.()
    if (!text) return null
    return { text, footer: shelf?.footer?.toString?.() }
  } catch {
    return null
  }
}

export interface CardShelfInfo {
  card: MediaCard | null
}
