import type {
  ArtistRef,
  MediaCard,
  Shelf,
  TrackSummary
} from '@shared/types'

/**
 * Mapeadores de nodos del parser de youtubei.js a DTOs serializables.
 * Los nodos llegan tipados como clases; aquí los tratamos de forma defensiva
 * porque la estructura exacta varía entre estanterías y va cambiando con el tiempo.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export function bestThumbnail(node: any): string | undefined {
  const list: any[] | undefined =
    node?.thumbnails ??
    node?.thumbnail?.contents ??
    (Array.isArray(node?.thumbnail) ? node.thumbnail : undefined)
  if (!list?.length) return undefined
  const best = [...list].sort((a, b) => (b?.width ?? 0) - (a?.width ?? 0))[0]
  return best?.url
}

/** Sube la resolución de las carátulas de googleusercontent (=wNNN-hNNN). */
export function upscaleThumb(url: string | undefined, size = 544): string | undefined {
  if (!url) return undefined
  return url.replace(/=w\d+-h\d+/, `=w${size}-h${size}`)
}

function textOf(t: any): string | undefined {
  if (t == null) return undefined
  if (typeof t === 'string') return t
  return t.toString?.() ?? t.text ?? undefined
}

function mapArtists(node: any): ArtistRef[] {
  const arr = node?.artists ?? node?.authors ?? (node?.author ? [node.author] : [])
  return (arr ?? [])
    .map((a: any) => ({ name: a?.name ?? '', id: a?.channel_id ?? undefined }))
    .filter((a: ArtistRef) => a.name)
}

function isExplicit(node: any): boolean {
  const badges = node?.badges
  const arr = Array.isArray(badges) ? badges : (badges?.contents ?? [])
  return (arr ?? []).some((b: any) =>
    String(b?.icon_type ?? b?.label ?? '').toUpperCase().includes('EXPLICIT')
  )
}

/** MusicResponsiveListItem (filas de listas: búsquedas, playlists, álbumes...) */
export function mapListItemToTrack(node: any): TrackSummary | null {
  const videoId =
    node?.id ??
    node?.endpoint?.payload?.videoId ??
    node?.overlay?.content?.endpoint?.payload?.videoId
  const title = textOf(node?.title) ?? textOf(node?.name)
  if (!videoId || !title) return null
  return {
    kind: node?.item_type === 'video' ? 'video' : 'song',
    videoId,
    title,
    artists: mapArtists(node),
    album: node?.album?.name ? { name: node.album.name, id: node.album.id } : undefined,
    durationSec: node?.duration?.seconds,
    durationText: node?.duration?.text,
    thumbnailUrl: upscaleThumb(bestThumbnail(node), 256),
    isExplicit: isExplicit(node)
  }
}

/** Cualquier item (dos filas o lista) a tarjeta genérica. */
export function mapToCard(node: any): MediaCard | null {
  const type: string = node?.item_type ?? 'unknown'
  const title = textOf(node?.title) ?? textOf(node?.name)
  if (!title) return null

  let kind: MediaCard['kind']
  switch (type) {
    case 'song':
      kind = 'song'
      break
    case 'video':
      kind = 'video'
      break
    case 'album':
      kind = 'album'
      break
    case 'playlist':
      kind = 'playlist'
      break
    case 'artist':
    case 'library_artist':
      kind = 'artist'
      break
    default:
      kind = 'unknown'
  }

  // id: videoId para reproducibles, browseId para navegables
  let id: string | undefined = node?.id
  const browseId = node?.endpoint?.payload?.browseId
  if (kind === 'album' || kind === 'playlist' || kind === 'artist') {
    id = browseId ?? id
  } else if (kind === 'song' || kind === 'video') {
    id = id ?? node?.endpoint?.payload?.videoId
  } else {
    id = browseId ?? id ?? node?.endpoint?.payload?.videoId
    if (browseId) {
      // Adivina el tipo por el prefijo del browseId
      if (browseId.startsWith('MPRE')) kind = 'album'
      else if (browseId.startsWith('UC')) kind = 'artist'
      else if (browseId.startsWith('VL') || browseId.startsWith('PL')) kind = 'playlist'
    }
  }
  if (!id) return null

  const subtitleParts: string[] = []
  const sub = textOf(node?.subtitle)
  if (sub) subtitleParts.push(sub)
  else {
    const artists = mapArtists(node)
    if (artists.length) subtitleParts.push(artists.map((a) => a.name).join(', '))
    if (node?.year) subtitleParts.push(String(node.year))
  }

  return {
    kind,
    id: String(id),
    title,
    subtitle: subtitleParts.join(' · ') || undefined,
    thumbnailUrl: upscaleThumb(bestThumbnail(node))
  }
}

/** Estanterías (carruseles de Home, artista, etc.) */
export function mapShelf(shelfNode: any): Shelf | null {
  const title =
    textOf(shelfNode?.header?.title) ?? textOf(shelfNode?.title) ?? undefined
  const contents: any[] = shelfNode?.contents ?? shelfNode?.items ?? []
  const items = contents
    .map((n) => mapToCard(n))
    .filter((c): c is MediaCard => c !== null)
  if (!items.length) return null
  return { title: title ?? '', items }
}
