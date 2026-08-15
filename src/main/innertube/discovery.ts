import { getArtist, getUpNext } from './api'
import type {
  DiscoverySurpriseResult,
  ProfileArtistRef,
  TrackSummary
} from '@shared/types'

/**
 * F24 · Descubrimiento personalizado para la Home.
 *
 * - `getSurpriseTrack` → una única canción para el botón "Sorpréndeme": pesca
 *   aleatoria de un artista favorito o, si no hay, de un `getUpNext` semilla
 *   sobre una canción con "Me gusta".
 * - `getPersonalMixTracks` → cola de ~25 canciones mezclando favoritas, top
 *   de artistas favoritos y descubrimiento (`getUpNext`) sobre varias
 *   semillas. Con timeout global para no bloquear la UI si YT tarda.
 *
 * Todo el módulo es defensivo: cualquier fallo devuelve `null` / lista vacía
 * en vez de propagar la excepción — la Home tiene que seguir viva pase lo que
 * pase.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Alias local para el tipo compartido — evita import largo en el resto del módulo. */
export type SurpriseResult = DiscoverySurpriseResult

function pick<T>(arr: T[]): T | null {
  if (!arr?.length) return null
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * Recorre las estanterías del artista en busca de canciones/vídeos
 * reproducibles. La estructura de `getArtist` es la misma que usa el mapper
 * de home, así que los items ya vienen con `videoId` cuando son reproducibles.
 */
function extractTracksFromArtist(artistShelves: any[]): TrackSummary[] {
  const out: TrackSummary[] = []
  for (const shelf of artistShelves ?? []) {
    for (const item of shelf?.items ?? []) {
      if (item?.kind === 'song' || item?.kind === 'video') {
        out.push({
          kind: item.kind === 'video' ? 'video' : 'song',
          videoId: item.id,
          title: item.title,
          artists: item.subtitle ? [{ name: item.subtitle }] : [],
          thumbnailUrl: item.thumbnailUrl
        })
      }
    }
  }
  return out
}

/**
 * Semilla → una canción sorpresa. Estrategia (best-effort, no lanza):
 *  1) Si hay artistas favoritos, elegimos uno al azar y muestreamos una pista
 *     de sus estanterías (top songs, videos musicales…).
 *  2) Si el artista no aportó nada (o no había favoritos), caemos en
 *     `getUpNext` con un liked al azar y devolvemos una pista de la radio,
 *     evitando la propia semilla.
 *  3) Si todo falla, `null` — la UI dará un aviso y llevará a Perfil.
 */
export async function getSurpriseTrack(
  favoriteArtists: ProfileArtistRef[],
  likedVideoIds: string[]
): Promise<SurpriseResult | null> {
  // 1) Vía artista favorito
  const seedArtist = pick(favoriteArtists ?? [])
  if (seedArtist?.id) {
    try {
      const artist = await getArtist(seedArtist.id)
      const tracks = extractTracksFromArtist(artist.shelves)
      const track = pick(tracks)
      if (track) {
        return { track, reason: `Porque escuchas a ${artist.name || seedArtist.name}` }
      }
    } catch {
      /* seguimos con la ruta de radio */
    }
  }

  // 2) Vía radio de un liked
  const seedVideoId = pick(likedVideoIds ?? [])
  if (seedVideoId) {
    try {
      const upNext = await getUpNext(seedVideoId)
      const candidates = (upNext.tracks ?? []).filter((t) => t.videoId !== seedVideoId)
      const track = pick(candidates) ?? pick(upNext.tracks ?? [])
      if (track) {
        // Nombre del artista para el mensaje ("Radio de {alguien}").
        const who = track.artists?.[0]?.name?.trim() || 'tu biblioteca'
        return { track, reason: `Radio de ${who}` }
      }
    } catch {
      /* último recurso: null */
    }
  }

  return null
}

/**
 * Deduplica preservando el orden. Ignora entradas sin `videoId`.
 */
function dedupeByVideoId(tracks: TrackSummary[]): TrackSummary[] {
  const seen = new Set<string>()
  const out: TrackSummary[] = []
  for (const t of tracks) {
    if (!t?.videoId || seen.has(t.videoId)) continue
    seen.add(t.videoId)
    out.push(t)
  }
  return out
}

/** Baraja "in place" (Fisher–Yates). Devuelve el mismo array para encadenar. */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Envuelve una promesa con un timeout: si se cumple, devuelve `null`. Nunca
 * lanza — así podemos correr varias en paralelo con `Promise.all` sin miedo
 * a que una lenta tire abajo todo el mix.
 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    p.then((v) => {
      clearTimeout(timer)
      resolve(v)
    }).catch(() => {
      clearTimeout(timer)
      resolve(null)
    })
  })
}

/**
 * Mix Personal — 25 canciones (por defecto) mezclando:
 *   · 40 % favoritas (canciones de la playlist LM del usuario)
 *   · 30 % top de artistas favoritos
 *   · 30 % descubrimiento (`getUpNext` sobre semillas variadas)
 *
 * El objetivo es tener cola completa YA — sacrificamos exactitud de %
 * antes que hacer esperar al usuario. Timeout global de 12 s: si la red va
 * lenta, devolvemos lo que tengamos aunque no llegue al `targetSize`.
 *
 * `likedTracks` puede ser `undefined` si el llamador solo tiene ids; en ese
 * caso las favoritas se tratan como semillas para `getUpNext`, no como
 * pistas directas.
 */
export async function getPersonalMixTracks(
  favoriteArtists: ProfileArtistRef[],
  likedTracks: TrackSummary[],
  targetSize = 25
): Promise<TrackSummary[]> {
  const startedAt = Date.now()
  const budgetMs = 12_000
  const remaining = (): number => Math.max(500, budgetMs - (Date.now() - startedAt))

  // ---- 40 %: canciones favoritas ----
  const favBucket = shuffle([...(likedTracks ?? [])]).slice(0, Math.ceil(targetSize * 0.4))

  // ---- 30 %: top de artistas favoritos ----
  const artistBucketTarget = Math.ceil(targetSize * 0.3)
  const artistBucket: TrackSummary[] = []
  const shuffledArtists = shuffle([...(favoriteArtists ?? [])])
  // Como mucho 3 artistas — más son latencia sin aportar variedad extra
  for (const artist of shuffledArtists.slice(0, 3)) {
    if (Date.now() - startedAt > budgetMs) break
    const res = await withTimeout(getArtist(artist.id), Math.min(4_000, remaining()))
    if (!res) continue
    const tracks = extractTracksFromArtist(res.shelves)
    // 2–4 por artista, aleatorio, para que no salga siempre el mismo hit
    const take = Math.max(2, Math.floor(artistBucketTarget / Math.max(1, shuffledArtists.length)))
    artistBucket.push(...shuffle(tracks).slice(0, Math.min(4, take)))
    if (artistBucket.length >= artistBucketTarget) break
  }

  // ---- 30 %: descubrimiento vía getUpNext sobre varias semillas ----
  const discoveryTarget = Math.ceil(targetSize * 0.3)
  const seedPool = shuffle([
    ...(likedTracks ?? []).map((t) => t.videoId),
    ...artistBucket.map((t) => t.videoId)
  ])
  const seenSeeds = new Set<string>()
  const discovery: TrackSummary[] = []
  for (const seed of seedPool) {
    if (Date.now() - startedAt > budgetMs) break
    if (!seed || seenSeeds.has(seed)) continue
    seenSeeds.add(seed)
    if (seenSeeds.size > 5) break // límite duro: 5 semillas distintas
    const res = await withTimeout(getUpNext(seed), Math.min(3_500, remaining()))
    if (!res?.tracks?.length) continue
    // Nos quedamos con las 4 primeras de cada semilla — suele mezclar bien
    discovery.push(...res.tracks.slice(0, 4))
    if (discovery.length >= discoveryTarget) break
  }

  // Combinamos con la proporción pedida, luego rellenamos si nos hemos quedado cortos
  const combined = dedupeByVideoId([
    ...favBucket,
    ...shuffle(artistBucket),
    ...shuffle(discovery)
  ])

  // ---- Relleno iterativo si no llegamos al tamaño objetivo ----
  if (combined.length < targetSize) {
    const seedFallback = shuffle(combined.map((t) => t.videoId)).slice(0, 5)
    for (const seed of seedFallback) {
      if (Date.now() - startedAt > budgetMs) break
      if (combined.length >= targetSize) break
      const res = await withTimeout(getUpNext(seed), Math.min(3_000, remaining()))
      if (!res?.tracks?.length) continue
      for (const t of res.tracks) {
        if (combined.length >= targetSize) break
        if (!combined.find((c) => c.videoId === t.videoId)) combined.push(t)
      }
    }
  }

  // Mezcla final para que no queden todas las favoritas al principio
  return shuffle(combined).slice(0, targetSize)
}
