import http from 'http'
import { once } from 'events'
import { resolveStream, invalidateStream } from './resolver'

/**
 * Proxy HTTP local para el <audio> del renderer.
 *
 * GET /stream/:videoId  -> hace proxy del audio de googlevideo con soporte
 * completo de Range (imprescindible para poder buscar posición sin cortes).
 * Ante 403 (URL caducada o IP rechazada) re-resuelve una vez y reintenta.
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
      console.error('[stream] error no controlado:', err)
      if (!res.headersSent) res.writeHead(500)
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

  for (let attempt = 0; attempt < 2; attempt++) {
    const resolved = await resolveStream(videoId)

    const headers: Record<string, string> = {}
    if (req.headers.range) headers.Range = String(req.headers.range)

    const upstream = await fetch(resolved.url, { headers })

    if (upstream.status === 403 || upstream.status === 410) {
      // URL caducada: invalida y re-resuelve (solo un reintento)
      invalidateStream(videoId)
      continue
    }

    const passthrough = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges'
    ] as const
    const outHeaders: Record<string, string> = {}
    for (const h of passthrough) {
      const v = upstream.headers.get(h)
      if (v) outHeaders[h] = v
    }
    if (!outHeaders['content-type']) outHeaders['content-type'] = resolved.mimeType
    outHeaders['cache-control'] = 'no-store'

    res.writeHead(upstream.status, outHeaders)

    if (!upstream.body) {
      res.end()
      return
    }

    const reader = upstream.body.getReader()
    req.on('close', () => void reader.cancel().catch(() => undefined))
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (!res.write(value)) {
          await once(res, 'drain')
        }
      }
    } catch {
      /* cliente desconectado o upstream cortado: normal al saltar de canción */
    } finally {
      res.end()
    }
    return
  }

  res.writeHead(502)
  res.end('No se pudo obtener el stream')
}
