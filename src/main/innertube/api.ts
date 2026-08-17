import { sessionManager } from './session'
import {
  bestThumbnail,
  mapListItemToTrack,
  mapShelf,
  mapToCard,
  upscaleThumb
} from './mappers'
import { getAllPlaylistOverrides, getPlaylistOverride } from '../db'
import { getAllSettings } from '../settings'
import type {
  AlbumDetail,
  ArtistDetail,
  ArtistRef,
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

/**
 * MusicCardShelf del "Mejor resultado": estructura peculiar, `contents` son
 * solo badges/textos. Los datos útiles están en la propia sección (title,
 * subtitle, thumbnail) y la navegación en `on_tap.payload` — el prefijo del
 * browseId o el videoId decide el tipo de tarjeta.
 */
function topResultCard(section: any): MediaCard | null {
  const title = section?.title?.text ?? section?.title?.toString?.()
  if (!title) return null
  const subtitle = section?.subtitle?.text ?? section?.subtitle?.toString?.()
  const thumb = upscaleThumb(bestThumbnail(section), 256)
  // Navegación: la sección tiene `on_tap` para navegar. El PlayButton está en
  // `thumbnail_overlay.content.endpoint` para reproducir directamente.
  const tap = section?.on_tap?.payload ?? section?.thumbnail_overlay?.content?.endpoint?.payload
  const browseId: string | undefined = tap?.browseId
  const videoId: string | undefined = tap?.videoId
  let kind: MediaCard['kind'] = 'unknown'
  let id: string | undefined
  if (videoId) {
    kind = 'song'
    id = videoId
  } else if (browseId) {
    id = browseId
    if (browseId.startsWith('MPRE') || browseId.startsWith('MPLA')) kind = 'album'
    else if (browseId.startsWith('UC')) kind = 'artist'
    else if (browseId.startsWith('VL') || browseId.startsWith('PL') || browseId.startsWith('OLAK'))
      kind = 'playlist'
  }
  if (!id) return null
  return { kind, id, title, subtitle, thumbnailUrl: thumb }
}

export async function search(query: string, filter: SearchFilter): Promise<SearchResults> {
  const emptyResults = (): SearchResults => ({
    songs: [],
    videos: [],
    albums: [],
    artists: [],
    playlists: []
  })

  // F43 · Blindaje total: cualquier fallo del parser de youtubei.js (miniaturas
  // vacías, endpoints sin payload, secciones con forma nueva…) no debe reventar
  // la búsqueda. Envolvemos la llamada de red por si `yt.music.search` propaga
  // un TypeError al construir el árbol, y devolvemos resultados vacíos.
  let res: any
  try {
    const yt = await sessionManager.get()
    const filters =
      filter === 'all' ? undefined : ({ type: filter } as { type: Exclude<SearchFilter, 'all'> })
    res = await yt.music.search(query, filters)
  } catch (err) {
    console.error('[search] fallo al invocar yt.music.search:', err)
    return emptyResults()
  }

  const out: SearchResults = emptyResults()

  const sections: any[] = res?.contents ?? []
  for (const section of sections) {
    // F43 · Cada sección se procesa aislada: si una revienta (por ejemplo por
    // un item con thumbnails=undefined) sigue el resto y no se pierde toda la
    // búsqueda.
    try {
      const typeName = String(section?.type ?? '')
      const contents: any[] = section?.contents ?? []
      if (typeName.includes('MusicCardShelf')) {
        // "Mejor resultado" — MusicCardShelf tiene su propia estructura: los
        // `contents` son solo badges/textos; los datos útiles están en la propia
        // sección (title, subtitle, thumbnail) y la navegación en `on_tap` o en
        // el PlayButton del overlay. Adaptamos manualmente.
        try {
          const card = topResultCard(section)
          if (card) out.topResult = card
        } catch (err) {
          console.warn('[search] topResultCard falló:', err)
        }
        continue
      }
      const title = String(section?.header?.title ?? section?.title ?? '').toLowerCase()
      for (const item of contents) {
        // F43 · Cada item también en su propio try: si mapListItemToTrack o
        // mapToCard revientan (item.thumbnails vacío, item.artists undefined…),
        // se descarta silenciosamente y el resto de la sección sobrevive.
        try {
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
        } catch (err) {
          console.warn('[search] item descartado por parseo:', err)
        }
      }
    } catch (err) {
      console.warn('[search] sección descartada por parseo:', err)
    }
  }
  // Filtro "Todo": InnerTube promociona el artista conocido SOLO al topResult
  // (MusicCardShelf) y lo excluye de la sección genérica "Artista", que queda
  // llena de canales homónimos irrelevantes. Si el topResult es un artista,
  // lo reinsertamos al principio de out.artists (sin duplicar por id).
  if (out.topResult?.kind === 'artist') {
    const topArtist = out.topResult
    out.artists = out.artists.filter((a) => a.id !== topArtist.id)
    out.artists.unshift(topArtist)
  }
  // F28 · aplica filtros de contenido a todo el bloque
  // F43 · los filtros también van blindados: cualquier fallo aquí devolvería la
  // banda roja, y preferimos entregar la lista sin filtrar antes que caer.
  try {
    out.songs = applyTrackContentFilters(out.songs)
    out.videos = applyTrackContentFilters(out.videos)
    out.albums = applyCardContentFilters(out.albums)
    out.artists = applyCardContentFilters(out.artists)
    out.playlists = applyCardContentFilters(out.playlists)
    if (out.topResult) {
      const stillOk = applyCardContentFilters([out.topResult]).length > 0
      if (!stillOk) out.topResult = undefined
    }
  } catch (err) {
    console.warn('[search] filtros de contenido fallaron, devolviendo sin filtrar:', err)
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
  // F28 · filtra vídeos en las estanterías si el ajuste está activo
  filterShelvesInPlace(shelves)
  return shelves.filter((s) => s.items.length > 0)
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

  // La biblioteca llega como secciones (grid o shelves). En youtubei.js v18
  // los items cuelgan de `contents`; mantenemos los nombres antiguos por si acaso.
  for (const section of lib?.contents ?? lib?.items ?? lib?.sections ?? []) {
    const inner = section?.contents ?? section?.items
    if (Array.isArray(inner)) {
      consume(inner)
    } else {
      consume([section])
    }
  }

  // F22: aplica los overrides locales encima de las cards de playlist antes de
  // devolver la instantánea. Así el sidebar y la biblioteca muestran el título
  // y la carátula que el usuario eligió.
  applyPlaylistOverrides(snapshot.playlists)
  return snapshot
}

/**
 * Aplica los overrides locales de F22 a un array de MediaCard de playlist,
 * sustituyendo `title` y `thumbnailUrl` cuando hay un override guardado.
 * Comprueba tanto el id "tal cual" como el normalizado (sin prefijo VL) porque
 * la escritura usa PL y la biblioteca suele traer VLPL.
 */
export function applyPlaylistOverrides(cards: MediaCard[]): void {
  const map = getAllPlaylistOverrides()
  if (!map.size) return
  for (const card of cards) {
    if (card.kind !== 'playlist') continue
    const o = map.get(card.id) ?? map.get(normalizePlaylistId(card.id))
    if (!o) continue
    if (o.title) card.title = o.title
    if (o.thumbnailDataUrl) card.thumbnailUrl = o.thumbnailDataUrl
  }
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
  // Detección de "editable": youtubei.js expone una clase específica cuando la
  // cuenta actual es dueña de la playlist. Fallback: prefijo `PL` del id.
  const headerType = String(header?.type ?? '')
  const isEditable =
    headerType.includes('EditablePlaylist') ||
    Boolean((header as any)?.edit_header) ||
    (typeof id === 'string' && !id.startsWith('VL') && id.startsWith('PL'))

  // Override local (F22): si el usuario editó título/carátula, mándalo sobre
  // lo que llega de la red.
  const override = getPlaylistOverride(id) ?? getPlaylistOverride(normalizePlaylistId(id))
  const backendTitle =
    header?.title?.toString?.() ?? pl?.title?.toString?.() ?? 'Playlist'
  const backendThumb = upscaleThumb(bestThumbnail(header) ?? bestThumbnail(pl))

  // F28 · filtra tracks según ajustes de contenido
  const filteredTracks = applyTrackContentFilters(tracks)

  return {
    id,
    title: override?.title ?? backendTitle,
    author: header?.author?.name ?? header?.subtitle?.toString?.(),
    description: header?.description?.toString?.(),
    thumbnailUrl: override?.thumbnailDataUrl ?? backendThumb,
    trackCount: filteredTracks.length,
    durationText: header?.duration?.toString?.() ?? header?.second_subtitle?.toString?.(),
    tracks: filteredTracks,
    hasContinuation: Boolean(pl?.has_continuation),
    isEditable
  }
}

/** Los browseId de playlist llegan como VLPL...; los ids de escritura son PL... */
function normalizePlaylistId(id: string): string {
  return id.startsWith('VL') ? id.slice(2) : id
}

/**
 * F28 · Filtros de contenido: aplica los ajustes de usuario a un array de pistas.
 * - hideExplicit: descarta las que tengan isExplicit=true.
 * - hideVideos: descarta las kind='video'.
 * - hideShorts: descarta vídeos con duración < 60 s (heurística de shorts).
 */
export function applyTrackContentFilters<T extends TrackSummary>(items: T[]): T[] {
  const s = getAllSettings()
  if (!s.hideExplicit && !s.hideVideos && !s.hideShorts) return items
  return items.filter((t) => {
    if (s.hideExplicit && t.isExplicit) return false
    if (s.hideVideos && t.kind === 'video') return false
    if (s.hideShorts && t.kind === 'video' && typeof t.durationSec === 'number' && t.durationSec < 60) {
      return false
    }
    return true
  })
}

/**
 * F28 · Filtros para MediaCard: sólo `hideVideos` (con `kind==='video'`) aplica
 * a tarjetas — el resto de tipos (álbum, artista, playlist) siempre pasan.
 */
export function applyCardContentFilters<T extends MediaCard>(items: T[]): T[] {
  const s = getAllSettings()
  if (!s.hideVideos) return items
  return items.filter((c) => c.kind !== 'video')
}

/** Aplica los filtros a todas las estanterías in-place (tracks y cards). */
function filterShelvesInPlace(shelves: Shelf[]): void {
  for (const shelf of shelves) {
    shelf.items = applyCardContentFilters(shelf.items)
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

  // F28 · aplica filtros de contenido a las pistas del álbum
  const filteredTracks = applyTrackContentFilters(tracks)

  return {
    id,
    title: header?.title?.toString?.() ?? 'Álbum',
    artists: artists.length ? artists : [{ name: header?.subtitle?.toString?.() ?? '' }],
    year: header?.subtitle?.runs?.at?.(-1)?.text,
    thumbnailUrl: upscaleThumb(bestThumbnail(header) ?? bestThumbnail(album)),
    trackCount: filteredTracks.length,
    tracks: filteredTracks,
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
  // F28 · filtra vídeos/tracks dentro de las estanterías del artista
  filterShelvesInPlace(shelves)
  const cleanShelves = shelves.filter((s) => s.items.length > 0)
  // Los "oyentes mensuales" no existen en YT Music por norma general; algunos
  // headers exponen `monthly_listeners` (raro), lo intentamos por si acaso.
  const monthlyListeners =
    header?.monthly_listeners?.toString?.() ??
    header?.monthlyListeners?.toString?.() ??
    undefined
  return {
    id,
    name: header?.title?.toString?.() ?? 'Artista',
    description: header?.description?.toString?.(),
    thumbnailUrl: upscaleThumb(bestThumbnail(header)),
    subscribers: header?.subscribers?.toString?.(),
    monthlyListeners,
    shelves: cleanShelves
  }
}

export interface UpNextResult {
  tracks: TrackSummary[]
  playlistId?: string
}

/**
 * F60 · Artistas de un PlaylistPanelVideo CON id de canal cuando exista.
 * El mapeo antiguo aplastaba todo a un string sin id, y por eso los artistas
 * de la cola (radio/autoplay) no eran clicables en la barra inferior.
 * La estructura varía según el nodo, así que se prueban varias rutas:
 *   1) arrays `artists`/`authors` con `channel_id` (como en las listas)
 *   2) `author` objeto con `channel_id`
 *   3) runs del by-line con endpoint de canal (browseId "UC…")
 *   4) degradación: el texto plano de siempre (sin id)
 */
function mapPanelArtists(item: any): ArtistRef[] {
  const arr = item?.artists ?? item?.authors
  if (Array.isArray(arr) && arr.length) {
    const mapped = arr
      .map((a: any) => ({ name: a?.name ?? '', id: a?.channel_id ?? undefined }))
      .filter((a: ArtistRef) => a.name)
    if (mapped.length) return mapped
  }
  const author = item?.author
  if (author && typeof author === 'object' && typeof author.name === 'string' && author.name) {
    return [{ name: author.name, id: author.channel_id ?? undefined }]
  }
  const runs = item?.long_by_line?.runs ?? item?.by_line?.runs ?? []
  const fromRuns: ArtistRef[] = []
  for (const r of runs) {
    const id = r?.endpoint?.payload?.browseId ?? r?.endpoint?.payload?.browse_id
    if (r?.text && typeof id === 'string' && id.startsWith('UC')) {
      fromRuns.push({ name: r.text, id })
    }
  }
  if (fromRuns.length) return fromRuns
  const raw = typeof author === 'string' ? author : (author?.toString?.() ?? '')
  const name = raw === '[object Object]' ? '' : raw
  return name ? [{ name }] : []
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
      artists: mapPanelArtists(item),
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
