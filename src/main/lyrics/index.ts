// Orquestador de letras: las mismas fuentes y el mismo orden que Metrolist
// en Android — LRCLIB (sincronizada) → KuGou (sincronizada) → LRCLIB (plana).
// Con caché en memoria por título|artistas que vive lo que la sesión.

import type { LyricsData } from '@shared/types'
import { fetchLrclibLyrics, type LrclibLyrics } from './lrclib'
import { fetchKugouLyrics } from './kugou'
import { parseLrc } from './parser'

export interface GetLyricsParams {
  title: string
  artists: string[]
  album?: string
  durationSec?: number
}

/** Palabras que delatan que un paréntesis/corchete es "ruido" del título */
const NOISE_RE =
  /\b(?:feat|ft|featuring|official|oficial|video|videoclip|audio|lyric|lyrics|letra|visuali[sz]er|remaster(?:ed|izad[oa])?|explicit|hd|4k|m\/?v)\b/i

/**
 * Limpia el título antes de buscar: quita "(feat. X)", "(Official Video)",
 * "[Lyric Video]" y variantes, y los "feat. X" sin paréntesis al final.
 * Conserva los paréntesis legítimos ("(I Can't Get No) Satisfaction").
 */
export function normalizeTitle(title: string): string {
  let out = title
  // Paréntesis o corchetes cuyo contenido es ruido
  out = out.replace(/\(([^)]*)\)|\[([^\]]*)\]/g, (match, paren: string | undefined, bracket: string | undefined) => {
    const inner = paren ?? bracket ?? ''
    return NOISE_RE.test(inner) ? '' : match
  })
  // "feat. X" / "ft. X" colgando al final sin paréntesis
  out = out.replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.+$/i, '')
  // Sufijo "- Topic" (canales autogenerados de YouTube) por si llega en el título
  out = out.replace(/\s*-\s*topic\s*$/i, '')
  // Separadores colgantes y espacios duplicados
  out = out.replace(/\s*[-–—]\s*$/, '')
  out = out.replace(/\s{2,}/g, ' ').trim()
  return out
}

/** Limpia el nombre del artista: quita el sufijo "- Topic" de los canales
 *  autogenerados de YouTube y colapsa espacios. */
export function normalizeArtist(artist: string): string {
  return artist
    .replace(/\s*-\s*topic\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Caché de sesión: clave título|artistas → promesa del resultado.
// Guardar la promesa (y no el valor) también deduplica peticiones simultáneas.
const cache = new Map<string, Promise<LyricsData | null>>()

/** Vacía la caché (útil en tests). */
export function clearLyricsCache(): void {
  cache.clear()
}

/**
 * Busca la letra de una canción. Orden de fuentes, como Metrolist:
 *   1) LRCLIB sincronizada  2) KuGou sincronizada  3) LRCLIB texto plano
 * Nunca lanza: si todo falla devuelve null.
 */
export function getLyrics(params: GetLyricsParams): Promise<LyricsData | null> {
  const title = normalizeTitle(params.title)
  const artists = params.artists.map((a) => normalizeArtist(a)).filter((a) => a !== '')
  const key = `${title.toLowerCase()}|${artists.map((a) => a.toLowerCase()).join(',')}`
  const hit = cache.get(key)
  if (hit) return hit
  const promise = lookup(title, artists[0] ?? '', params).catch(() => null)
  cache.set(key, promise)
  return promise
}

async function lookup(
  title: string,
  artist: string,
  params: GetLyricsParams
): Promise<LyricsData | null> {
  // 1) LRCLIB — fuente principal. Si la red falla seguimos con el respaldo.
  let lrclib: LrclibLyrics | null = null
  try {
    lrclib = await fetchLrclibLyrics({
      title,
      artist,
      album: params.album,
      durationSec: params.durationSec
    })
  } catch {
    lrclib = null
  }
  if (lrclib?.synced) {
    const synced = parseLrc(lrclib.synced)
    if (hasRealLines(synced)) {
      return { source: 'LRCLIB', synced, plain: lrclib.plain }
    }
  }

  // 2) KuGou — respaldo sincronizado (nunca lanza)
  const kugouLrc = await fetchKugouLyrics({ title, artist, durationSec: params.durationSec })
  if (kugouLrc) {
    const synced = parseLrc(kugouLrc)
    // "纯音乐" = pista instrumental marcada por KuGou: no es una letra real
    if (hasRealLines(synced) && !synced.some((l) => l.text.includes('纯音乐'))) {
      return { source: 'KuGou', synced }
    }
  }

  // 3) LRCLIB texto plano — mejor que nada
  if (lrclib?.plain) {
    return { source: 'LRCLIB', plain: lrclib.plain }
  }
  return null
}

/** Al menos una línea con texto de verdad (no solo pausas vacías). */
function hasRealLines(lines: { timeMs: number; text: string }[]): boolean {
  return lines.some((l) => l.text.trim() !== '')
}
