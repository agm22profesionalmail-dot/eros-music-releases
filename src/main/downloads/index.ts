import { app, net, BrowserWindow } from 'electron'
import { spawn } from 'child_process'
import { existsSync, promises as fs } from 'fs'
import { join } from 'path'
import { recordDownload, removeDownload, readDownloads, getDownloadPath, getSetting } from '../db'
import { defaultDownloadsDir } from '../settings'
import { ytDlpProxyArgs } from '../net/proxy'
import type { TrackSummary } from '@shared/types'

/**
 * Resuelve la ruta de un binario preferentemente empaquetado con la app,
 * cayendo al que haya en el PATH del sistema si no. En dev usa `resources/bin`
 * del repo; en producción usa `process.resourcesPath\bin` (donde
 * electron-builder copia extraResources).
 */
function bundledBin(name: 'ffmpeg' | 'yt-dlp'): string {
  const exe = process.platform === 'win32' ? `${name}.exe` : name
  const packaged = app.isPackaged
    ? join(process.resourcesPath, 'bin', exe)
    : join(app.getAppPath(), 'resources', 'bin', exe)
  return existsSync(packaged) ? packaged : name
}

/**
 * Descargas permanentes: canción del spool -> ffmpeg (remux + etiquetas +
 * carátula incrustada) -> carpeta de música del usuario + registro en SQLite.
 * Cola secuencial; el progreso se emite al renderer por webContents.send.
 */

export interface DownloadProgress {
  videoId: string
  state: 'queued' | 'downloading' | 'tagging' | 'done' | 'error'
  progress?: number
  error?: string
}

let notifyTarget: (() => BrowserWindow | null) | null = null
export function setDownloadNotifier(getWin: () => BrowserWindow | null): void {
  notifyTarget = getWin
}

function emit(p: DownloadProgress): void {
  notifyTarget?.()?.webContents.send('downloads:progress', p)
}

function downloadsDir(): string {
  // F65 · Default = carpeta Música del usuario (~\Music\ERO'S Music). La ruta
  // guardada en BD (`downloads.dir`) prevalece; la carpeta del proyecto
  // F:\MetrolistPC ya no aparece en rutas visibles al usuario (es interna).
  return getSetting('downloads.dir', defaultDownloadsDir())
}

function sanitize(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 140)
}

let queue: Promise<void> = Promise.resolve()

export function enqueueDownload(track: TrackSummary): void {
  emit({ videoId: track.videoId, state: 'queued' })
  queue = queue
    .then(() => downloadOne(track))
    .catch((err) => {
      emit({
        videoId: track.videoId,
        state: 'error',
        error: String((err as Error)?.message ?? err)
      })
    })
}

async function downloadOne(track: TrackSummary): Promise<void> {
  if (getDownloadPath(track.videoId)) {
    emit({ videoId: track.videoId, state: 'done' })
    return
  }

  emit({ videoId: track.videoId, state: 'downloading', progress: 0 })

  // 1. Descarga con yt-dlp (evita el goteo a velocidad de reproducción que
  // googlevideo aplica a nuestro spool; yt-dlp trae su propio descifrador)
  const tmpBase = join(app.getPath('temp'), `eros-dl-${track.videoId}`)
  const rawPath = await ytDlpDownload(track.videoId, tmpBase, (progress) => {
    emit({ videoId: track.videoId, state: 'downloading', progress })
  })

  emit({ videoId: track.videoId, state: 'tagging' })

  // 2. Carátula
  const dir = downloadsDir()
  await fs.mkdir(dir, { recursive: true })
  let coverPath: string | null = null
  if (track.thumbnailUrl) {
    try {
      const res = await net.fetch(track.thumbnailUrl.replace(/=w\d+-h\d+/, '=w544-h544'))
      if (res.ok) {
        coverPath = join(app.getPath('temp'), `eros-cover-${track.videoId}.jpg`)
        await fs.writeFile(coverPath, Buffer.from(await res.arrayBuffer()))
      }
    } catch {
      /* sin carátula */
    }
  }

  // 3. Remux + etiquetas con ffmpeg
  const isWebm = rawPath.endsWith('.webm') || rawPath.endsWith('.opus')
  const ext = isWebm ? 'opus' : 'm4a'
  const artist = track.artists.map((a) => a.name).join(', ')
  const fileName = sanitize(`${artist ? artist + ' - ' : ''}${track.title}.${ext}`)
  const outPath = join(dir, fileName)

  const args = ['-y', '-i', rawPath]
  // La carátula incrustada solo es fiable en m4a (mp4); en opus la omitimos
  if (coverPath && !isWebm) args.push('-i', coverPath)
  args.push('-map', '0:a')
  if (coverPath && !isWebm) {
    args.push('-map', '1', '-c:v', 'mjpeg', '-disposition:v', 'attached_pic')
  }
  args.push('-c:a', 'copy')
  args.push('-metadata', `title=${track.title}`)
  if (artist) args.push('-metadata', `artist=${artist}`)
  if (track.album?.name) args.push('-metadata', `album=${track.album.name}`)
  args.push(outPath)

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(bundledBin('ffmpeg'), args, { windowsHide: true })
    let stderr = ''
    proc.stderr.on('data', (d) => (stderr += d))
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg salió con ${code}: ${stderr.slice(-300)}`))
    })
  })

  if (coverPath) await fs.unlink(coverPath).catch(() => undefined)
  await fs.unlink(rawPath).catch(() => undefined)

  // 4. Registro
  recordDownload(track.videoId, track, outPath)
  emit({ videoId: track.videoId, state: 'done' })
}

/** Descarga bestaudio con yt-dlp y devuelve la ruta del fichero temporal. */
function ytDlpDownload(
  videoId: string,
  outBase: string,
  onProgress: (p: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const outTemplate = `${outBase}.%(ext)s`
    const proc = spawn(
      bundledBin('yt-dlp'),
      [
        '-f', 'bestaudio',
        '--no-playlist',
        '--newline',
        '--no-part',
        '-o', outTemplate,
        ...ytDlpProxyArgs(),
        `https://music.youtube.com/watch?v=${videoId}`
      ],
      { windowsHide: true }
    )
    let stderr = ''
    let lastFile: string | null = null
    // Si yt-dlp se queda colgado, corta con error visible en vez de silencio
    const killer = setTimeout(() => {
      proc.kill('SIGKILL')
      reject(new Error('yt-dlp no respondió en 3 minutos'))
    }, 180_000)
    proc.stdout.on('data', (d) => {
      const text = String(d)
      const pm = text.match(/\[download\]\s+([\d.]+)%/)
      if (pm) onProgress(Number(pm[1]) / 100)
      const dest = text.match(/Destination:\s+(.+)/)
      if (dest) lastFile = dest[1].trim()
      const already = text.match(/\[download\]\s+(.+?) has already been downloaded/)
      if (already) lastFile = already[1].trim()
    })
    proc.stderr.on('data', (d) => (stderr += d))
    proc.on('error', (err) => {
      clearTimeout(killer)
      reject(err)
    })
    proc.on('close', async (code) => {
      clearTimeout(killer)
      if (code !== 0) {
        reject(new Error(`yt-dlp salió con ${code}: ${stderr.slice(-300)}`))
        return
      }
      if (lastFile) {
        resolve(lastFile)
        return
      }
      // Busca el fichero por el prefijo (por si no capturamos Destination)
      const dir = join(outBase, '..')
      const base = outBase.split(/[\\/]/).pop() ?? ''
      const entries = await fs.readdir(dir).catch(() => [])
      const found = entries.find((e) => e.startsWith(base))
      if (found) resolve(join(dir, found))
      else reject(new Error('yt-dlp no produjo fichero'))
    })
  })
}

export async function deleteDownload(videoId: string): Promise<void> {
  const path = getDownloadPath(videoId)
  if (path) await fs.unlink(path).catch(() => undefined)
  removeDownload(videoId)
}

export function listDownloads(): { track: TrackSummary; filePath: string }[] {
  return readDownloads() as { track: TrackSummary; filePath: string }[]
}

export { getDownloadPath }
