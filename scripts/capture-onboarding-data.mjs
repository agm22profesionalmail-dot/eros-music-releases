/**
 * F61 · Captura del dataset de muestra del onboarding — variante v2 SIN sesión.
 *
 * Este script NO toca tu sesión de Google ni las cookies de la app. Solo:
 *   1. Lee `metrolist.db` (SQLite) en modo READONLY mientras la app corre —
 *      WAL activo permite lectores concurrentes.
 *   2. Extrae metadatos ya cacheados: `library_cache.library` (playlists,
 *      artistas), `history` (top canciones más reproducidas), `artist_thumbs`
 *      (fotos de artistas).
 *   3. Intenta resolver la playlist "Summer Feels" mediante Innertube público
 *      (sin cookie). Si es privada devuelve 0 pistas y se deja solo la tarjeta.
 *   4. Para artistas sin foto en la caché local, intenta `getArtist(id)` sin
 *      cookie (páginas de canal son públicas).
 *   5. Descarga carátulas desde URLs de googleusercontent (públicas) a
 *      `src/renderer/src/assets/onboarding/covers/`.
 *   6. Precomputa paletas 60-30-10 en BrowserWindow oculto (necesario porque en
 *      producción file:// los canvas locales quedan tainted).
 *   7. Escribe `src/renderer/src/data/onboardingDemo.json`.
 *
 * Uso (la app puede seguir abierta):
 *   npx electron scripts/capture-onboarding-data.mjs
 *
 * Puede reejecutarse en cualquier momento — es idempotente y solo escribe en
 * los assets y en el JSON del dataset. Ninguna credencial se lee ni se guarda.
 */
import { app, BrowserWindow } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Innertube } from 'youtubei.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
// F63 · Tras el rebranding v1.2.0 el userData vive en "ERO'S Music"; si la
// app aún no migró (o se ejecuta contra un perfil viejo), cae a la carpeta
// histórica "Metrolist PC". El fichero sigue llamándose metrolist.db.
const DB_CANDIDATES = [
  join(process.env.APPDATA ?? '', "ERO'S Music", 'metrolist.db'),
  join(process.env.APPDATA ?? '', 'Metrolist PC', 'metrolist.db')
]
const DB_PATH =
  process.env.CAPTURE_DB ?? DB_CANDIDATES.find((p) => existsSync(p)) ?? DB_CANDIDATES[0]
const COVERS_DIR = join(ROOT, 'src', 'renderer', 'src', 'assets', 'onboarding', 'covers')
const OUT_JSON = join(ROOT, 'src', 'renderer', 'src', 'data', 'onboardingDemo.json')

const SUMMER_TITLE = /summer\s*feels/i
const LIKED_COUNT = 7
const ARTIST_MAX = 10
const TIMEOUT_MS = 180_000

app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')

function fail(msg, err) {
  console.error('[capture] FALLO:', msg, err ?? '')
  try {
    writeFileSync(
      join(ROOT, 'scripts', '.onboarding-capture.error.json'),
      JSON.stringify({ msg, error: String(err?.stack ?? err ?? '') }, null, 2)
    )
  } catch {}
  app.exit(1)
}

function upscaleThumb(url, size = 544) {
  if (!url) return undefined
  // Formatos habituales: `=w120-h120-l90-...` o `=s576` o `=s76`.
  return url
    .replace(/=w\d+-h\d+/, `=w${size}-h${size}`)
    .replace(/=s\d+/, `=s${size}`)
}

async function download(url, file) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} bajando ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(file, buf)
  return buf.length
}

// ---------- Lectura de la BD (readonly, WAL) ----------

function readCache() {
  const db = new DatabaseSync(DB_PATH, { readOnly: true })
  try {
    const row = db.prepare("SELECT json FROM library_cache WHERE section='library'").get()
    if (!row) throw new Error('library_cache no tiene sección "library" (la app no ha cacheado aún)')
    const library = JSON.parse(row.json)

    const historyRows = db
      .prepare(
        `SELECT video_id, play_count, played_at, json FROM history
         ORDER BY play_count DESC, played_at DESC LIMIT 60`
      )
      .all()
    const topSongs = []
    for (const r of historyRows) {
      try {
        const t = JSON.parse(r.json)
        if (t.kind !== 'song') continue
        // El history a veces guarda tarjetas de home con títulos raros del tipo
        // "TheFatRat • 17 M de visualizaciones" — descartar.
        if (t.artists?.some((a) => /visualizaciones/i.test(a.name))) continue
        if (!t.videoId || !t.title) continue
        topSongs.push({
          kind: 'song',
          videoId: t.videoId,
          title: t.title,
          artists: (t.artists ?? [])
            .map((a) => ({ name: a.name, id: a.id }))
            .filter((a) => a.name),
          album: t.album ?? null,
          durationSec: t.durationSec ?? null,
          durationText: t.durationText ?? null,
          thumbnailUrl: t.thumbnailUrl
        })
      } catch {}
      if (topSongs.length >= 20) break
    }

    const artistThumbs = new Map()
    for (const t of db.prepare('SELECT artist_id, thumbnail_url FROM artist_thumbs').all()) {
      artistThumbs.set(t.artist_id, t.thumbnail_url)
    }
    return { library, topSongs, artistThumbs }
  } finally {
    db.close()
  }
}

// ---------- Precomputación de paletas ----------

async function computePalettes(fileNames) {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  await win.loadURL('about:blank')
  const out = {}
  for (const file of fileNames) {
    try {
      const b64 = readFileSync(join(COVERS_DIR, file)).toString('base64')
      const palette = await win.webContents.executeJavaScript(`
        (async () => {
          const rgbToHsl = (r, g, b) => {
            r /= 255; g /= 255; b /= 255
            const max = Math.max(r, g, b), min = Math.min(r, g, b)
            const l = (max + min) / 2
            if (max === min) return [0, 0, l]
            const d = max - min
            const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
            let h
            if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
            else if (max === g) h = ((b - r) / d + 2) / 6
            else h = ((r - g) / d + 4) / 6
            return [h * 360, s, l]
          }
          const hslCss = (h, s, l) =>
            'hsl(' + Math.round(h) + ' ' + Math.round(s * 100) + '% ' + Math.round(l * 100) + '%)'
          const img = new Image()
          img.src = 'data:image/jpeg;base64,${b64}'
          await new Promise((res, rej) => { img.onload = res; img.onerror = rej })
          const size = 32
          const canvas = document.createElement('canvas')
          canvas.width = size; canvas.height = size
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          ctx.drawImage(img, 0, 0, size, size)
          const { data } = ctx.getImageData(0, 0, size, size)
          const BINS = 12
          const weight = new Array(BINS).fill(0)
          const satSum = new Array(BINS).fill(0)
          const count = new Array(BINS).fill(0)
          let bestAccent = null
          for (let i = 0; i < data.length; i += 4) {
            const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2])
            if (l < 0.06 || l > 0.96) continue
            const bin = Math.floor(h / (360 / BINS)) % BINS
            weight[bin] += 0.25 + s
            satSum[bin] += s
            count[bin]++
            if (s > 0.35 && l > 0.22 && l < 0.82) {
              const score = s * (1 - Math.abs(l - 0.55))
              if (!bestAccent || score > bestAccent.score) bestAccent = { h, s, l, score }
            }
          }
          const order = weight.map((w, i) => ({ w, i })).sort((a, b) => b.w - a.w).map((x) => x.i)
          const baseBin = order[0] ?? 0
          const midBin =
            order.find((b) => b !== baseBin && count[b] > 8 && Math.abs(b - baseBin) % BINS > 1) ??
            (baseBin + 2) % BINS
          const binHue = (b) => (b + 0.5) * (360 / BINS)
          const binSat = (b) => (count[b] ? Math.min(0.9, satSum[b] / count[b]) : 0.3)
          let accentHue = bestAccent?.h ?? binHue(baseBin)
          let accentSat = Math.max(0.7, bestAccent?.s ?? 0)
          let accentLum = 0.58
          if (!bestAccent && satSum[baseBin] / Math.max(1, count[baseBin]) < 0.15) {
            accentSat = 0.1; accentLum = 0.72; accentHue = 40
          }
          return {
            baseHue: binHue(baseBin), baseSat: binSat(baseBin),
            midHue: binHue(midBin), midSat: binSat(midBin),
            accent: hslCss(accentHue, accentSat, accentLum),
            accentHue, accentSat, accentLum
          }
        })()
      `)
      if (palette) out[file] = palette
    } catch (err) {
      console.warn('[capture] paleta falló para', file, String(err))
    }
  }
  win.destroy()
  return out
}

// ---------- Main ----------

const globalTimeout = setTimeout(() => fail('timeout de 180 s'), TIMEOUT_MS)

app
  .whenReady()
  .then(async () => {
    // 1. Metadatos ya cacheados por la app
    const { library, topSongs, artistThumbs } = readCache()
    console.log(
      `[capture] cache: ${library.playlists?.length ?? 0} playlists, ${
        library.artists?.length ?? 0
      } artistas, ${topSongs.length} canciones top del historial`
    )

    const summerCard = (library.playlists ?? []).find(
      (p) => p.kind === 'playlist' && SUMMER_TITLE.test(p.title)
    )
    if (!summerCard) console.warn('[capture] aviso: Summer Feels no está en library_cache')

    // 2. Intento resolver Summer Feels sin cookie (por si es pública).
    // Si es privada, devuelve 0 pistas — la tarjeta se muestra igualmente.
    let summerTracks = []
    if (summerCard) {
      try {
        const yt = await Innertube.create({ lang: 'es', location: 'ES', retrieve_player: false })
        const pl = await yt.music.getPlaylist(summerCard.id)
        for (const item of pl?.items ?? pl?.contents ?? []) {
          const videoId = item?.id ?? item?.endpoint?.payload?.videoId
          const title = item?.title?.toString?.() ?? item?.title ?? item?.name?.toString?.()
          if (!videoId || !title) continue
          const arts = (item?.artists ?? (item?.author ? [item.author] : [])).map((a) => ({
            name: a?.name ?? '',
            id: a?.channel_id
          })).filter((a) => a.name)
          const thumbs =
            item?.thumbnails ??
            item?.thumbnail?.contents ??
            (Array.isArray(item?.thumbnail) ? item.thumbnail : [])
          const bestThumb = [...thumbs].sort((a, b) => (b?.width ?? 0) - (a?.width ?? 0))[0]?.url
          summerTracks.push({
            kind: item?.item_type === 'video' ? 'video' : 'song',
            videoId,
            title,
            artists: arts,
            album: item?.album?.name ? { name: item.album.name, id: item.album.id } : null,
            durationSec: item?.duration?.seconds ?? null,
            durationText: item?.duration?.text ?? null,
            thumbnailUrl: upscaleThumb(bestThumb, 544)
          })
          if (summerTracks.length >= 12) break
        }
      } catch (err) {
        console.warn('[capture] Summer Feels pública falló:', err.message)
      }
      console.log('[capture] Summer Feels: ', summerTracks.length, 'pistas resueltas sin cookie')
    }

    // 3. Likes = top del historial (canciones reales del usuario). Es la vía sin
    // credenciales equivalente a "canciones que sueles escuchar".
    const likedTracks = topSongs.slice(0, LIKED_COUNT)
    console.log('[capture] muestra "me gusta" (top del historial):', likedTracks.length)

    // 4. Artistas: los 12 de la biblioteca cacheada. Foto de `artist_thumbs`
    // o, si falta, de la página pública del canal (getArtist sin cookie).
    const libraryArtists = (library.artists ?? []).slice(0, ARTIST_MAX * 2)
    const artistsWithPhoto = []
    let ytPublic = null
    for (const a of libraryArtists) {
      let photo = artistThumbs.get(a.id)
      if (!photo) {
        try {
          ytPublic ??= await Innertube.create({ lang: 'es', location: 'ES', retrieve_player: false })
          const art = await ytPublic.music.getArtist(a.id)
          const thumbs = art?.header?.thumbnails ?? art?.header?.thumbnail?.contents ?? []
          photo = [...thumbs].sort((x, y) => (y?.width ?? 0) - (x?.width ?? 0))[0]?.url
        } catch (err) {
          console.warn('[capture] getArtist público falló para', a.id, err.message)
        }
      }
      if (photo) {
        artistsWithPhoto.push({
          id: a.id,
          name: (a.title ?? '').trim(),
          thumbnailUrl: upscaleThumb(photo, 544)
        })
        if (artistsWithPhoto.length >= ARTIST_MAX) break
      }
    }
    console.log('[capture] artistas con foto:', artistsWithPhoto.length)

    // 5. Descarga de carátulas (URLs públicas)
    mkdirSync(COVERS_DIR, { recursive: true })
    const safe = (s) => s.replace(/[^a-zA-Z0-9_-]/g, '')
    const files = {}
    const grab = async (key, url, fileName) => {
      try {
        const bytes = await download(url, join(COVERS_DIR, fileName))
        files[key] = fileName
        console.log('[capture] ✓', fileName, `(${(bytes / 1024).toFixed(0)} KB)`)
      } catch (err) {
        console.warn('[capture] ✗ carátula', key, err.message)
      }
    }
    if (summerCard?.thumbnailUrl) {
      await grab('playlist', upscaleThumb(summerCard.thumbnailUrl, 544), 'playlist-summer-feels.jpg')
    }
    for (const t of [...summerTracks, ...likedTracks]) {
      const key = 't-' + t.videoId
      if (files[key] || !t.thumbnailUrl) continue
      await grab(key, t.thumbnailUrl, `t-${safe(t.videoId)}.jpg`)
    }
    for (const a of artistsWithPhoto) {
      await grab('a-' + a.id, a.thumbnailUrl, `a-${safe(a.id)}.jpg`)
    }

    // 6. Paletas precomputadas
    const trackCoverFiles = [
      ...new Set(
        [...summerTracks, ...likedTracks]
          .map((t) => files['t-' + t.videoId])
          .filter(Boolean)
      )
    ]
    const palettes = await computePalettes(trackCoverFiles)
    console.log('[capture] paletas precomputadas:', Object.keys(palettes).length)

    // 7. Payload — el mapper (`onboardingDemoData.ts`) espera exactamente esta forma.
    const stripTrack = (t) => ({
      kind: t.kind,
      videoId: t.videoId,
      title: t.title,
      artists: t.artists,
      album: t.album ?? null,
      durationSec: t.durationSec ?? null,
      durationText: t.durationText ?? null,
      coverFile: files['t-' + t.videoId] ?? null
    })
    const payload = {
      capturedAt: new Date().toISOString(),
      playlist: summerCard
        ? {
            id: summerCard.id,
            title: summerCard.title,
            trackCount: summerTracks.length || 3,
            coverFile: files['playlist'] ?? null
          }
        : null,
      summerTracks: summerTracks.map(stripTrack),
      likedTracks: likedTracks.map(stripTrack),
      artists: artistsWithPhoto.map((a) => ({
        id: a.id,
        name: a.name,
        coverFile: files['a-' + a.id] ?? null
      })),
      palettes
    }
    writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2))
    console.log('[capture] JSON escrito en', OUT_JSON)
    clearTimeout(globalTimeout)
    app.exit(0)
  })
  .catch((err) => fail('excepción no controlada', err))
