import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

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

export function recordPlay(videoId: string, trackJson: unknown): void {
  getDb()
    .prepare(
      `INSERT INTO history (video_id, json, played_at, play_count) VALUES (?, ?, ?, 1)
       ON CONFLICT(video_id) DO UPDATE SET json = excluded.json, played_at = excluded.played_at,
       play_count = history.play_count + 1`
    )
    .run(videoId, JSON.stringify(trackJson), Date.now())
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
