/**
 * F69 · ListenBrainz sync.
 *
 * API REST simple: un solo token de usuario, POST a /1/submit-listens.
 * GET /1/validate-token para validar el token.
 */

const BASE = 'https://api.listenbrainz.org'

/** Envía `playing_now` a ListenBrainz. */
export async function listenbrainzNowPlaying(
  token: string,
  params: { title: string; artist: string; album?: string }
): Promise<void> {
  const body = {
    listen_type: 'playing_now',
    payload: [
      {
        track_metadata: {
          track_name: params.title,
          artist_name: params.artist,
          ...(params.album ? { release_name: params.album } : {})
        }
      }
    ]
  }
  const res = await fetch(`${BASE}/1/submit-listens`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) console.error('[listenbrainz] nowPlaying error:', res.status)
}

/** Envía un `single` listen a ListenBrainz. `timestamp` es epoch en segundos. */
export async function listenbrainzSubmitListen(
  token: string,
  params: { title: string; artist: string; album?: string; timestamp: number }
): Promise<void> {
  const body = {
    listen_type: 'single',
    payload: [
      {
        listened_at: Math.round(params.timestamp),
        track_metadata: {
          track_name: params.title,
          artist_name: params.artist,
          ...(params.album ? { release_name: params.album } : {})
        }
      }
    ]
  }
  const res = await fetch(`${BASE}/1/submit-listens`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) console.error('[listenbrainz] submitListen error:', res.status)
}

/** Valida un token de usuario. */
export async function listenbrainzValidateToken(
  token: string
): Promise<{ valid: boolean; userName?: string }> {
  const res = await fetch(`${BASE}/1/validate-token?token=${encodeURIComponent(token)}`, {
    headers: { Authorization: `Token ${token}` }
  })
  if (!res.ok) return { valid: false }
  const data = (await res.json()) as { valid?: boolean; user_name?: string }
  return { valid: Boolean(data.valid), userName: data.user_name }
}
