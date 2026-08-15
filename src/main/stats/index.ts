import { readHistoryWithMeta } from '../db'
import { getAllSettings } from '../settings'
import type {
  ArtistStats,
  RecapData,
  StatsPeriod,
  TrackStats,
  TrackSummary
} from '@shared/types'

/**
 * F31 · Agregaciones sobre el historial local (SQLite).
 *
 * El esquema `history` guarda UNA fila por videoId con la última fecha de
 * reproducción y un `play_count` global. Eso limita la precisión temporal
 * (ver `readHistoryWithMeta`): filtrar por período usa `played_at` como
 * proxy, y `play_count` refleja SIEMPRE el total histórico de esa pista.
 * Es una aproximación pragmática — para "top mensual/semanal" funciona
 * porque solo consideramos pistas escuchadas dentro del período.
 */

// ---------- Períodos ----------

/** Inicio de la semana actual (lunes 00:00, hora local). */
export function periodOfWeek(now = Date.now()): StatsPeriod {
  const d = new Date(now)
  // Lunes como primer día (ISO 8601). getDay() devuelve 0=domingo…6=sábado.
  const dow = (d.getDay() + 6) % 7 // 0=lunes…6=domingo
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow, 0, 0, 0, 0)
  return { start: start.getTime(), end: now }
}

/** Inicio del mes actual (día 1, 00:00 hora local). */
export function periodOfMonth(now = Date.now()): StatsPeriod {
  const d = new Date(now)
  const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0)
  return { start: start.getTime(), end: now }
}

/** Últimos N días naturales terminando en `now`. */
export function periodOfLastNDays(days: number, now = Date.now()): StatsPeriod {
  const safeDays = Math.max(1, Math.floor(days))
  return { start: now - safeDays * 24 * 60 * 60 * 1000, end: now }
}

// ---------- Utilidades internas ----------

function isTrackSummary(x: unknown): x is TrackSummary {
  return (
    !!x &&
    typeof x === 'object' &&
    typeof (x as { videoId?: unknown }).videoId === 'string'
  )
}

/**
 * Lee el historial completo (hasta `historyMaxEntries`) y filtra por período.
 * Devuelve las entradas con su meta ya parseadas.
 */
function readInPeriod(period: StatsPeriod): {
  track: TrackSummary
  playedAt: number
  playCount: number
}[] {
  const cap = getAllSettings().historyMaxEntries ?? 500
  const rows = readHistoryWithMeta(cap)
  const out: { track: TrackSummary; playedAt: number; playCount: number }[] = []
  for (const r of rows) {
    if (!isTrackSummary(r.track)) continue
    if (r.playedAt < period.start || r.playedAt > period.end) continue
    out.push({ track: r.track, playedAt: r.playedAt, playCount: r.playCount })
  }
  return out
}

// ---------- Agregaciones ----------

/**
 * Top N canciones más escuchadas en el período. Si `topN` viene indefinido
 * usa `settings.wrappedTopN`.
 */
export function computeTopTracks(period: StatsPeriod, topN?: number): TrackStats[] {
  const rows = readInPeriod(period)
  const cap = Math.max(1, Math.floor(topN ?? getAllSettings().wrappedTopN ?? 50))
  const out: TrackStats[] = rows.map((r) => {
    const artistsText = (r.track.artists ?? []).map((a) => a.name).join(', ')
    const durSec = r.track.durationSec ?? 0
    return {
      videoId: r.track.videoId,
      title: r.track.title ?? r.track.videoId,
      artists: artistsText,
      thumbnailUrl: r.track.thumbnailUrl,
      playCount: r.playCount,
      totalSec: durSec * r.playCount
    }
  })
  out.sort((a, b) => b.playCount - a.playCount || b.totalSec - a.totalSec)
  return out.slice(0, cap)
}

/** Top N artistas más escuchados en el período (colaboraciones cuentan a cada uno). */
export function computeTopArtists(period: StatsPeriod, topN?: number): ArtistStats[] {
  const rows = readInPeriod(period)
  const cap = Math.max(1, Math.floor(topN ?? getAllSettings().wrappedTopN ?? 50))
  const acc = new Map<string, ArtistStats>()
  for (const r of rows) {
    const durSec = r.track.durationSec ?? 0
    for (const a of r.track.artists ?? []) {
      const name = (a?.name ?? '').trim()
      if (!name) continue
      const key = name.toLowerCase()
      const prev = acc.get(key) ?? { name, playCount: 0, totalSec: 0 }
      prev.playCount += r.playCount
      prev.totalSec += durSec * r.playCount
      // Preferimos la primera forma vista del nombre (case original).
      if (!acc.has(key)) prev.name = name
      acc.set(key, prev)
    }
  }
  const out = Array.from(acc.values())
  out.sort((a, b) => b.playCount - a.playCount || b.totalSec - a.totalSec)
  return out.slice(0, cap)
}

/**
 * Resumen tipo Wrapped de los últimos 30 días: horas totales, pistas
 * y artistas únicos, top 10 de canciones y top 5 de artistas.
 */
export function computeRecap(days = 30): RecapData {
  const period = periodOfLastNDays(days)
  const rows = readInPeriod(period)
  let totalSec = 0
  const uniqueVideoIds = new Set<string>()
  const uniqueArtistKeys = new Set<string>()
  for (const r of rows) {
    const durSec = r.track.durationSec ?? 0
    totalSec += durSec * r.playCount
    uniqueVideoIds.add(r.track.videoId)
    for (const a of r.track.artists ?? []) {
      const name = (a?.name ?? '').trim().toLowerCase()
      if (name) uniqueArtistKeys.add(name)
    }
  }
  return {
    period,
    hoursListened: Math.round((totalSec / 3600) * 10) / 10,
    uniqueTracks: uniqueVideoIds.size,
    uniqueArtists: uniqueArtistKeys.size,
    topTracks: computeTopTracks(period, 10),
    topArtists: computeTopArtists(period, 5)
  }
}
