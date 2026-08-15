/**
 * Resolución de géneros por artista (F23).
 *
 * Fuente: Last.fm `artist.getTopTags`. Documento explícitamente que la API key
 * usada aquí es la key pública de ejemplo que aparece en toda la documentación
 * de Last.fm — sirve para lookups de tags básicos sin registrarse. No se
 * distribuye ninguna credencial propia.
 *
 * Estrategia:
 *  1. Se recolectan los artistas únicos de la lista de pistas.
 *  2. Para cada artista se consulta primero la caché SQLite (`artist_tags`).
 *  3. Los artistas sin caché se consultan a Last.fm en paralelo con
 *     concurrencia máxima de 4 y timeout individual de 4 s.
 *  4. Se aplica `bucketize()` para mapear los tags crudos a nuestra taxonomía
 *     fija (14 buckets + `Sin género`).
 *
 * El módulo NO conoce nada del renderer: devuelve un mapa
 * `videoId → géneros[]` que la UI usa para pintar chips y filtrar.
 */

import type { TrackSummary } from '@shared/types'
import { artistTagKey, getArtistTags, setArtistTags } from '../db'

/** Key de ejemplo pública documentada por Last.fm (no es una key privada). */
const LASTFM_API_KEY = 'b25b959554ed76058ac220b7b2e0a026'
const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/'
const FETCH_TIMEOUT_MS = 4_000
const MAX_CONCURRENCY = 4
/** Cuántos tags máximo guardamos por artista (el top-N de Last.fm). */
const TAG_LIMIT = 10

/**
 * Taxonomía fija de buckets. Cada canción hereda TODOS los buckets cuyos
 * regex matcheen alguno de los tags crudos del artista. Si no encaja en
 * ninguno, la canción va al bucket `Sin género`.
 *
 * IMPORTANTE: mantener la lista estable — el localStorage de la UI recuerda
 * el bucket activo por nombre. Cambiar un nombre = perder la selección
 * memorizada, pero no es crítico.
 */
export interface Bucket {
  name: string
  match: RegExp
}

export const BUCKETS: Bucket[] = [
  { name: 'Rock', match: /\brock|indie rock|alternative|punk|garage\b/i },
  { name: 'Pop', match: /\bpop\b|synthpop|electropop|dance pop/i },
  { name: 'Rap', match: /\brap|hip.?hop|trap\b/i },
  { name: 'Dance', match: /\b(dance|edm|house|techno|club|electro)\b/i },
  {
    name: 'Latina',
    match: /\blatin|latino|reggaeton|salsa|bachata|cumbia|latin pop\b/i
  },
  { name: 'Chill', match: /\bchill|lofi|lo.?fi|ambient|downtempo\b/i },
  { name: 'Amor', match: /\bromantic|love|romance|balada\b/i },
  { name: 'Disco', match: /\bdisco|funk|soul|groove\b/i },
  { name: 'Metal', match: /\bmetal|hardcore|thrash\b/i },
  { name: 'Nostalgia', match: /\bclassic|retro|nostalgia|80s|90s|70s|60s\b/i },
  { name: 'R&B', match: /\br.?n.?b|rhythm.?and.?blues\b/i },
  { name: 'Jazz', match: /\bjazz|bebop|swing\b/i },
  { name: 'Electrónica', match: /\belectronic|electronica|idm|synth\b/i }
]

/** Etiqueta de "sin bucket asignado" — chip que aparece siempre si hay canciones sin género. */
export const NO_GENRE = 'Sin género'

/**
 * Aplica la taxonomía a un conjunto de tags. Devuelve el conjunto (posible
 * multipertenencia) de buckets que matchean. Si ninguno lo hace se devuelve
 * un array vacío — el llamador decide si asigna `Sin género`.
 */
export function bucketize(tags: string[]): string[] {
  const out = new Set<string>()
  for (const raw of tags) {
    if (!raw) continue
    for (const b of BUCKETS) {
      if (b.match.test(raw)) out.add(b.name)
    }
  }
  return [...out]
}

/** Resultado del IPC `genre:resolve`. */
export interface GenreResolveResult {
  /** videoId → géneros a los que pertenece la canción. Siempre contiene ≥1 género (fallback `Sin género`). */
  tracksToGenres: Record<string, string[]>
  /** Buckets únicos presentes en la lista (para pintar solo chips útiles). */
  availableGenres: string[]
}

/** Descarga los top tags de un artista en Last.fm; devuelve `[]` en cualquier fallo. */
async function fetchLastFmTags(name: string): Promise<string[]> {
  const url = new URL(LASTFM_BASE)
  url.searchParams.set('method', 'artist.gettoptags')
  url.searchParams.set('artist', name)
  url.searchParams.set('api_key', LASTFM_API_KEY)
  url.searchParams.set('format', 'json')
  url.searchParams.set('autocorrect', '1')
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MetrolistPC/0.1' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    })
    if (!res.ok) return []
    const json = (await res.json()) as {
      toptags?: { tag?: Array<{ name?: string; count?: number }> }
      error?: number
    }
    if (json?.error) return []
    const raw = json?.toptags?.tag ?? []
    const tags: string[] = []
    for (const t of raw) {
      const n = typeof t?.name === 'string' ? t.name.trim() : ''
      if (n) tags.push(n)
      if (tags.length >= TAG_LIMIT) break
    }
    return tags
  } catch {
    // Timeout, DNS, red o JSON inválido: sin tags.
    return []
  }
}

/**
 * Ejecuta N promesas con concurrencia limitada. Devuelve el mismo array
 * ordenado que la entrada.
 */
async function withConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (cursor < items.length) {
      const idx = cursor++
      results[idx] = await worker(items[idx])
    }
  })
  await Promise.all(runners)
  return results
}

/**
 * Resuelve los géneros de todas las pistas de la lista. Consulta la caché
 * y, para los artistas sin cachear, dispara Last.fm en paralelo.
 *
 * Devuelve un mapa videoId→géneros y la lista de géneros presentes (sin
 * duplicados) para pintar solo los chips que aporten algo.
 */
export async function resolveGenresForTracks(
  tracks: TrackSummary[]
): Promise<GenreResolveResult> {
  // 1. Extrae artistas únicos (por clave normalizada) manteniendo el
  //    primer nombre "bonito" con el que aparecen.
  const artistNameByKey = new Map<string, string>()
  for (const t of tracks) {
    for (const a of t.artists) {
      const key = artistTagKey(a.name)
      if (!key) continue
      if (!artistNameByKey.has(key)) artistNameByKey.set(key, a.name)
    }
  }

  // 2. Separa cache-hit vs cache-miss.
  const cached = new Map<string, string[]>() // clave → tags crudos
  const missing: { key: string; name: string }[] = []
  for (const [key, name] of artistNameByKey) {
    const hit = getArtistTags(name)
    if (hit) cached.set(key, hit.tags)
    else missing.push({ key, name })
  }

  // 3. Descarga los que faltan con concurrencia limitada.
  if (missing.length) {
    const fetched = await withConcurrency(missing, MAX_CONCURRENCY, async (m) => {
      const tags = await fetchLastFmTags(m.name)
      // Guarda incluso si vino vacío — así no reintentamos en cada apertura
      // (el TTL implícito lo controlaría un futuro F31).
      setArtistTags(m.name, tags)
      return { key: m.key, tags }
    })
    for (const f of fetched) cached.set(f.key, f.tags)
  }

  // 4. Convierte tags crudos → buckets por artista.
  const bucketsByKey = new Map<string, string[]>()
  for (const [key, tags] of cached) bucketsByKey.set(key, bucketize(tags))

  // 5. Mapea cada canción a la unión de buckets de sus artistas.
  const tracksToGenres: Record<string, string[]> = {}
  const seenGenres = new Set<string>()
  for (const t of tracks) {
    const set = new Set<string>()
    for (const a of t.artists) {
      const key = artistTagKey(a.name)
      if (!key) continue
      const buckets = bucketsByKey.get(key)
      if (buckets) for (const b of buckets) set.add(b)
    }
    const list = [...set]
    if (list.length === 0) {
      // Fallback obligatorio para no dejar canciones invisibles al filtrar.
      list.push(NO_GENRE)
    }
    tracksToGenres[t.videoId] = list
    for (const g of list) seenGenres.add(g)
  }

  // Orden: mantenemos el orden de BUCKETS para consistencia visual y `Sin género` al final.
  const ordered: string[] = []
  for (const b of BUCKETS) if (seenGenres.has(b.name)) ordered.push(b.name)
  if (seenGenres.has(NO_GENRE)) ordered.push(NO_GENRE)

  return { tracksToGenres, availableGenres: ordered }
}
