import http from 'http'
import { once } from 'events'
import { createReadStream } from 'fs'
import { getSpool, waitForBytes } from './spool'

/**
 * Proxy HTTP local para el <audio> del renderer.
 *
 * Sirve los Range del reproductor desde el spool local (spool.ts), que
 * descarga cada canción con una única petición secuencial — el único patrón
 * que googlevideo acepta. Seeking instantáneo una vez descargado el tramo.
 *
 * Escucha solo en 127.0.0.1 con un token por sesión para que ningún otro
 * proceso local pueda usarlo como proxy abierto.
 */

let server: http.Server | null = null
let baseUrl = ''
const sessionToken = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)

export function getStreamBaseUrl(): string {
  return baseUrl
}

export function streamUrlFor(videoId: string): string {
  return `${baseUrl}/stream/${encodeURIComponent(videoId)}?t=${sessionToken}`
}

export async function startStreamServer(): Promise<string> {
  if (server) return baseUrl

  server = http.createServer((req, res) => {
    void handle(req, res).catch((err) => {
      console.error('[stream] error:', String((err as Error)?.message ?? err))
      if (!res.headersSent) res.writeHead(502)
      res.end()
    })
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const addr = server.address()
  if (typeof addr === 'object' && addr) {
    baseUrl = `http://127.0.0.1:${addr.port}`
  }
  console.log('[stream] proxy escuchando en', baseUrl)
  return baseUrl
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', baseUrl)
  const match = url.pathname.match(/^\/stream\/([A-Za-z0-9_-]{6,16})$/)

  if (!match || url.searchParams.get('t') !== sessionToken) {
    res.writeHead(404)
    res.end()
    return
  }
  const videoId = match[1]

  const spool = await getSpool(videoId)

  // Espera a conocer el tamaño total (llega con los primeros bytes)
  await waitForBytes(spool, 0)
  const total = spool.totalBytes
  if (!total) {
    res.writeHead(502)
    res.end()
    return
  }

  // Range entrante
  let start = 0
  let end = total - 1
  let partial = false
  const rangeHeader = req.headers.range
  if (rangeHeader) {
    const m = rangeHeader.match(/bytes=(\d+)-(\d*)/)
    if (m) {
      start = Number(m[1])
      if (m[2]) end = Math.min(Number(m[2]), total - 1)
      partial = true
    }
  }
  if (start >= total) {
    res.writeHead(416, { 'Content-Range': `bytes */${total}` })
    res.end()
    return
  }

  const headers: Record<string, string> = {
    'content-type': spool.mimeType,
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
    'content-length': String(end - start + 1)
  }
  if (partial) headers['content-range'] = `bytes ${start}-${end}/${total}`
  res.writeHead(partial ? 206 : 200, headers)

  let clientGone = false
  req.on('close', () => {
    clientGone = true
  })

  // Sirve del fichero según crece
  let pos = start
  while (pos <= end && !clientGone) {
    await waitForBytes(spool, pos)
    const available = spool.done ? end : Math.min(spool.downloadedBytes - 1, end)
    if (available < pos) continue

    const stream = createReadStream(spool.path, { start: pos, end: available })
    for await (const chunk of stream) {
      if (clientGone) break
      if (!res.write(chunk)) {
        await once(res, 'drain')
      }
    }
    pos = available + 1
  }

  res.end()
}
