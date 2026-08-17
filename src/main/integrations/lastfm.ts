/**
 * F68 · Last.fm scrobbling.
 *
 * Envía `track.updateNowPlaying` al empezar cada canción y
 * `track.scrobble` cuando se cumple la regla (≥30 s O ≥50 %).
 *
 * Auth: flujo web estándar → el usuario pega el token → auth.getSession.
 * La session key se guarda en ajustes (lastfmSessionKey).
 *
 * Registrar la app en https://www.last.fm/api/account/create con nombre
 * "ERO'S Music" y rellenar las dos constantes PLACEHOLDER de abajo.
 */
import { createHash } from 'crypto'

const LASTFM_API_KEY = '02f37d4dc77b9343c2e15054c3ed9ad9'
const LASTFM_SHARED_SECRET = '7b713c328d04a2f2fbda9d39dc4e7bef'
const BASE = 'https://ws.audioscrobbler.com/2.0/'

/** session key activa (leída de ajustes al importar). */
let sessionKey = ''

/** Calcula api_sig: parámetros ordenados concatenados + shared secret → MD5. */
function apiSig(params: Record<string, string>): string {
  const sorted = Object.keys(params).sort()
  const raw = sorted.map((k) => `${k}${params[k]}`).join('') + LASTFM_SHARED_SECRET
  return createHash('md5').update(raw, 'utf8').digest('hex')
}

/** POST firmado a la API. */
async function signedPost(params: Record<string, string>): Promise<Record<string, unknown>> {
  const withKey = { ...params, api_key: LASTFM_API_KEY }
  const sig = apiSig(withKey)
  const body = new URLSearchParams({ ...withKey, api_sig: sig, format: 'json' })
  const res = await fetch(BASE, { method: 'POST', body })
  if (!res.ok) throw new Error(`Last.fm ${res.status}: ${await res.text().catch(() => '')}`)
  return (await res.json()) as Record<string, unknown>
}

/** Devuelve la URL que el usuario debe abrir en su navegador para autorizar. */
export function getLastfmAuthUrl(): string {
  return `https://www.last.fm/api/auth/?api_key=${LASTFM_API_KEY}`
}

/**
 * Completa la autenticación: el usuario pega el token de la página de Last.fm,
 * lo intercambiamos por una session key permanente.
 */
export async function completeLastfmAuth(
  token: string
): Promise<{ username: string; sessionKey: string }> {
  const data = await signedPost({
    method: 'auth.getSession',
    token
  })
  const session = (data as { session?: { key?: string; name?: string } }).session
  if (!session?.key) throw new Error('Last.fm no devolvió session key')
  sessionKey = session.key
  return { username: session.name ?? '', sessionKey: session.key }
}

/** Envía `track.updateNowPlaying`. */
export async function lastfmNowPlaying(params: {
  title: string
  artist: string
  album?: string
  duration?: number
}): Promise<void> {
  if (!sessionKey) return
  const p: Record<string, string> = {
    method: 'track.updateNowPlaying',
    sk: sessionKey,
    track: params.title,
    artist: params.artist
  }
  if (params.album) p.album = params.album
  if (params.duration && params.duration > 0) p.duration = String(Math.round(params.duration))
  await signedPost(p).catch((err) => console.error('[lastfm] nowPlaying error:', err))
}

/** Envía `track.scrobble`. `timestamp` es epoch en segundos. */
export async function lastfmScrobble(params: {
  title: string
  artist: string
  album?: string
  duration?: number
  timestamp: number
}): Promise<void> {
  if (!sessionKey) return
  const p: Record<string, string> = {
    method: 'track.scrobble',
    sk: sessionKey,
    'track[0]': params.title,
    'artist[0]': params.artist,
    'timestamp[0]': String(Math.round(params.timestamp))
  }
  if (params.album) p['album[0]'] = params.album
  if (params.duration && params.duration > 0) p['duration[0]'] = String(Math.round(params.duration))
  await signedPost(p).catch((err) => console.error('[lastfm] scrobble error:', err))
}

/** Desconecta: limpia la session key en memoria. */
export function disconnectLastfm(): void {
  sessionKey = ''
}

/** Inyecta la session key (llamada desde el handler IPC al hidratar ajustes). */
export function setLastfmSessionKey(key: string): void {
  sessionKey = key
}
