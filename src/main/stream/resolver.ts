import { spawn } from 'child_process'
import { sessionManager } from '../innertube/session'

/**
 * Resuelve videoId -> URL directa de audio de googlevideo.
 *
 * Cadena de intentos (de más a menos deseable):
 *   1. YTMUSIC (WEB_REMIX) con PoToken     — calidad alta (opus/aac), cuenta activa
 *   2. IOS                                  — históricamente no exige PoToken
 *   3. ANDROID                              — ídem
 *   4. TV_EMBEDDED                          — último cliente InnerTube
 *   5. yt-dlp                               — red de seguridad externa (ya instalado)
 *
 * Las URLs de googlevideo caducan (~6 h) y van ligadas a la IP: cacheamos por
 * videoId y re-resolvemos ante 403.
 */

export interface ResolvedStream {
  url: string
  mimeType: string
  bitrate?: number
  durationSec?: number
  expiresAt: number
  via: string
  /** User-Agent que googlevideo espera para este cliente */
  userAgent?: string
  /** Tamaño total del fichero de audio, si el formato lo declara */
  totalBytes?: number
}

// YTMUSIC primero: con PoToken de WEB es el único con acceso completo al fichero;
// IOS/ANDROID solo sirven ~2 MB sin su propia atestación (medido 2026-08)
const CLIENT_CHAIN = ['YTMUSIC', 'IOS', 'ANDROID', 'TV_EMBEDDED'] as const

const CLIENT_UA: Record<string, string | undefined> = {
  IOS: 'com.google.ios.youtube/20.11.6 (iPhone10,4; U; CPU iOS 16_7_7 like Mac OS X)',
  ANDROID:
    'com.google.android.youtube/21.03.36(Linux; U; Android 16; en_US; SM-S908E Build/TP1A.220624.014) gzip',
  YTMUSIC: undefined, // usa el UA de navegador de la sesión
  TV_EMBEDDED: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version'
}

const cache = new Map<string, ResolvedStream>()

export function invalidateStream(videoId: string): void {
  cache.delete(videoId)
}

export function clearStreamCache(): void {
  cache.clear()
}

export async function resolveStream(videoId: string): Promise<ResolvedStream> {
  const hit = cache.get(videoId)
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit

  const yt = await sessionManager.ensureStreamingReady()

  let lastError: unknown = null
  for (const client of CLIENT_CHAIN) {
    try {
      const info = await yt.getInfo(videoId, { client })
      const status = info.playability_status?.status
      if (status && status !== 'OK') {
        lastError = new Error(`playability ${status} (${client})`)
        continue
      }
      const format = info.chooseFormat({ type: 'audio', quality: 'best' })
      if (!format) {
        lastError = new Error(`sin formato de audio (${client})`)
        continue
      }
      // decipher aplica sig/nsig con el player y añade pot si la sesión lo tiene
      const url = await format.decipher(yt.session.player)
      if (!url) {
        lastError = new Error(`decipher vacío (${client})`)
        continue
      }
      const u = new URL(url)
      console.log(
        `[resolver] ${client} ok: c=${u.searchParams.get('c')} pot=${u.searchParams.has('pot')} sabr=${u.searchParams.get('sabr') ?? '-'} n=${u.searchParams.has('n')} sig=${u.searchParams.has('sig') || u.searchParams.has('signature')}`
      )
      const resolved: ResolvedStream = {
        url,
        mimeType: format.mime_type ?? 'audio/mp4',
        bitrate: format.bitrate ?? undefined,
        durationSec: info.basic_info.duration,
        // las URLs llevan expire=; si no lo encontramos, asumimos 4 h
        expiresAt: extractExpiry(url) ?? Date.now() + 4 * 3600_000,
        via: client,
        userAgent: CLIENT_UA[client] ?? yt.session.context.client.userAgent,
        totalBytes: format.content_length ? Number(format.content_length) : undefined
      }
      cache.set(videoId, resolved)
      return resolved
    } catch (err) {
      console.warn(`[resolver] ${client} falló para ${videoId}:`, String((err as Error)?.message ?? err))
      lastError = err
    }
  }

  // Red de seguridad: yt-dlp (instalado en el equipo)
  try {
    const resolved = await resolveWithYtDlp(videoId)
    cache.set(videoId, resolved)
    return resolved
  } catch (err) {
    lastError = err
  }

  throw new Error(`No se pudo resolver el stream de ${videoId}: ${String(lastError)}`)
}

function extractExpiry(url: string): number | null {
  const m = url.match(/[?&]expire=(\d{10})/)
  return m ? Number(m[1]) * 1000 : null
}

function resolveWithYtDlp(videoId: string): Promise<ResolvedStream> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'yt-dlp',
      ['-f', 'bestaudio', '--no-playlist', '-j', `https://music.youtube.com/watch?v=${videoId}`],
      { windowsHide: true }
    )
    let out = ''
    let err = ''
    proc.stdout.on('data', (d) => (out += d))
    proc.stderr.on('data', (d) => (err += d))
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`yt-dlp salió con ${code}: ${err.slice(0, 400)}`))
      try {
        const j = JSON.parse(out)
        if (!j.url) return reject(new Error('yt-dlp no devolvió url'))
        resolve({
          url: j.url,
          mimeType: j.ext === 'webm' ? 'audio/webm' : 'audio/mp4',
          bitrate: j.abr ? Math.round(j.abr * 1000) : undefined,
          durationSec: j.duration,
          expiresAt: extractExpiry(j.url) ?? Date.now() + 4 * 3600_000,
          via: 'yt-dlp'
        })
      } catch (e) {
        reject(e)
      }
    })
  })
}
