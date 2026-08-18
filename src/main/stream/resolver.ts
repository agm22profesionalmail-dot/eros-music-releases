import { spawn } from 'child_process'
import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { sessionManager } from '../innertube/session'
import { mintPoToken, refreshMinter } from '../innertube/potoken'
import { getAllSettings } from '../settings'
import { ytDlpProxyArgs } from '../net/proxy'

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
// resolución (respetando orden y `enabled`). Los alias heredados del
// ecosistema Android original se normalizan al cliente que sí conoce
// youtubei.js.
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

/**
 * F42 · Ninguna operación de red/proceso de esta cadena tenía timeout — si
 * `yt.getInfo()` o `yt-dlp` se quedaban colgados (red rara, proxy, DNS que
 * no responde), la promesa nunca se resolvía NI RECHAZABA y la canción se
 * quedaba cargando para siempre (isBuffering=true sin salida). `Promise.race`
 * no cancela la operación original (puede seguir viva de fondo, inofensivo),
 * pero SÍ deja que el código de arriba se rinda y pruebe el siguiente
 * cliente de la cadena en vez de quedarse esperando indefinidamente.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout de ${ms}ms en ${label}`)), ms)
    promise.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      }
    )
  })
}

const cache = new Map<string, ResolvedStream>()

export function invalidateStream(videoId: string): void {
  cache.delete(videoId)
}

export function clearStreamCache(): void {
  cache.clear()
}

export async function resolveStream(
  videoId: string,
  opts?: { refreshPot?: boolean }
): Promise<ResolvedStream> {
  // Con `refreshPot` (venimos de un 403 de descarga) NO servimos de caché:
  // la URL cacheada lleva un pot que googlevideo ya rechazó.
  if (!opts?.refreshPot) {
    const hit = cache.get(videoId)
    if (hit && hit.expiresAt > Date.now() + 60_000) return hit
  }

  // Un 403 de GVS en art tracks "- Topic" significa casi siempre que el
  // integrity token de BotGuard caducó y los pot que firma ya no valen.
  // Regeneramos el minter ANTES de re-resolver para que `mintPoToken(videoId)`
  // de más abajo produzca un pot fresco y válido.
  if (opts?.refreshPot) {
    await refreshMinter().catch(() => undefined)
  }

  const yt = await withTimeout(
    sessionManager.ensureStreamingReady(),
    20000,
    'ensureStreamingReady'
  )

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
      const info = await withTimeout(
        yt.getInfo(videoId, { client: client as never }),
        9000,
        `getInfo ${source}`
      )
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
      let url = await withTimeout(format.decipher(yt.session.player), 6000, `decipher ${source}`)
      if (!url) {
        lastError = new Error(`decipher vacío (${source})`)
        continue
      }
      const u = new URL(url)
      // F72 · El `pot` de la URL de streaming (GVS) debe ligarse al VIDEOID, no al
      // visitorData de la sesión: con el de visitorData googlevideo devuelve 403 al
      // descargar los art tracks de YouTube Music (canales "- Topic"). Regeneramos
      // el pot ligado al videoId y lo sustituimos (solo en URLs que ya llevan pot;
      // IOS/ANDROID dan URL directa sin pot y no lo necesitan). Es lo que hace
      // Metrolist con su `streamingDataPoToken`.
      if (u.searchParams.has('pot')) {
        try {
          const streamPot = await withTimeout(mintPoToken(videoId), 8000, `streamPot ${source}`)
          u.searchParams.set('pot', streamPot)
          url = u.toString()
        } catch (e) {
          console.warn(
            `[resolver] streamPot(videoId) falló (${source}), uso el pot de sesión:`,
            String((e as Error)?.message ?? e)
          )
        }
      }
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

/** F42 · Si yt-dlp se cuelga (red, proxy) sin este límite no había nada que
 *  lo interrumpiera: ni error ni salida, la canción se quedaba cargando para
 *  siempre. A los 25 s lo matamos y rechazamos con un error claro. */
const YTDLP_TIMEOUT_MS = 25_000

function resolveWithYtDlp(videoId: string): Promise<ResolvedStream> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      ytDlpBin(),
      [
        '-f', 'bestaudio',
        '--no-playlist',
        '-j',
        ...ytDlpProxyArgs(),
        `https://music.youtube.com/watch?v=${videoId}`
      ],
      { windowsHide: true }
    )
    let settled = false
    const killTimer = setTimeout(() => {
      if (settled) return
      settled = true
      proc.kill()
      reject(new Error(`yt-dlp no respondió en ${YTDLP_TIMEOUT_MS / 1000}s (colgado o red caída)`))
    }, YTDLP_TIMEOUT_MS)
    let out = ''
    let err = ''
    proc.stdout.on('data', (d) => (out += d))
    proc.stderr.on('data', (d) => (err += d))
    proc.on('error', (e) => {
      if (settled) return
      settled = true
      clearTimeout(killTimer)
      reject(e)
    })
    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(killTimer)
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
