import { getArtist, getUpNext } from './api'
import type {
  DiscoverySurpriseResult,
  ProfileArtistRef,
  SpiralTrack,
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

/** Parsea strings de suscriptores de InnerTube: "1.2M", "100K", "1,234 subscribers" → número. */
function parseSubscriberCount(raw?: string | null): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/[,\s]/g, '').replace(/subscribers?/i, '').trim()
  const match = cleaned.match(/^([\d.]+)\s*([KkMmBb])?$/)
  if (!match) return null
  const num = parseFloat(match[1])
  if (isNaN(num)) return null
  const multiplier = { k: 1_000, m: 1_000_000, b: 1_000_000_000 }[match[2]?.toLowerCase() ?? ''] ?? 1
  return Math.round(num * multiplier)
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

/**
 * F80 · Espiral Musical — ~60 pistas únicas para el scroll infinito de la Home.
 *
 * SOLO música nueva: nada de lo que el usuario ya conoce (liked, playlists
 * propias, historial) ni de artistas que ya escucha. Los liked y los artistas
 * favoritos se usan únicamente como SEMILLAS para `getUpNext` — nunca entran
 * en el resultado.
 *
 * Dos niveles de descubrimiento:
 *   · Nivel 1: `getUpNext` sobre semillas del gusto del usuario → `isMatch`
 *     ("Para ti": se alinea con su gusto pero NO lo conoce).
 *   · Nivel 2: `getUpNext` sobre pistas descubiertas en el nivel 1 →
 *     candidatos a `isSmallArtist`; solo se marca tras verificar con
 *     `getArtist` que el artista tiene < 100k suscriptores.
 *
 * Deduplicado por videoId Y por artista principal (cada artista aparece como
 * mucho 1 vez). Mínimo 10 semillas distintas, presupuesto global de 18 s.
 */
export async function getSpiralTracks(
  favoriteArtists: ProfileArtistRef[],
  likedTracks: TrackSummary[],
  userPlaylistTracks: TrackSummary[],
  historyTracks: TrackSummary[],
  homeVideoIds: string[],
  targetSize = 60
): Promise<SpiralTrack[]> {
  const startedAt = Date.now()
  const budgetMs = 18_000
  const remaining = (): number => Math.max(500, budgetMs - (Date.now() - startedAt))
  const outOfBudget = (): boolean => Date.now() - startedAt > budgetMs

  const normArtist = (name?: string | null): string => name?.toLowerCase().trim() ?? ''

  // ---- Blacklist: TODO lo que el usuario ya conoce ----
  const knownTracks: TrackSummary[] = [
    ...(likedTracks ?? []),
    ...(userPlaylistTracks ?? []),
    ...(historyTracks ?? [])
  ]

  const knownVideoIds = new Set<string>()
  for (const t of knownTracks) {
    if (t?.videoId) knownVideoIds.add(t.videoId)
  }
  for (const id of homeVideoIds ?? []) {
    if (id) knownVideoIds.add(id)
  }

  const knownArtistNames = new Set<string>()
  for (const a of favoriteArtists ?? []) {
    const n = normArtist(a?.name)
    if (n) knownArtistNames.add(n)
  }
  for (const t of knownTracks) {
    for (const a of t?.artists ?? []) {
      const n = normArtist(a?.name)
      if (n) knownArtistNames.add(n)
    }
  }

  /** `true` si la pista es conocida: videoId en blacklist o algún artista conocido. */
  const isKnown = (t: TrackSummary): boolean => {
    if (!t?.videoId || knownVideoIds.has(t.videoId)) return true
    for (const a of t.artists ?? []) {
      const n = normArtist(a?.name)
      if (n && knownArtistNames.has(n)) return true
    }
    return false
  }

  // ---- Resultado con dedupe por videoId y por artista principal ----
  const seenVideoIds = new Set<string>()
  const seenArtistNames = new Set<string>()
  const result: SpiralTrack[] = []

  /** Añade la pista si es nueva de verdad y no repite videoId/artista. */
  const tryAdd = (t: TrackSummary, secondLevel: boolean): boolean => {
    if (result.length >= targetSize) return false
    if (isKnown(t)) return false
    if (seenVideoIds.has(t.videoId)) return false
    const primary = normArtist(t.artists?.[0]?.name)
    if (primary && seenArtistNames.has(primary)) return false
    seenVideoIds.add(t.videoId)
    if (primary) seenArtistNames.add(primary)
    result.push({
      ...t,
      isMatch: !secondLevel,
      isSmallArtist: false // se verifica después con getArtist
    })
    return true
  }

  // ---- Semillas de primer nivel: liked + tops de artistas favoritos ----
  // Nunca entran en el resultado (están en la blacklist); solo alimentan getUpNext.
  const seedIds: string[] = shuffle(
    (likedTracks ?? [])
      .map((t) => t?.videoId)
      .filter((id): id is string => Boolean(id))
  )
  for (const artist of shuffle([...(favoriteArtists ?? [])]).slice(0, 3)) {
    if (outOfBudget()) break
    if (!artist?.id) continue
    const res = await withTimeout(getArtist(artist.id), Math.min(4_000, remaining()))
    if (!res) continue
    const artistSeedIds = extractTracksFromArtist(res.shelves)
      .map((t) => t.videoId)
      .filter((id): id is string => Boolean(id))
    seedIds.push(...shuffle(artistSeedIds).slice(0, 3))
  }

  // Reservamos parte del target para el segundo nivel; si luego no llega,
  // el propio nivel 1 rellena el hueco.
  const firstLevelCap = Math.ceil(targetSize * 0.6)
  const minSeeds = 10
  const usedSeeds = new Set<string>()
  /** Pistas de nivel 1 que pasan el filtro — pool de semillas para el nivel 2 y de relleno. */
  const firstLevelPool: TrackSummary[] = []

  for (const seed of seedIds) {
    if (outOfBudget()) break
    if (!seed || usedSeeds.has(seed)) continue
    // Solo paramos antes de agotar semillas si ya usamos el mínimo Y el nivel 1 está lleno
    if (usedSeeds.size >= minSeeds && result.length >= firstLevelCap) break
    usedSeeds.add(seed)
    const res = await withTimeout(getUpNext(seed), Math.min(3_500, remaining()))
    if (!res?.tracks?.length) continue
    for (const t of res.tracks) {
      if (!t?.videoId || t.videoId === seed) continue
      if (isKnown(t)) continue
      firstLevelPool.push(t)
      if (result.length < firstLevelCap) tryAdd(t, false)
    }
  }

  // ---- Segundo nivel: getUpNext sobre lo descubierto (más lejos del gusto) ----
  const secondSeedIds = shuffle(
    dedupeByVideoId(firstLevelPool).map((t) => t.videoId)
  )
  for (const seed of secondSeedIds) {
    if (outOfBudget()) break
    if (result.length >= targetSize) break
    if (usedSeeds.has(seed)) continue
    usedSeeds.add(seed)
    const res = await withTimeout(getUpNext(seed), Math.min(3_500, remaining()))
    if (!res?.tracks?.length) continue
    for (const t of res.tracks) {
      if (!t?.videoId || t.videoId === seed) continue
      tryAdd(t, true)
    }
  }

  // ---- Verificación de "artista nuevo": solo < 100k subs ----
  const artistsToCheck = new Map<string, SpiralTrack[]>()
  for (const t of result) {
    if (!t.isMatch && !t.isSmallArtist) {
      // Candidatos de nivel 2 (aún no marcados)
      const artistId = t.artists?.[0]?.id
      if (artistId) {
        const existing = artistsToCheck.get(artistId) ?? []
        existing.push(t)
        artistsToCheck.set(artistId, existing)
      }
    }
  }

  // Verificamos como máximo 8 artistas dentro del presupuesto
  let checked = 0
  for (const [artistId, tracks] of artistsToCheck) {
    if (outOfBudget() || checked >= 8) break
    checked++
    const artistInfo = await withTimeout(getArtist(artistId), Math.min(3_000, remaining()))
    if (!artistInfo) continue
    const subs = parseSubscriberCount(artistInfo.subscribers)
    if (subs !== null && subs < 100_000) {
      for (const t of tracks) {
        t.isSmallArtist = true
      }
    }
  }

  // ---- Relleno: si el nivel 2 no llegó, tiramos del pool sobrante del nivel 1 ----
  if (result.length < targetSize) {
    for (const t of shuffle([...firstLevelPool])) {
      if (result.length >= targetSize) break
      tryAdd(t, false)
    }
  }

  return shuffle(result).slice(0, targetSize)
}
