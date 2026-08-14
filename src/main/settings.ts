import { dialog, shell, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import { join, basename } from 'path'
import { getSetting, setSetting, getDb } from './db'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types'

/** Ajustes de la app persistidos en SQLite. */

export function getAllSettings(): AppSettings {
  const stored = getSetting<Partial<AppSettings>>('app.settings', {})
  const merged = { ...DEFAULT_SETTINGS, ...stored }
  if (!merged.downloadsDir) {
    merged.downloadsDir = getSetting('downloads.dir', join('F:\\', 'MetrolistPC', 'Music'))
  }
  return merged
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const merged = { ...getAllSettings(), ...patch }
  setSetting('app.settings', merged)
  if (patch.downloadsDir) setSetting('downloads.dir', patch.downloadsDir)
  return merged
}

/**
 * Cambia la carpeta de descargas: abre el selector, mueve los ficheros ya
 * descargados a la nueva ubicación (p. ej. un disco externo) y actualiza
 * las rutas registradas en la base de datos.
 */
export async function changeDownloadsDir(
  parent: BrowserWindow | null
): Promise<{ dir: string; moved: number } | null> {
  const current = getAllSettings().downloadsDir
  const result = await dialog.showOpenDialog(parent ?? new BrowserWindow({ show: false }), {
    title: 'Elige la carpeta de descargas de música',
    defaultPath: current,
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || !result.filePaths.length) return null
  const newDir = result.filePaths[0]
  if (newDir === current) return { dir: newDir, moved: 0 }

  await fs.mkdir(newDir, { recursive: true })

  // Mueve las descargas existentes y actualiza las rutas en la BD
  const db = getDb()
  const rows = db.prepare('SELECT video_id, file_path FROM downloads').all() as {
    video_id: string
    file_path: string
  }[]
  let moved = 0
  for (const row of rows) {
    const target = join(newDir, basename(row.file_path))
    try {
      await fs.rename(row.file_path, target).catch(async (err) => {
        // rename falla entre discos distintos: copia + borra
        if ((err as NodeJS.ErrnoException)?.code === 'EXDEV') {
          await fs.copyFile(row.file_path, target)
          await fs.unlink(row.file_path)
        } else if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
          throw err
        }
      })
      db.prepare('UPDATE downloads SET file_path = ? WHERE video_id = ?').run(target, row.video_id)
      moved++
    } catch {
      /* fichero bloqueado o desaparecido: se conserva el registro antiguo */
    }
  }

  updateSettings({ downloadsDir: newDir })
  return { dir: newDir, moved }
}

export async function openDownloadsDir(): Promise<void> {
  const dir = getAllSettings().downloadsDir
  await fs.mkdir(dir, { recursive: true }).catch(() => undefined)
  await shell.openPath(dir)
}
