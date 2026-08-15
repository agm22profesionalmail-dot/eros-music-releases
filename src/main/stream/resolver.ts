import { spawn } from 'child_process'
import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { sessionManager } from '../innertube/session'
import { getAllSettings } from '../settings'

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

// F29 · La cadena real se lee de `AppSettings.streamingSources` en cada
// resolución (respetando orden y `enabled`). Los alias del ecosistema
// Metrolist Android se normalizan al cliente que sí conoce youtubei.js.
const CLIENT_ALIAS: Record<string, string> = {
  WEB_REMIX: 'YTMUSIC',
  ANDROID_MUSIC: 'ANDROID',
  TVHTML5: 'TV_EMBEDDED'
}

/** Normaliza un id de fuente a su cliente real para `getInfo({client})`. */
function normalizeClient(id: string): string {
  return CLIENT_ALIAS[id] ?? id
}

const CLIENT_UA: Record<string, string | undefined> = {
  IOS: 'com.google.ios.youtube/20.11.6 (iPhone10,4; U; CPU iOS 16_7_7 like Mac OS X)',
  ANDROID:
    'com.google.android.youtube/21.03.36(Linux; U; Android 16; en_US; SM-S908E Build/TP1A.220624.014) gzip',
  ANDROID_VR:
    'com.google.android.apps.youtube.vr.oculus/1.56.21 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
  YTMUSIC: undefined, // usa el UA de navegador de la sesión
  WEB_CREATOR: undefined,
  MWEB: undefined,
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

  // F29 · leer la cadena configurada; si por algún motivo queda vacía tras
  // filtrar (todo deshabilitado), volvemos al comportamiento histórico
  // para no dejar al usuario sin sonido por un botón desmarcado.
  const settingsSnapshot = getAllSettings()
  const configured = settingsSnapshot.streamingSources.filter((s) => s.enabled).map((s) => s.id)
  const chain =
    configured.length > 0 ? configured : ['YTMUSIC', 'IOS', 'ANDROID', 'TV_EMBEDDED']

  let lastError: unknown = null
  for (const source of chain) {
    const client = normalizeClient(source)
    try {
      // youtubei.js tipa `client` como InnerTubeClient; aceptamos strings
      // libres para poder probar aliases o clientes experimentales que el
      // usuario haya añadido. Si el motor los rechaza, capturamos y seguimos.
      const info = await yt.getInfo(videoId, { client: client as never })
      const status = info.playability_status?.status
      if (status && status !== 'OK') {
        lastError = new Error(`playability ${status} (${client})`)
        continue
      }
      // F27 · calidad de sonido: filtramos por bitrate según el ajuste.
      //   high   -> mejor formato disponible (equivalente a 'best' actual)
      //   medium -> el mejor con bitrate <= 192 kbps
      //   low    -> el mejor con bitrate <= 96 kbps
      //   auto   -> comportamiento previo (delegado a chooseFormat 'best')
      const audioQuality = getAllSettings().audioQuality ?? 'auto'
      let format = info.chooseFormat({ type: 'audio', quality: 'best' })
      if (audioQuality !== 'auto') {
        const adaptive =
          (info as unknown as { streaming_data?: { adaptive_formats?: unknown[] } })
            .streaming_data?.adaptive_formats ?? []
        const audioFmts = (adaptive as { mime_type?: string; bitrate?: number }[]).filter(
          (f) => (f.mime_type ?? '').startsWith('audio/')
        )
        if (audioFmts.length) {
          const cap = audioQuality === 'low' ? 96_000 : audioQuality === 'medium' ? 192_000 : Infinity
          // Ordena de mayor a menor bitrate y coge el primero por debajo del tope;
          // si nada cumple, cae al menor disponible para no romper la reproducción.
          const sorted = [...audioFmts].sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))
          const pick = sorted.find((f) => (f.bitrate ?? 0) <= cap) ?? sorted[sorted.length - 1]
          if (pick) format = pick as typeof format
        }
      }
      if (!format) {
        lastError = new Error(`sin formato de audio (${source})`)
        continue
      }
      // decipher aplica sig/nsig con el player y añade pot si la sesión lo tiene
      const url = await format.decipher(yt.session.player)
      if (!url) {
        lastError = new Error(`decipher vacío (${source})`)
        continue
      }
      const u = new URL(url)
      const label = source === client ? source : `${source}→${client}`
      console.log(
        `[resolver] ${label} ok: c=${u.searchParams.get('c')} pot=${u.searchParams.has('pot')} sabr=${u.searchParams.get('sabr') ?? '-'} n=${u.searchParams.has('n')} sig=${u.searchParams.has('sig') || u.searchParams.has('signature')}`
      )
      const resolved: ResolvedStream = {
        url,
        mimeType: format.mime_type ?? 'audio/mp4',
        bitrate: format.bitrate ?? undefined,
        durationSec: info.basic_info.duration,
        // las URLs llevan expire=; si no lo encontramos, asumimos 4 h
        expiresAt: extractExpiry(url) ?? Date.now() + 4 * 3600_000,
        via: source,
        userAgent:
          CLIENT_UA[source] ?? CLIENT_UA[client] ?? yt.session.context.client.userAgent,
        totalBytes: format.content_length ? Number(format.content_length) : undefined
      }
      cache.set(videoId, resolved)
      return resolved
    } catch (err) {
      console.warn(
        `[resolver] ${source} falló para ${videoId}:`,
        String((err as Error)?.message ?? err)
      )
      lastError = err
    }
  }

  // F29 · red de seguridad opcional: yt-dlp (instalado en el equipo).
  // El usuario puede desactivarla si InnerTube le basta o si yt-dlp está roto.
  if (settingsSnapshot.useYtDlpFallback) {
    try {
      const resolved = await resolveWithYtDlp(videoId)
      cache.set(videoId, resolved)
      return resolved
    } catch (err) {
      lastError = err
    }
  }

  throw new Error(`No se pudo resolver el stream de ${videoId}: ${String(lastError)}`)
}

function extractExpiry(url: string): number | null {
  const m = url.match(/[?&]expire=(\d{10})/)
  return m ? Number(m[1]) * 1000 : null
}

/** Ruta al yt-dlp empaquetado (o al del PATH si no hay bundle). */
function ytDlpBin(): string {
  const exe = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
  const packaged = app.isPackaged
    ? join(process.resourcesPath, 'bin', exe)
    : join(app.getAppPath(), 'resources', 'bin', exe)
  return existsSync(packaged) ? packaged : 'yt-dlp'
}

function resolveWithYtDlp(videoId: string): Promise<ResolvedStream> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      ytDlpBin(),
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
