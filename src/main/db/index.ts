import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import type { PlaylistOverride } from '@shared/types'

/**
 * Persistencia local con el SQLite integrado de Node 24 (sin módulos nativos).
 * - library_cache: instantánea de la biblioteca por sección (arranque rápido y offline)
 * - history: historial de reproducción local
 * - settings: ajustes de la app (JSON por clave)
 */

let db: DatabaseSync | null = null

export function getDb(): DatabaseSync {
  if (db) return db
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  // F63 · El FICHERO conserva su nombre histórico `metrolist.db` a propósito
  // (rebranding v1.2.0): la migración de userData mueve la carpeta entera y
  // renombrar también la BD (+WAL/SHM) sería otro punto de fallo sin ganancia
  // — el nombre no se ve en ninguna UI. Solo cambió la carpeta contenedora.
  db = new DatabaseSync(join(dir, 'metrolist.db'))
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS library_cache (
      section TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS history (
      video_id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      played_at INTEGER NOT NULL,
      play_count INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS downloads (
      video_id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      file_path TEXT NOT NULL,
      downloaded_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS playlist_overrides (
      id TEXT PRIMARY KEY,
      title TEXT,
      thumbnail_data_url TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS artist_tags (
      artist_key TEXT PRIMARY KEY,
      tags_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS artist_thumbs (
      artist_id TEXT PRIMARY KEY,
      thumbnail_url TEXT,
      updated_at INTEGER NOT NULL
    );
  `)
  return db
}

// ---------- Caché de biblioteca ----------

export function cacheLibrarySection(section: string, data: unknown): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO library_cache (section, json, updated_at) VALUES (?, ?, ?)')
    .run(section, JSON.stringify(data), Date.now())
}

export function readLibrarySection<T>(section: string): { data: T; updatedAt: number } | null {
  const row = getDb()
    .prepare('SELECT json, updated_at FROM library_cache WHERE section = ?')
    .get(section) as { json: string; updated_at: number } | undefined
  if (!row) return null
  try {
    return { data: JSON.parse(row.json) as T, updatedAt: row.updated_at }
  } catch {
    return null
  }
}

// ---------- Historial ----------

export function recordPlay(videoId: string, trackJson: unknown, maxEntries?: number): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO history (video_id, json, played_at, play_count) VALUES (?, ?, ?, 1)
     ON CONFLICT(video_id) DO UPDATE SET json = excluded.json, played_at = excluded.played_at,
     play_count = history.play_count + 1`
  ).run(videoId, JSON.stringify(trackJson), Date.now())
  // F27 · aplica el techo del historial: si supera el máximo, elimina las
  // entradas más antiguas por `played_at`. Rango 100-5000; 0/undefined = sin límite.
  if (typeof maxEntries === 'number' && maxEntries > 0) {
    const cap = Math.max(100, Math.min(5000, Math.floor(maxEntries)))
    const row = db.prepare('SELECT COUNT(*) AS c FROM history').get() as { c: number }
    if (row.c > cap) {
      db.prepare(
        `DELETE FROM history WHERE video_id IN (
           SELECT video_id FROM history ORDER BY played_at ASC LIMIT ?
         )`
      ).run(row.c - cap)
    }
  }
}

export function readHistory(limit = 100): unknown[] {
  const rows = getDb()
    .prepare('SELECT json FROM history ORDER BY played_at DESC LIMIT ?')
    .all(limit) as { json: string }[]
  const out: unknown[] = []
  for (const r of rows) {
    try {
      out.push(JSON.parse(r.json))
    } catch {
      /* fila corrupta: ignorar */
    }
  }
  return out
}

/**
 * F31 · Historial con metadatos (para agregaciones estadísticas).
 * Devuelve el track parseado + `playedAt` (última reproducción, ms epoch) +
 * `playCount` (contador acumulado global). Ordenado por `playedAt` desc.
 *
 * Limitación conocida: como solo guardamos una fila por videoId con el
 * timestamp de la ÚLTIMA reproducción, filtrar por período usa esa fecha
 * como proxy; una canción muy escuchada hace un año que se volvió a poner
 * dentro del período cuenta con TODO su play_count. Es una aproximación
 * pragmática que evita duplicar filas por cada play.
 */
export function readHistoryWithMeta(
  limit = 500
): { track: unknown; playedAt: number; playCount: number }[] {
  const rows = getDb()
    .prepare('SELECT json, played_at, play_count FROM history ORDER BY played_at DESC LIMIT ?')
    .all(limit) as { json: string; played_at: number; play_count: number }[]
  const out: { track: unknown; playedAt: number; playCount: number }[] = []
  for (const r of rows) {
    try {
      out.push({
        track: JSON.parse(r.json),
        playedAt: r.played_at,
        playCount: r.play_count
      })
    } catch {
      /* fila corrupta: ignorar */
    }
  }
  return out
}

// ---------- Ajustes ----------

export function getSetting<T>(key: string, fallback: T): T {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  if (!row) return fallback
  try {
    return JSON.parse(row.value) as T
  } catch {
    return fallback
  }
}

export function setSetting(key: string, value: unknown): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run(key, JSON.stringify(value))
}

// ---------- Descargas ----------

export interface DownloadRow {
  videoId: string
  json: string
  filePath: string
  downloadedAt: number
}

export function recordDownload(videoId: string, trackJson: unknown, filePath: string): void {
  getDb()
    .prepare(
      'INSERT OR REPLACE INTO downloads (video_id, json, file_path, downloaded_at) VALUES (?, ?, ?, ?)'
    )
    .run(videoId, JSON.stringify(trackJson), filePath, Date.now())
}

export function removeDownload(videoId: string): void {
  getDb().prepare('DELETE FROM downloads WHERE video_id = ?').run(videoId)
}

export function readDownloads(): { track: unknown; filePath: string }[] {
  const rows = getDb()
    .prepare('SELECT json, file_path FROM downloads ORDER BY downloaded_at DESC')
    .all() as { json: string; file_path: string }[]
  const out: { track: unknown; filePath: string }[] = []
  for (const r of rows) {
    try {
      out.push({ track: JSON.parse(r.json), filePath: r.file_path })
    } catch {
      /* ignorar */
    }
  }
  return out
}

export function getDownloadPath(videoId: string): string | null {
  const row = getDb()
    .prepare('SELECT file_path FROM downloads WHERE video_id = ?')
    .get(videoId) as { file_path: string } | undefined
  return row?.file_path ?? null
}

// ---------- Overrides locales de playlist (F22) ----------
//
// YouTube Music no expone endpoint público para cambiar la carátula (y setName
// no siempre está disponible), así que guardamos aquí un mini-parche: si el
// usuario cambia título/carátula, cualquier vista posterior (sidebar,
// cabecera, cards, cola) lo aplica encima de lo que devuelve el backend.

function rowToOverride(
  row: { id: string; title: string | null; thumbnail_data_url: string | null; updated_at: number } | undefined
): PlaylistOverride | null {
  if (!row) return null
  return {
    id: row.id,
    title: row.title ?? undefined,
    thumbnailDataUrl: row.thumbnail_data_url ?? undefined,
    updatedAt: row.updated_at
  }
}

export function getPlaylistOverride(id: string): PlaylistOverride | null {
  const row = getDb()
    .prepare('SELECT id, title, thumbnail_data_url, updated_at FROM playlist_overrides WHERE id = ?')
    .get(id) as
    | { id: string; title: string | null; thumbnail_data_url: string | null; updated_at: number }
    | undefined
  return rowToOverride(row)
}

/**
 * Aplica un parche al override. Si un campo llega como `undefined` no se toca;
 * si llega como `null` se borra ese campo. Si el override queda vacío se
 * elimina la fila para no dejar basura en la tabla.
 */
export function setPlaylistOverride(
  id: string,
  patch: { title?: string | null; thumbnailDataUrl?: string | null }
): PlaylistOverride | null {
  const db = getDb()
  const current = getPlaylistOverride(id)
  const next: PlaylistOverride = {
    id,
    title: patch.title === null ? undefined : patch.title ?? current?.title,
    thumbnailDataUrl:
      patch.thumbnailDataUrl === null
        ? undefined
        : patch.thumbnailDataUrl ?? current?.thumbnailDataUrl,
    updatedAt: Date.now()
  }
  if (!next.title && !next.thumbnailDataUrl) {
    db.prepare('DELETE FROM playlist_overrides WHERE id = ?').run(id)
    return null
  }
  db.prepare(
    'INSERT OR REPLACE INTO playlist_overrides (id, title, thumbnail_data_url, updated_at) VALUES (?, ?, ?, ?)'
  ).run(id, next.title ?? null, next.thumbnailDataUrl ?? null, next.updatedAt)
  return next
}

export function getAllPlaylistOverrides(): Map<string, PlaylistOverride> {
  const rows = getDb()
    .prepare('SELECT id, title, thumbnail_data_url, updated_at FROM playlist_overrides')
    .all() as {
    id: string
    title: string | null
    thumbnail_data_url: string | null
    updated_at: number
  }[]
  const out = new Map<string, PlaylistOverride>()
  for (const r of rows) {
    const o = rowToOverride(r)
    if (o) out.set(o.id, o)
  }
  return out
}

// ---------- Tags por artista (F23) ----------
//
// Caché de los tags crudos que devuelve Last.fm por artista, normalizado a
// minúsculas y sin tildes para casar variaciones como "Rosalía" y "Rosalia".
// La caché es SQLite (persiste entre sesiones); el módulo `genres/` decide
// cuándo refrescar y cuándo servir la copia local.

/** Rango de marcas combinantes Unicode U+0300–U+036F (los "acentos" tras NFD). */
const DIACRITICS_RE = new RegExp('[\\u0300-\\u036f]', 'g')

/** Normaliza el nombre del artista a la clave usada en la caché. */
export function artistTagKey(name: string): string {
  return name.normalize('NFD').replace(DIACRITICS_RE, '').toLowerCase().trim()
}

/** Devuelve los tags cacheados de un artista (o null si nunca se resolvieron). */
export function getArtistTags(name: string): { tags: string[]; updatedAt: number } | null {
  const key = artistTagKey(name)
  if (!key) return null
  const row = getDb()
    .prepare('SELECT tags_json, updated_at FROM artist_tags WHERE artist_key = ?')
    .get(key) as { tags_json: string; updated_at: number } | undefined
  if (!row) return null
  try {
    const tags = JSON.parse(row.tags_json) as string[]
    if (!Array.isArray(tags)) return null
    return { tags, updatedAt: row.updated_at }
  } catch {
    return null
  }
}

/** Guarda o actualiza los tags de un artista en la caché. */
export function setArtistTags(name: string, tags: string[]): void {
  const key = artistTagKey(name)
  if (!key) return
  getDb()
    .prepare('INSERT OR REPLACE INTO artist_tags (artist_key, tags_json, updated_at) VALUES (?, ?, ?)')
    .run(key, JSON.stringify(tags), Date.now())
}

// ---------- Caché de fotos de artista (Recap) ----------
//
// Reutiliza `getArtist()` (innertube/api.ts) para obtener `ArtistDetail.thumbnailUrl`,
// pero cachea el resultado en SQLite para no golpear la API en cada apertura del
// Recap. Mismo patrón que `artist_tags` (F23): caché por clave estable (aquí el
// channel id del artista, que ya es único) con `updated_at` y TTL en el llamador.

/** Devuelve la foto cacheada de un artista por su id, o null si nunca se resolvió o expiró. */
export function getArtistThumb(
  id: string,
  maxAgeMs: number
): { thumbnailUrl: string | null; updatedAt: number } | null {
  if (!id) return null
  const row = getDb()
    .prepare('SELECT thumbnail_url, updated_at FROM artist_thumbs WHERE artist_id = ?')
    .get(id) as { thumbnail_url: string | null; updated_at: number } | undefined
  if (!row) return null
  if (Date.now() - row.updated_at > maxAgeMs) return null
  return { thumbnailUrl: row.thumbnail_url, updatedAt: row.updated_at }
}

/** Guarda o actualiza la foto de un artista en la caché (null si no tiene foto). */
export function setArtistThumb(id: string, thumbnailUrl: string | null): void {
  if (!id) return
  getDb()
    .prepare('INSERT OR REPLACE INTO artist_thumbs (artist_id, thumbnail_url, updated_at) VALUES (?, ?, ?)')
    .run(id, thumbnailUrl, Date.now())
}
