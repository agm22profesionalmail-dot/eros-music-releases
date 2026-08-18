import { app, BrowserWindow } from 'electron'
import { promises as fs, existsSync, watch, type FSWatcher } from 'fs'
import { join, extname, basename, parse as parsePath } from 'path'
import { spawn } from 'child_process'
import { homedir } from 'os'
import {
  upsertLocalTrack,
  readLocalTracks,
  removeLocalTrackByPath,
  getLocalTrackPaths,
  type LocalTrackRow
} from '../db'
import { IPC, SUPPORTED_LOCAL_FORMATS } from '@shared/types'

/**
 * ADR-0001 · Módulo de música local.
 *
 * Escanea la carpeta de música local del usuario, indexa los archivos de audio
 * en SQLite (tabla `local_tracks`), y mantiene un watcher para detectar cambios
 * en tiempo real.
 *
 * A diferencia de la caché de likes (carpeta oculta, hashes, sin extensión),
 * esta carpeta es accesible y visible: el usuario añade ahí su propia música.
 */

let notifyTarget: (() => BrowserWindow | null) | null = null
let watcher: FSWatcher | null = null

export function setLocalMusicNotifier(getWin: () => BrowserWindow | null): void {
  notifyTarget = getWin
}

function emit(): void {
  notifyTarget?.()?.webContents.send(IPC.LOCAL_CHANGED)
}

/** Carpeta de música local por defecto: ~/Music/ERO'S Music/ */
export function defaultLocalMusicDir(): string {
  const music = app.isReady() ? app.getPath('music') : join(homedir(), 'Music')
  return join(music, "ERO'S Music")
}

/** Extensiones válidas (set para lookup rápido). */
const VALID_EXTS = new Set<string>(SUPPORTED_LOCAL_FORMATS)

function isAudioFile(name: string): boolean {
  return VALID_EXTS.has(extname(name).toLowerCase())
}

/**
 * Resuelve la ruta de ffprobe — empaquetado o en PATH. Mismo patrón que
 * `bundledBin` en downloads/index.ts.
 */
function ffprobeBin(): string {
  const exe = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
  const packaged = app.isPackaged
    ? join(process.resourcesPath, 'bin', exe)
    : join(app.getAppPath(), 'resources', 'bin', exe)
  return existsSync(packaged) ? packaged : 'ffprobe'
}

/** Extrae metadatos básicos de un archivo de audio con ffprobe. */
async function probeFile(filePath: string): Promise<{
  title: string
  artist: string
  album: string
  durationSec: number
}> {
  return new Promise((resolve) => {
    const fallback = {
      title: parsePath(filePath).name,
      artist: '',
      album: '',
      durationSec: 0
    }
    const proc = spawn(
      ffprobeBin(),
      [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        filePath
      ],
      { windowsHide: true }
    )
    let stdout = ''
    proc.stdout.on('data', (d) => (stdout += d))
    // Timeout de seguridad
    const killer = setTimeout(() => {
      proc.kill('SIGKILL')
      resolve(fallback)
    }, 10_000)
    proc.on('error', () => {
      clearTimeout(killer)
      resolve(fallback)
    })
    proc.on('close', (code) => {
      clearTimeout(killer)
      if (code !== 0) {
        resolve(fallback)
        return
      }
      try {
        const data = JSON.parse(stdout)
        const fmt = data.format ?? {}
        const tags = fmt.tags ?? {}
        resolve({
          title: tags.title ?? tags.TITLE ?? fallback.title,
          artist: tags.artist ?? tags.ARTIST ?? tags.album_artist ?? '',
          album: tags.album ?? tags.ALBUM ?? '',
          durationSec: parseFloat(fmt.duration ?? '0') || 0
        })
      } catch {
        resolve(fallback)
      }
    })
  })
}

/**
 * Escanea la carpeta de música local y sincroniza la tabla `local_tracks`.
 * Archivos nuevos se indexan con ffprobe; archivos eliminados se purgan.
 * Devuelve el nº de archivos encontrados.
 */
export async function scanLocalMusic(dir: string): Promise<number> {
  await fs.mkdir(dir, { recursive: true })

  // Listar archivos recursivamente (un nivel — no recursivo por ahora para
  // mantener la simpleza; carpetas de primer nivel sí se escanean)
  const audioFiles: string[] = []
  async function walk(d: string): Promise<void> {
    const entries = await fs.readdir(d, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const full = join(d, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile() && isAudioFile(entry.name)) {
        audioFiles.push(full)
      }
    }
  }
  await walk(dir)

  // Diff contra lo que ya tenemos en BD
  const known = getLocalTrackPaths()
  const onDisk = new Set(audioFiles)

  // Eliminar de BD los que ya no están en disco
  for (const path of known) {
    if (!onDisk.has(path)) {
      removeLocalTrackByPath(path)
    }
  }

  // Indexar archivos nuevos
  for (const filePath of audioFiles) {
    if (known.has(filePath)) continue
    const stat = await fs.stat(filePath).catch(() => null)
    if (!stat) continue
    const meta = await probeFile(filePath)
    upsertLocalTrack({
      filePath,
      title: meta.title,
      artist: meta.artist,
      album: meta.album,
      durationSec: meta.durationSec,
      format: extname(filePath).toLowerCase().replace('.', ''),
      sizeBytes: stat.size
    })
  }

  emit()
  return audioFiles.length
}

/** Devuelve la lista actual de tracks locales. */
export function listLocalTracks(): LocalTrackRow[] {
  return readLocalTracks()
}

/**
 * Inicia el watcher de la carpeta de música local. Cada cambio dispara un
 * re-escaneo debounced. Llamar una sola vez en app.whenReady.
 */
export function startWatching(dir: string): void {
  stopWatching()
  if (!existsSync(dir)) return

  let debounce: ReturnType<typeof setTimeout> | null = null
  watcher = watch(dir, { recursive: true }, (_event, filename) => {
    if (!filename) return
    // Solo reaccionar a archivos de audio
    if (!isAudioFile(filename)) return
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => {
      void scanLocalMusic(dir)
    }, 1500)
  })
  watcher.on('error', () => {
    // El watcher puede fallar si la carpeta se borra externamente
    stopWatching()
  })
}

export function stopWatching(): void {
  if (watcher) {
    watcher.close()
    watcher = null
  }
}
