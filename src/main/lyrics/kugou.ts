// Cliente de KuGou — respaldo de letras, con el mismo flujo en tres pasos que
// usa Metrolist/InnerTune en Android:
//   1) buscar la canción por "{artista} - {título}" para obtener su hash
//   2) pedir candidatos de letra (id + accesskey) con el hash y la duración
//   3) descargar la letra en LRC (viene como base64) y decodificarla
// Es un respaldo: CUALQUIER fallo (red, JSON raro, sin resultados) → null.
// Este cliente nunca lanza.

import { Buffer } from 'node:buffer'

const TIMEOUT_MS = 8000
/** Tolerancia al emparejar la duración del candidato (igual que InnerTune) */
const DURATION_TOLERANCE_SEC = 8

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface KugouParams {
  title: string
  artist: string
  durationSec?: number
}

/** GET que devuelve JSON o null; nunca lanza. */
async function getJson(url: URL): Promise<any | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/** Elige la canción con duración más próxima a la buscada (dentro de la
 *  tolerancia). Sin duración conocida, se queda con el primer resultado. */
function pickSong(songs: any[], durationSec: number | undefined): any | null {
  const valid = songs.filter((s) => typeof s?.hash === 'string' && s.hash !== '')
  if (valid.length === 0) return null
  if (durationSec === undefined) return valid[0]
  let best: any | null = null
  let bestDiff = Number.POSITIVE_INFINITY
  for (const song of valid) {
    const diff = typeof song.duration === 'number' ? Math.abs(song.duration - durationSec) : Number.POSITIVE_INFINITY
    if (diff < bestDiff) {
      best = song
      bestDiff = diff
    }
  }
  return bestDiff <= DURATION_TOLERANCE_SEC ? best : null
}

/**
 * Busca la letra en KuGou y devuelve el texto LRC decodificado, o null si
 * cualquier paso falla. Nunca lanza: es la red de seguridad tras LRCLIB.
 */
export async function fetchKugouLyrics(params: KugouParams): Promise<string | null> {
  try {
    // 1) Buscar la canción para obtener su hash
    const searchUrl = new URL('http://mobileservice.kugou.com/api/v3/search/song')
    searchUrl.searchParams.set('version', '9108')
    searchUrl.searchParams.set('plat', '0')
    searchUrl.searchParams.set('pagesize', '8')
    searchUrl.searchParams.set('showtype', '0')
    searchUrl.searchParams.set('keyword', `${params.artist} - ${params.title}`.trim())
    const search = await getJson(searchUrl)
    const songs: any[] = Array.isArray(search?.data?.info) ? search.data.info : []
    const song = pickSong(songs, params.durationSec)
    if (!song) return null

    // 2) Candidatos de letra para ese hash (duration va en milisegundos)
    const durationSec = typeof song.duration === 'number' ? song.duration : (params.durationSec ?? 0)
    const krcsUrl = new URL('http://krcs.kugou.com/search')
    krcsUrl.searchParams.set('ver', '1')
    krcsUrl.searchParams.set('man', 'yes')
    krcsUrl.searchParams.set('client', 'mobi')
    krcsUrl.searchParams.set('keyword', '')
    krcsUrl.searchParams.set('duration', String(Math.round(durationSec * 1000)))
    krcsUrl.searchParams.set('hash', String(song.hash))
    const krcs = await getJson(krcsUrl)
    const candidate = Array.isArray(krcs?.candidates) ? krcs.candidates[0] : null
    const id = candidate?.id
    const accesskey = candidate?.accesskey
    if (id === undefined || id === null || typeof accesskey !== 'string' || accesskey === '') {
      return null
    }

    // 3) Descargar la letra (content viene en base64)
    const downloadUrl = new URL('http://lyrics.kugou.com/download')
    downloadUrl.searchParams.set('ver', '1')
    downloadUrl.searchParams.set('client', 'pc')
    downloadUrl.searchParams.set('id', String(id))
    downloadUrl.searchParams.set('accesskey', accesskey)
    downloadUrl.searchParams.set('fmt', 'lrc')
    downloadUrl.searchParams.set('charset', 'utf8')
    const download = await getJson(downloadUrl)
    const content = download?.content
    if (typeof content !== 'string' || content === '') return null

    const lrc = Buffer.from(content, 'base64').toString('utf8')
    return lrc.trim() === '' ? null : lrc
  } catch {
    // Respaldo silencioso: nunca propagamos errores de KuGou
    return null
  }
}
