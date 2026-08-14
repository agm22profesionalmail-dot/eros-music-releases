// Orquestador de letras: las mismas fuentes y el mismo orden que Metrolist
// en Android — LRCLIB (sincronizada) → KuGou (sincronizada) → LRCLIB (plana).
// Con caché en memoria por título|artistas que vive lo que la sesión.

import type { LyricsData } from '@shared/types'
import { fetchLrclibLyrics, type LrclibLyrics } from './lrclib'
import { fetchKugouLyrics, fetchKugouKrc } from './kugou'
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
  // KRC de KuGou (tiempos por palabra) y LRCLIB (líneas) en paralelo:
  // el karaoke de verdad necesita palabras; LRCLIB es el respaldo fiable.
  const kugouParams = { title, artist, durationSec: params.durationSec }
  const [krcResult, lrclibResult] = await Promise.allSettled([
    fetchKugouKrc(kugouParams),
    fetchLrclibLyrics({ title, artist, album: params.album, durationSec: params.durationSec })
  ])

  // 1) KuGou KRC — karaoke por palabra (el que sigue al cantante)
  const krc = krcResult.status === 'fulfilled' ? krcResult.value : null
  if (krc && hasRealLines(krc) && !krc.some((l) => l.text.includes('纯音乐'))) {
    return { source: 'KuGou (karaoke)', synced: krc }
  }

  // 2) LRCLIB sincronizada por líneas
  const lrclib: LrclibLyrics | null =
    lrclibResult.status === 'fulfilled' ? lrclibResult.value : null
  if (lrclib?.synced) {
    const synced = parseLrc(lrclib.synced)
    if (hasRealLines(synced)) {
      return { source: 'LRCLIB', synced, plain: lrclib.plain }
    }
  }

  // 3) KuGou LRC — respaldo sincronizado por líneas (nunca lanza)
  const kugouLrc = await fetchKugouLyrics(kugouParams)
  if (kugouLrc) {
    const synced = parseLrc(kugouLrc)
    // "纯音乐" = pista instrumental marcada por KuGou: no es una letra real
    if (hasRealLines(synced) && !synced.some((l) => l.text.includes('纯音乐'))) {
      return { source: 'KuGou', synced }
    }
  }

  // 4) LRCLIB texto plano — mejor que nada
  if (lrclib?.plain) {
    return { source: 'LRCLIB', plain: lrclib.plain }
  }
  return null
}

/** Al menos una línea con texto de verdad (no solo pausas vacías). */
function hasRealLines(lines: { timeMs: number; text: string }[]): boolean {
  return lines.some((l) => l.text.trim() !== '')
}
