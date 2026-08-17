import { getSetting, setSetting } from '../db'

function dbg(msg: string): void {
  console.log('[imageHost]', msg)
}

/**
 * F62 · Sube imágenes locales (típicamente la foto de perfil personalizada
 * guardada como `data:image/*;base64,...`) a un servicio de hosting anónimo
 * y devuelve la URL pública HTTPS resultante — la única forma de que
 * Discord Rich Presence las muestre, porque los `largeImageKey` /
 * `smallImageKey` deben ser URLs alcanzables por el media-proxy de Discord
 * (`media.discordapp.net`), no `data:` URLs ni localhost.
 *
 * Servicio elegido: **catbox.moe** (`https://catbox.moe/user/api.php`,
 * `reqtype=fileupload`). Uploads anónimos sin API key ni cuenta; el
 * archivo persiste indefinidamente salvo TOS y Discord además cachea la
 * imagen en su propio CDN la primera vez que la ve.
 *
 * Estrategia de caché para no reuploadear cada vez:
 * - Hash rápido del data URL (djb2 en base36) como clave.
 * - Guardamos la última {hash, url} en SQLite (`discord.profilePhotoUpload`).
 * - Si el hash actual coincide con el cacheado, devolvemos la URL al instante.
 * - Si no coincide, disparamos el upload en background y devolvemos la URL
 *   anterior (o null si nunca hubo) — la barra sigue sonando; cuando el
 *   upload termina invocamos el callback `onFresh` para que la presencia
 *   se reenvíe con la nueva URL.
 * - Backoff: tras un fallo, no reintentar el mismo hash antes de 60 s.
 * - Deduplicación: un único upload en vuelo por hash.
 */

interface CachedUpload {
  hash: string
  url: string
  at: number
}

const CACHE_KEY = 'discord.profilePhotoUpload'
const UPLOAD_TIMEOUT_MS = 15_000
const FAIL_BACKOFF_MS = 60_000

let inflightUpload: Promise<string | null> | null = null
let inflightHash = ''
let lastFailedHash = ''
let lastFailedAt = 0

/** djb2 en base36 — barato y suficiente para invalidar caché. */
function fastHash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** Parsea un data URL a {mime, buffer}. Devuelve null si no es data URL válido. */
function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const m = dataUrl.match(/^data:([^;,]+)(?:;charset=[^;]+)?;base64,(.+)$/i)
  if (!m) return null
  const mime = m[1] || 'image/png'
  try {
    return { mime, buffer: Buffer.from(m[2], 'base64') }
  } catch {
    return null
  }
}

/**
 * Sube el data URL a catbox.moe. Devuelve la URL pública o null si algo
 * falla (red caída, timeout, respuesta rara). Nunca lanza.
 */
async function uploadToCatbox(dataUrl: string): Promise<string | null> {
  const parsed = parseDataUrl(dataUrl)
  if (!parsed) return null
  const { mime, buffer } = parsed
  if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) return null // 10 MB cap

  const ext = mime.split('/')[1]?.split('+')[0] || 'png'
  // Multipart manual: undici/Node FormData + Blob(Buffer) subía el binario
  // a 0 bytes cuando el servidor lo persistía (Content-Length: 0 en la URL
  // resultante). Construir el cuerpo a mano garantiza los bytes exactos.
  const boundary = '----ErosMusicCatbox' + Math.random().toString(36).slice(2)
  const CRLF = '\r\n'
  const preamble = Buffer.from(
    `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="reqtype"${CRLF}${CRLF}` +
      `fileupload${CRLF}` +
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="fileToUpload"; filename="profile.${ext}"${CRLF}` +
      `Content-Type: ${mime}${CRLF}${CRLF}`,
    'utf-8'
  )
  const closing = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf-8')
  const body = Buffer.concat([preamble, buffer, closing])
  dbg(`upload body prep: preamble=${preamble.length} img=${buffer.length} closing=${closing.length} total=${body.length}`)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)
  try {
    // Fetch global de Node (undici) — evita cualquier peculiaridad de net.fetch
    // de Electron con multipart. El body va como Buffer con Content-Type y
    // Content-Length explícitos.
    const resp = await fetch('https://catbox.moe/user/api.php', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(body.length)
      },
      body,
      signal: controller.signal
    })
    if (!resp.ok) {
      dbg(`catbox HTTP ${resp.status}`)
      return null
    }
    const text = (await resp.text()).trim()
    // catbox devuelve la URL cruda, ej: https://files.catbox.moe/abc123.png
    if (!/^https:\/\/files\.catbox\.moe\/[A-Za-z0-9]+\.[A-Za-z0-9]+$/.test(text)) {
      dbg(`respuesta inesperada de catbox: ${text.slice(0, 200)}`)
      return null
    }
    dbg(`catbox OK: ${text}`)
    return text
  } catch (err) {
    dbg(`error subiendo a catbox: ${String((err as Error)?.message ?? err)}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Devuelve una URL HTTPS pública equivalente al data URL de perfil.
 *
 * - Si el hash coincide con la caché, devuelve la URL al instante (sync).
 * - Si no coincide, dispara upload en background y devuelve la URL anterior
 *   (o null si nunca hubo). Cuando el upload termina con éxito, se invoca
 *   `onFresh(url)` — el caller (discord.ts) lo usa para reenviar la
 *   presencia con la URL nueva sin esperar al siguiente track.
 * - Si el upload falló recientemente para el mismo hash, se aplica backoff
 *   de 60 s antes de reintentar; mientras, se devuelve la caché previa o
 *   null.
 */
export function getOrUploadProfilePhotoUrl(
  dataUrl: string,
  onFresh?: (url: string) => void
): string | null {
  dbg(`getOrUpload llamado, dataUrl.len=${dataUrl?.length ?? 0} startsWithData=${dataUrl?.startsWith('data:')}`)
  if (!dataUrl || !dataUrl.startsWith('data:')) return null
  const hash = fastHash(dataUrl)
  const cached = getSetting<CachedUpload | null>(CACHE_KEY, null)
  dbg(`hash=${hash} cachedHash=${cached?.hash ?? '(none)'} cachedUrl=${cached?.url ?? '(none)'}`)
  // Cache-buster: catbox devuelve la misma URL para contenido idéntico, y el
  // media-proxy de Discord la puede tener cacheada de intentos anteriores
  // (incluso los que subieron mal). Añadimos ?v=hash para que Discord la
  // trate como URL nueva y refetch.
  const withBust = (url: string): string =>
    url.includes('?') ? url : `${url}?v=${hash}`
  if (cached && cached.hash === hash) return withBust(cached.url)

  const fallback = cached?.url ?? null

  // Dedup: mismo hash ya en vuelo → devuelve fallback, no relances upload.
  if (inflightUpload && inflightHash === hash) return fallback

  // Backoff tras fallo con el mismo hash.
  const now = Date.now()
  if (lastFailedHash === hash && now - lastFailedAt < FAIL_BACKOFF_MS) {
    return fallback
  }

  inflightHash = hash
  dbg(`disparando upload a catbox…`)
  inflightUpload = uploadToCatbox(dataUrl)
    .then((url) => {
      inflightUpload = null
      if (url) {
        setSetting(CACHE_KEY, { hash, url, at: Date.now() } satisfies CachedUpload)
        lastFailedHash = ''
        lastFailedAt = 0
        const bust = withBust(url)
        dbg(`subida OK, URL cacheada: ${bust}`)
        try {
          onFresh?.(bust)
        } catch {
          /* callback del caller — no debe romper el upload */
        }
        return bust
      } else {
        lastFailedHash = hash
        lastFailedAt = Date.now()
        return null
      }
    })
    .catch(() => {
      inflightUpload = null
      lastFailedHash = hash
      lastFailedAt = Date.now()
      return null
    })

  return fallback ? withBust(fallback) : null
}
