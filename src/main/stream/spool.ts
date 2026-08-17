import { app, net } from 'electron'
import { createWriteStream, promises as fs, type WriteStream } from 'fs'
import { join } from 'path'
import { EventEmitter } from 'events'
import { resolveStream, invalidateStream, type ResolvedStream } from './resolver'

/**
 * Spool de audio: descarga cada canción con UNA petición secuencial desde el
 * byte 0 (el único patrón que googlevideo acepta con nuestro PoToken: las
 * peticiones con offset > 0 devuelven 403) y la va volcando a disco.
 * El proxy sirve los Range del <audio> leyendo del fichero según crece:
 * seeking instantáneo, una sola conexión a Google por canción, y el fichero
 * queda como caché reutilizable (base del modo offline).
 */

interface SpoolEntry {
  videoId: string
  path: string
  mimeType: string
  totalBytes: number
  downloadedBytes: number
  done: boolean
  error: string | null
  emitter: EventEmitter
  lastAccess: number
}

const spools = new Map<string, SpoolEntry>()
const MAX_CACHE_BYTES = 768 * 1024 * 1024 // ~768 MB de canciones recientes

// Una sola descarga simultánea: dos ventanas crecientes en paralelo hacen
// que googlevideo rechace la segunda (rate-limit por visitante).
let downloadChain: Promise<void> = Promise.resolve()

function spoolDir(): string {
  return join(app.getPath('userData'), 'spool')
}

export async function getSpool(videoId: string): Promise<SpoolEntry> {
  const existing = spools.get(videoId)
  if (existing && !existing.error) {
    existing.lastAccess = Date.now()
    return existing
  }

  const resolved = await resolveStream(videoId)
  const entry: SpoolEntry = {
    videoId,
    path: join(spoolDir(), `${videoId}.audio`),
    mimeType: resolved.mimeType.split(';')[0],
    totalBytes: resolved.totalBytes ?? 0,
    downloadedBytes: 0,
    done: false,
    error: null,
    emitter: new EventEmitter(),
    lastAccess: Date.now()
  }
  entry.emitter.setMaxListeners(50)
  spools.set(videoId, entry)

  downloadChain = downloadChain
    .then(() => download(entry, resolved))
    .catch((err) => {
      entry.error = String((err as Error)?.message ?? err)
      entry.emitter.emit('update')
    })

  return entry
}

async function download(entry: SpoolEntry, resolved: ResolvedStream): Promise<void> {
  await fs.mkdir(spoolDir(), { recursive: true })

  // googlevideo (con nuestro PoToken) solo acepta rangos PREFIJO (0-N), el
  // primero pequeño, y trunca el cuerpo a una ventana que crece con lo ya
  // servido — simula el buffering de un reproductor real. Estrategia:
  // bucle de peticiones 0-(fin+margen), descartando los bytes ya guardados.
  const out: WriteStream = createWriteStream(entry.path)
  let reresolves = 0
  let stalls = 0

  try {
    while (!entry.totalBytes || entry.downloadedBytes < entry.totalBytes) {
      const headers: Record<string, string> = {}
      if (resolved.userAgent) headers['User-Agent'] = resolved.userAgent
      // F48 · Descarga COMPLETA desde la primera petición: la ventana
      // adaptativa antigua (1 MB → 3 → 7 → …) hacía que el final de la
      // canción no estuviese listo cuando el crossfade lo necesitaba, y el
      // `<audio>` se atascaba en `waiting` durante los últimos segundos →
      // resultado audible: salto seco en vez de fundido. Pidiendo el rango
      // total desde el primer fetch, googlevideo entrega la canción entera
      // en una sola conexión (más eficiente y siempre disponible al final).
      // Primera iteración: pide el máximo posible (googlevideo cortará a la
      // duración real y el proxy usará ese content-length como total).
      // Iteraciones siguientes (solo si la red cortó): retoma desde 0 con la
      // misma técnica — nunca hay offset > 0 (PoToken no lo acepta).
      const MB = 1024 * 1024
      const cap = entry.totalBytes > 0 ? entry.totalBytes + 999_999 : 256 * MB
      const end = cap
      headers.Range = `bytes=0-${end}`

      const res = await net.fetch(resolved.url, { headers })

      if (res.status === 403 || res.status === 410) {
        if (++reresolves > 2) throw new Error('URL rechazada tras re-resolver')
        invalidateStream(entry.videoId)
        resolved = await resolveStream(entry.videoId)
        continue
      }
      if (res.status !== 200 && res.status !== 206) {
        throw new Error(`HTTP ${res.status}`)
      }

      if (!entry.totalBytes) {
        const cr = res.headers.get('content-range')?.match(/\/(\d+)$/)
        const cl = res.headers.get('content-length')
        entry.totalBytes = cr ? Number(cr[1]) : cl ? Number(cl) : 0
        entry.emitter.emit('update')
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('sin body')

      let received = 0
      const before = entry.downloadedBytes
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        let chunk: Uint8Array = value
        // Descarta el tramo que ya tenemos (la petición siempre empieza en 0)
        if (received < before) {
          const skip = Math.min(before - received, chunk.byteLength)
          received += skip
          if (skip === chunk.byteLength) continue
          chunk = chunk.subarray(skip)
        }
        received += chunk.byteLength
        await new Promise<void>((resolveWrite, rejectWrite) => {
          out.write(chunk, (err) => (err ? rejectWrite(err) : resolveWrite()))
        })
        entry.downloadedBytes += chunk.byteLength
        entry.emitter.emit('update')
      }

      if (entry.downloadedBytes === before) {
        // La ventana no creció: espera un poco (simula consumo) y reintenta
        if (++stalls > 6) throw new Error(`ventana estancada en ${entry.downloadedBytes}B`)
        await new Promise((r) => setTimeout(r, 700 * stalls))
      } else {
        stalls = 0
      }
    }

    await new Promise<void>((r) => out.end(r))
    entry.done = true
    entry.emitter.emit('update')
    void pruneCache()
  } catch (err) {
    await new Promise<void>((r) => out.end(r))
    throw err
  }
}

/** Espera hasta que el spool tenga datos ≥ hasta, o esté completo/en error. */
export async function waitForBytes(entry: SpoolEntry, upTo: number): Promise<void> {
  while (!entry.done && !entry.error && entry.downloadedBytes <= upTo) {
    await new Promise<void>((resolve) => entry.emitter.once('update', resolve))
  }
  if (entry.error) throw new Error(entry.error)
}

/** Poda LRU del directorio de spool. */
async function pruneCache(): Promise<void> {
  try {
    const entries = [...spools.values()].filter((e) => e.done)
    let totalSize = 0
    const sizes = new Map<string, number>()
    for (const e of entries) {
      const st = await fs.stat(e.path).catch(() => null)
      if (st) {
        sizes.set(e.videoId, st.size)
        totalSize += st.size
      }
    }
    if (totalSize <= MAX_CACHE_BYTES) return
    const byAge = entries.sort((a, b) => a.lastAccess - b.lastAccess)
    for (const e of byAge) {
      if (totalSize <= MAX_CACHE_BYTES) break
      await fs.unlink(e.path).catch(() => undefined)
      totalSize -= sizes.get(e.videoId) ?? 0
      spools.delete(e.videoId)
    }
  } catch {
    /* la poda es mejor-esfuerzo */
  }
}

/** Limpia spools huérfanos de sesiones anteriores. */
export async function cleanSpoolDir(): Promise<void> {
  try {
    const dir = spoolDir()
    const files = await fs.readdir(dir).catch(() => [])
    for (const f of files) {
      await fs.unlink(join(dir, f)).catch(() => undefined)
    }
  } catch {
    /* ignorar */
  }
}
