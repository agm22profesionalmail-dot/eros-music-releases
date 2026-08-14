// Cliente de LRCLIB (https://lrclib.net/api) — la misma fuente principal de
// letras que usa Metrolist en Android. Dos endpoints:
//   GET /api/get     → coincidencia exacta (LRCLIB aplica ±2 s si se pasa duration)
//   GET /api/search  → búsqueda como respaldo; elegimos el resultado con la
//                      duración más próxima (tolerancia ±3 s si se conoce)
// Un 404 significa "no encontrada" y se traduce a null.

const BASE = 'https://lrclib.net/api'
const USER_AGENT = 'MetrolistPC/0.1 (https://github.com/metrolistgroup/metrolist)'
const TIMEOUT_MS = 10_000
/** Tolerancia al comparar duraciones en los resultados de búsqueda */
const DURATION_TOLERANCE_SEC = 3

/** Forma (parcial) de una pista tal y como la devuelve la API de LRCLIB */
interface LrclibTrack {
  id?: number
  trackName?: string
  artistName?: string
  albumName?: string
  duration?: number
  instrumental?: boolean
  plainLyrics?: string | null
  syncedLyrics?: string | null
}

export interface LrclibLyrics {
  /** Letra sincronizada en formato LRC, tal cual la devuelve la API */
  synced?: string
  /** Letra en texto plano */
  plain?: string
}

export interface LrclibParams {
  title: string
  artist: string
  album?: string
  durationSec?: number
}

/** GET con query params y User-Agent identificativo. 404 o error HTTP → null. */
async function request(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`${BASE}/${path}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
  if (res.status === 404) return null // no encontrada
  if (!res.ok) return null
  return await res.json()
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/** Extrae las letras útiles de una pista; null si no trae ninguna. */
function pickLyrics(track: LrclibTrack): LrclibLyrics | null {
  const synced = hasText(track.syncedLyrics) ? track.syncedLyrics : undefined
  const plain = hasText(track.plainLyrics) ? track.plainLyrics : undefined
  if (!synced && !plain) return null
  return { synced, plain }
}

/** Elige el mejor resultado de búsqueda: duración más próxima y con preferencia
 *  por letras sincronizadas. Si se conoce la duración y ningún resultado cae
 *  dentro de la tolerancia, se descarta todo (mejor nada que la letra de otra
 *  versión de la canción). */
function pickBest(results: LrclibTrack[], durationSec: number | undefined): LrclibLyrics | null {
  let candidates = results
  if (durationSec !== undefined) {
    candidates = results
      .filter(
        (r) =>
          typeof r.duration === 'number' &&
          Math.abs(r.duration - durationSec) <= DURATION_TOLERANCE_SEC
      )
      .sort(
        (a, b) =>
          Math.abs((a.duration ?? 0) - durationSec) - Math.abs((b.duration ?? 0) - durationSec)
      )
  }
  const withSynced = candidates.find((r) => hasText(r.syncedLyrics))
  if (withSynced) return pickLyrics(withSynced)
  const withPlain = candidates.find((r) => hasText(r.plainLyrics))
  if (withPlain) return pickLyrics(withPlain)
  return null
}

/**
 * Busca letras en LRCLIB: primero /api/get (coincidencia exacta) y después
 * /api/search como respaldo. Devuelve null si no hay resultados; los errores
 * de red sí se propagan (el orquestador decide qué hacer con ellos).
 */
export async function fetchLrclibLyrics(params: LrclibParams): Promise<LrclibLyrics | null> {
  // 1) /api/get — coincidencia exacta
  const getParams: Record<string, string> = {
    track_name: params.title,
    artist_name: params.artist
  }
  if (params.album) getParams.album_name = params.album
  if (params.durationSec !== undefined) getParams.duration = String(Math.round(params.durationSec))
  const exact = (await request('get', getParams)) as LrclibTrack | null
  if (exact) {
    const lyrics = pickLyrics(exact)
    if (lyrics) return lyrics
  }

  // 2) /api/search — con track_name/artist_name y, si no hay nada, con q=
  let results = (await request('search', {
    track_name: params.title,
    artist_name: params.artist
  })) as LrclibTrack[] | null
  if (!Array.isArray(results) || results.length === 0) {
    results = (await request('search', {
      q: `${params.artist} ${params.title}`.trim()
    })) as LrclibTrack[] | null
  }
  if (!Array.isArray(results) || results.length === 0) return null

  return pickBest(results, params.durationSec)
}
