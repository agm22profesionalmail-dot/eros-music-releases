// Cliente de KuGou — respaldo de letras, con el mismo flujo en tres pasos que
// usan InnerTune y derivados en Android:
//   1) buscar la canción por "{artista} - {título}" para obtener su hash
//   2) pedir candidatos de letra (id + accesskey) con el hash y la duración
//   3) descargar la letra en LRC (viene como base64) y decodificarla
// Es un respaldo: CUALQUIER fallo (red, JSON raro, sin resultados) → null.
// Este cliente nunca lanza.

import { Buffer } from 'node:buffer'
import { inflateSync } from 'node:zlib'
import type { LyricLine, LyricWord } from '@shared/types'

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

/** Pasos 1 y 2 compartidos: canción → candidato de letra (id + accesskey). */
async function findCandidate(params: KugouParams): Promise<{ id: string; accesskey: string } | null> {
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
  return { id: String(id), accesskey }
}

/** Paso 3: descarga en el formato pedido; content llega en base64. */
async function downloadContent(
  candidate: { id: string; accesskey: string },
  fmt: 'lrc' | 'krc'
): Promise<Buffer | null> {
  const downloadUrl = new URL('http://lyrics.kugou.com/download')
  downloadUrl.searchParams.set('ver', '1')
  downloadUrl.searchParams.set('client', 'pc')
  downloadUrl.searchParams.set('id', candidate.id)
  downloadUrl.searchParams.set('accesskey', candidate.accesskey)
  downloadUrl.searchParams.set('fmt', fmt)
  downloadUrl.searchParams.set('charset', 'utf8')
  const download = await getJson(downloadUrl)
  const content = download?.content
  if (typeof content !== 'string' || content === '') return null
  return Buffer.from(content, 'base64')
}

/**
 * Busca la letra en KuGou y devuelve el texto LRC decodificado, o null si
 * cualquier paso falla. Nunca lanza: es la red de seguridad tras LRCLIB.
 */
export async function fetchKugouLyrics(params: KugouParams): Promise<string | null> {
  try {
    const candidate = await findCandidate(params)
    if (!candidate) return null
    const raw = await downloadContent(candidate, 'lrc')
    if (!raw) return null
    const lrc = raw.toString('utf8')
    return lrc.trim() === '' ? null : lrc
  } catch {
    // Respaldo silencioso: nunca propagamos errores de KuGou
    return null
  }
}

// ---------- KRC: tiempos por palabra (karaoke real, como en la app Android original) ----------

/** Clave XOR pública del formato KRC (la misma que usa InnerTune). */
const KRC_KEY = Buffer.from([
  0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69
])

/** Desencripta un fichero KRC: magic "krc1" + XOR + zlib. */
function decryptKrc(raw: Buffer): string | null {
  if (raw.length < 5) return null
  if (raw.toString('latin1', 0, 4) !== 'krc1') return null
  const body = Buffer.alloc(raw.length - 4)
  for (let i = 4; i < raw.length; i++) {
    body[i - 4] = raw[i] ^ KRC_KEY[(i - 4) % 16]
  }
  try {
    return inflateSync(body).toString('utf8')
  } catch {
    return null
  }
}

/**
 * Parsea el texto KRC a líneas con palabras:
 *   [inicio,duración]<offset,dur,0>palabra<offset,dur,0>palabra...
 * offset es relativo al inicio de la línea; todos en ms.
 */
function parseKrc(text: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const m = rawLine.match(/^\[(\d+),(\d+)\](.*)$/)
    if (!m) continue // metadatos [id:...], [language:...], etc.
    const lineStart = Number(m[1])
    const rest = m[3]
    const words: LyricWord[] = []
    const wordRe = /<(\d+),(\d+),\d+>([^<]*)/g
    let wm: RegExpExecArray | null
    while ((wm = wordRe.exec(rest)) !== null) {
      const text = wm[3]
      if (text === '') continue
      words.push({ timeMs: lineStart + Number(wm[1]), durMs: Number(wm[2]), text })
    }
    const fullText = words.map((w) => w.text).join('')
    if (fullText.trim() === '') continue
    lines.push({ timeMs: lineStart, text: fullText, words })
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs)
}

/**
 * Letra con tiempos POR PALABRA desde KuGou (formato KRC). Devuelve null si
 * no hay candidato, el fichero no desencripta o no trae palabras. Nunca lanza.
 */
export async function fetchKugouKrc(params: KugouParams): Promise<LyricLine[] | null> {
  try {
    const candidate = await findCandidate(params)
    if (!candidate) return null
    const raw = await downloadContent(candidate, 'krc')
    if (!raw) return null
    const text = decryptKrc(raw)
    if (!text) return null
    const lines = parseKrc(text)
    if (!lines.length || !lines.some((l) => l.words && l.words.length > 1)) return null
    return lines
  } catch {
    return null
  }
}
