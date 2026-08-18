/**
 * F71 · Importación de playlists de Spotify.
 *
 * Para playlists públicas, usa el endpoint embed de Spotify que no
 * requiere autenticación. Cada track se busca en YT Music vía la API
 * de búsqueda existente (`music.search`).
 */
import type { ImportTrackMatch, TrackSummary } from '@shared/types'

/** Decodifica entidades HTML básicas que pueden aparecer en títulos/artistas. */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
}

export interface SpotifyTrack {
  title: string
  artist: string
  album?: string
}

/**
 * Extrae el ID de playlist de una URL de Spotify.
 * Acepta: https://open.spotify.com/playlist/ID?si=xxx
 *         https://open.spotify.com/embed/playlist/ID
 *         spotify:playlist:ID
 */
function extractPlaylistId(url: string): string | null {
  // URI de Spotify
  const uriMatch = url.match(/spotify:playlist:([a-zA-Z0-9]+)/)
  if (uriMatch) return uriMatch[1]
  // URL web
  const urlMatch = url.match(/open\.spotify\.com\/(?:embed\/)?playlist\/([a-zA-Z0-9]+)/)
  if (urlMatch) return urlMatch[1]
  return null
}

/**
 * Parsea una playlist pública de Spotify via el endpoint embed.
 * El HTML del embed contiene un JSON con los tracks en un tag
 * `<script id="__NEXT_DATA__">` o en el JSON-LD del resource.
 */
export async function parseSpotifyPlaylist(
  url: string
): Promise<{ name: string; tracks: SpotifyTrack[] }> {
  const playlistId = extractPlaylistId(url)
  if (!playlistId) throw new Error('URL de Spotify inválida')

  // Intentar con el endpoint oEmbed primero (da título)
  let playlistName = `Spotify Playlist ${playlistId}`

  try {
    const oembedRes = await fetch(
      `https://open.spotify.com/oembed?url=https://open.spotify.com/playlist/${playlistId}`
    )
    if (oembedRes.ok) {
      const oembed = (await oembedRes.json()) as { title?: string }
      if (oembed.title) playlistName = oembed.title
    }
  } catch {
    /* mejor-esfuerzo para el título */
  }

  // Obtener el HTML del embed para extraer los tracks
  const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`
  const res = await fetch(embedUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    }
  })
  if (!res.ok) throw new Error(`Spotify respondió con ${res.status}`)
  const html = await res.text()

  // Estrategia 1: buscar __NEXT_DATA__
  let tracks: SpotifyTrack[] = []
  const nextDataMatch = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1])
      tracks = extractTracksFromNextData(data)
    } catch {
      /* caer a la siguiente estrategia */
    }
  }

  // Estrategia 2: parsear los tags <h3> (título) y <h4> (artista) del embed HTML.
  // Spotify renderiza los tracks como server-side HTML con clases CSS-module
  // estables: TracklistRow_title__* y TracklistRow_subtitle__*.
  if (!tracks.length) {
    const rowPattern =
      /<h3[^>]*class="[^"]*TracklistRow_title[^"]*"[^>]*>([^<]+)<\/h3>\s*<h4[^>]*class="[^"]*TracklistRow_subtitle[^"]*"[^>]*>([^<]+)<\/h4>/g
    let m: RegExpExecArray | null
    while ((m = rowPattern.exec(html)) !== null) {
      const title = decodeHtmlEntities(m[1].trim())
      const artist = decodeHtmlEntities(m[2].trim())
      if (title && artist) tracks.push({ title, artist })
    }
  }

  // Estrategia 3: JSON legacy — "track":{"name":"...","artists":[...]}
  if (!tracks.length) {
    const trackPattern = /"track":\s*\{[^}]*"name":\s*"([^"]+)"[^}]*"artists":\s*\[([^\]]+)\]/g
    let match: RegExpExecArray | null
    while ((match = trackPattern.exec(html)) !== null) {
      const title = match[1]
      const artistsRaw = match[2]
      const artistMatch = artistsRaw.match(/"name":\s*"([^"]+)"/)
      if (artistMatch) {
        tracks.push({ title, artist: artistMatch[1] })
      }
    }
  }

  // Estrategia 5: fallback — fetch la página directa de la playlist
  if (!tracks.length) {
    const directRes = await fetch(`https://open.spotify.com/playlist/${playlistId}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      }
    })
    if (directRes.ok) {
      const directHtml = await directRes.text()
      const nextData2 = directHtml.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
      if (nextData2) {
        try {
          const data = JSON.parse(nextData2[1])
          tracks = extractTracksFromNextData(data)
        } catch {
          /* sin tracks */
        }
      }
    }
  }

  if (!tracks.length) {
    throw new Error('No se pudieron extraer los tracks de la playlist de Spotify. Asegúrate de que la playlist sea pública.')
  }

  return { name: playlistName, tracks }
}

/**
 * Repara strings con doble encoding UTF-8.
 * Spotify a veces sirve subtítulos donde los bytes UTF-8 se interpretaron
 * como Latin-1 y se re-codificaron (ej: "MØ" → "MÃ˜").
 */
function fixDoubleEncodedUtf8(str: string): string {
  // Detectar patrón de doble encoding: bytes 0xC0–0xDF seguidos de 0x80–0xBF
  if (!/[À-ß][-¿]/.test(str)) return str
  try {
    const bytes: number[] = []
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i)
      if (code < 256) {
        bytes.push(code)
      } else {
        // Carácter fuera de Latin-1 — no es doble encoding limpio, abortar
        return str
      }
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes))
  } catch {
    return str
  }
}

/**
 * Navega recursivamente un objeto JSON buscando items con datos de track.
 * Soporta múltiples formatos que Spotify ha usado a lo largo del tiempo.
 */
function extractTracksFromNextData(data: unknown): SpotifyTrack[] {
  const tracks: SpotifyTrack[] = []
  const seen = new Set<string>()

  function addTrack(title: string, artist: string, album?: string): void {
    const key = `${title}|${artist}`.toLowerCase()
    if (artist && !seen.has(key)) {
      seen.add(key)
      tracks.push({ title, artist, album })
    }
  }

  function walk(obj: unknown): void {
    if (!obj || typeof obj !== 'object') return
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item)
      return
    }
    const o = obj as Record<string, unknown>

    // Patrón 2025+: { title, subtitle, uri: "spotify:track:...", entityType: "track" }
    // Estructura plana en props.pageProps.state.data.entity.trackList[]
    if (
      typeof o.title === 'string' &&
      typeof o.subtitle === 'string' &&
      (o.entityType === 'track' ||
        (typeof o.uri === 'string' && (o.uri as string).includes('track')))
    ) {
      addTrack(o.title as string, fixDoubleEncodedUtf8(o.subtitle as string))
    }

    // Patrón legacy: { track: { name, artists: [{ name }], album: { name } } }
    if (o.track && typeof o.track === 'object') {
      const track = o.track as Record<string, unknown>
      if (typeof track.name === 'string' && Array.isArray(track.artists)) {
        const title = track.name
        const artist = (track.artists as { name?: string }[])
          .map((a) => a.name ?? '')
          .filter(Boolean)
          .join(', ')
        const album =
          track.album && typeof track.album === 'object'
            ? (track.album as { name?: string }).name
            : undefined
        addTrack(title, artist, album)
      }
    }

    // Patrón legacy directo: { name, artists: [...], uri } sin wrapper 'track'
    if (
      typeof o.name === 'string' &&
      Array.isArray(o.artists) &&
      o.uri &&
      typeof o.uri === 'string' &&
      (o.uri as string).includes('track')
    ) {
      const title = o.name as string
      const artist = (o.artists as { name?: string }[])
        .map((a) => a.name ?? '')
        .filter(Boolean)
        .join(', ')
      addTrack(title, artist)
    }

    for (const v of Object.values(o)) walk(v)
  }

  walk(data)
  return tracks
}

/**
 * Normaliza un texto para comparación fuzzy:
 * quita "(feat. X)", "[Official Video]", paréntesis ruidosos, etc.
 */
function normForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/\(([^)]*)\)|\[([^\]]*)\]/g, (match, p: string | undefined, b: string | undefined) => {
      const inner = p ?? b ?? ''
      if (/\b(?:feat|ft|featuring|official|video|audio|lyric|lyrics|remaster|explicit|hd|4k|m\/?v)\b/i.test(inner)) return ''
      return match
    })
    .replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.+$/i, '')
    .replace(/\s*[-–—]\s*$/, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Busca cada track de la lista en YouTube Music y devuelve los resultados
 * de coincidencia. Llama a `onProgress` tras cada búsqueda.
 *
 * @param searchFn - función de búsqueda que recibe query y devuelve TrackSummary[]
 *                   (inyectada desde el IPC handler para evitar acoplar a `music.search`)
 */
export async function matchTracksToYtMusic(
  tracks: SpotifyTrack[],
  searchFn: (query: string) => Promise<TrackSummary[]>,
  onProgress?: (current: number, total: number, matches: ImportTrackMatch[]) => void
): Promise<ImportTrackMatch[]> {
  const matches: ImportTrackMatch[] = []

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i]
    const query = `${t.title} ${t.artist}`
    let match: TrackSummary | null = null
    let quality: 'exact' | 'partial' | 'none' = 'none'

    try {
      const results = await searchFn(query)
      if (results.length > 0) {
        const best = results[0]
        const normTitle = normForCompare(t.title)
        const normArtist = normForCompare(t.artist)
        const resultTitle = normForCompare(best.title)
        const resultArtist = normForCompare(best.artists.map((a) => a.name).join(', '))

        if (resultTitle.includes(normTitle) || normTitle.includes(resultTitle)) {
          quality = resultArtist.includes(normArtist) || normArtist.includes(resultArtist)
            ? 'exact'
            : 'partial'
        } else {
          quality = 'partial'
        }
        match = best
      }
    } catch {
      /* mejor-esfuerzo: no encontrado */
    }

    matches.push({
      sourceTitle: t.title,
      sourceArtist: t.artist,
      match,
      quality
    })

    onProgress?.(i + 1, tracks.length, matches)

    // Pausa entre búsquedas para no saturar la API
    if (i < tracks.length - 1) {
      await new Promise((r) => setTimeout(r, 300))
    }
  }

  return matches
}
