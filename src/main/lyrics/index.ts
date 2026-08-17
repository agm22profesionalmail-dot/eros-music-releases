// Orquestador de letras. En F30 la cadena de proveedores es configurable:
// el usuario reordena LRCLIB, KUGOU y YTMUSIC en Ajustes → Letras. El
// orquestador itera la lista, respeta el flag `enabled` y devuelve el
// primer proveedor que entregue una letra útil.
//
// Prioridad interna dentro de cada proveedor:
//   1. sincronizada por palabra (KRC de KuGou) — karaoke real
//   2. sincronizada por líneas (LRC) — resaltado de línea
//   3. texto plano — mejor que nada
//
// Caché en memoria por título|artistas para la sesión (deduplica peticiones
// concurrentes al guardar la promesa en curso).

import type { LyricsData, LyricLine, LyricsProvider } from '@shared/types'
import { fetchLrclibLyrics, type LrclibLyrics } from './lrclib'
import { fetchKugouLyrics, fetchKugouKrc } from './kugou'
import { parseLrc } from './parser'
import { getAllSettings } from '../settings'
import { getYtLyrics } from '../innertube/api'

export interface GetLyricsParams {
  /** F30 · Necesario para el proveedor YTMUSIC (Innertube.music.getLyrics). */
  videoId?: string
  title: string
  artists: string[]
  album?: string
  durationSec?: number
}

/** Palabras que delatan que un paréntesis/corchete es "ruido" del título */
const NOISE_RE =
  /\b(?:feat|ft|featuring|official|oficial|video|videoclip|audio|lyric|lyrics|letra|visuali[sz]er|remaster(?:ed|izad[oa])?|explicit|hd|4k|m\/?v|deluxe|expanded|anniversary|bonus|track|edition|edici[oó]n|version|versi[oó]n|live|en\s*vivo|single|acoustic|ac[uú]stic[oa]?|remix|from\s+[""].+?[""])\b/i

/** Año suelto entre paréntesis/corchetes: "(2021)" / "[1999 Remaster]" */
const YEAR_PAREN_RE = /[(\[]\s*\d{4}\s*(?:remaster(?:ed|izad[oa])?)?\s*[)\]]/gi

/**
 * F71 · Limpia el título antes de buscar: quita "(feat. X)", "(Official Video)",
 * "[Lyric Video]", "(Remastered 2021)", "(Deluxe Edition)", etc.
 * Conserva los paréntesis legítimos ("(I Can't Get No) Satisfaction").
 */
export function normalizeTitle(title: string): string {
  let out = title
  // Año entre paréntesis/corchetes (con o sin "Remastered"): "(2021)", "[1999 Remaster]"
  out = out.replace(YEAR_PAREN_RE, '')
  // Paréntesis o corchetes cuyo contenido es ruido
  out = out.replace(/\(([^)]*)\)|\[([^\]]*)\]/g, (match, paren: string | undefined, bracket: string | undefined) => {
    const inner = paren ?? bracket ?? ''
    return NOISE_RE.test(inner) ? '' : match
  })
  // "feat. X" / "ft. X" colgando al final sin paréntesis
  out = out.replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.+$/i, '')
  // "- Remastered 2021" / "- Deluxe Edition" colgando al final
  out = out.replace(/\s*[-–—]\s*(?:remaster(?:ed|izad[oa])?|deluxe|expanded|anniversary)\s*(?:\d{4})?\s*(?:edition|edici[oó]n|version|versi[oó]n)?\s*$/i, '')
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
 * Busca la letra de una canción respetando la cadena configurada por el
 * usuario (F30). Nunca lanza: si nada devuelve algo útil, resuelve a null.
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

/**
 * Ejecuta los proveedores en el orden configurado. Cada proveedor decide su
 * propia jerarquía interna (KRC > LRC > texto plano) y devuelve `null` si no
 * encuentra nada. El primero que devuelva contenido real gana.
 */
async function lookup(
  title: string,
  artist: string,
  params: GetLyricsParams
): Promise<LyricsData | null> {
  const settings = getAllSettings()
  // Si no hay proveedores configurados (o el array quedó vacío), usa los
  // defaults implícitos igual que getAllSettings — cinturón y tirantes.
  const providers: LyricsProvider[] = settings.lyricsProviders?.length
    ? settings.lyricsProviders
    : [
        { id: 'LRCLIB', enabled: true },
        { id: 'KUGOU', enabled: true },
        { id: 'YTMUSIC', enabled: true }
      ]

  for (const provider of providers) {
    if (!provider.enabled) continue
    try {
      const result = await runProvider(provider.id, title, artist, params)
      if (result) return result
    } catch {
      // Cualquier fallo se traga y se pasa al siguiente proveedor.
    }
  }
  return null
}

/** Ejecuta un proveedor concreto por id. */
async function runProvider(
  id: string,
  title: string,
  artist: string,
  params: GetLyricsParams
): Promise<LyricsData | null> {
  switch (id.toUpperCase()) {
    case 'LRCLIB':
      return await providerLrclib(title, artist, params)
    case 'KUGOU':
      return await providerKugou(title, artist, params)
    case 'YTMUSIC':
      return await providerYoutubeMusic(params)
    default:
      return null
  }
}

// ---------- Proveedores ----------

async function providerLrclib(
  title: string,
  artist: string,
  params: GetLyricsParams
): Promise<LyricsData | null> {
  const lrclib: LrclibLyrics | null = await fetchLrclibLyrics({
    title,
    artist,
    album: params.album,
    durationSec: params.durationSec
  })
  if (!lrclib) return null
  if (lrclib.synced) {
    const synced = parseLrc(lrclib.synced)
    if (hasRealLines(synced)) {
      return { source: 'LRCLIB', synced, plain: lrclib.plain }
    }
  }
  if (lrclib.plain) return { source: 'LRCLIB', plain: lrclib.plain }
  return null
}

async function providerKugou(
  title: string,
  artist: string,
  params: GetLyricsParams
): Promise<LyricsData | null> {
  const kugouParams = { title, artist, durationSec: params.durationSec }
  // KRC primero (palabras); LRC como respaldo del mismo proveedor.
  const krc = await fetchKugouKrc(kugouParams).catch(() => null)
  if (krc && hasRealLines(krc) && !krc.some((l) => l.text.includes('纯音乐'))) {
    return { source: 'KuGou (karaoke)', synced: krc }
  }
  const lrc = await fetchKugouLyrics(kugouParams).catch(() => null)
  if (lrc) {
    const synced = parseLrc(lrc)
    if (hasRealLines(synced) && !synced.some((l) => l.text.includes('纯音乐'))) {
      return { source: 'KuGou', synced }
    }
  }
  return null
}

async function providerYoutubeMusic(params: GetLyricsParams): Promise<LyricsData | null> {
  if (!params.videoId) return null
  const yt = await getYtLyrics(params.videoId).catch(() => null)
  if (!yt?.text || yt.text.trim() === '') return null
  return { source: 'YouTube Music', plain: yt.text }
}

/** Al menos una línea con texto de verdad (no solo pausas vacías). */
function hasRealLines(lines: LyricLine[] | { timeMs: number; text: string }[]): boolean {
  return lines.some((l) => l.text.trim() !== '')
}
