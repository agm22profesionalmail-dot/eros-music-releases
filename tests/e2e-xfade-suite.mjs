/**
 * F50 · Suite E2E del crossfade con PISTAS LOCALES (sin googlevideo, así
 * convive con la app instalada del usuario y es determinista):
 *
 *  T0 · Transición 100% natural: play desde 0 y esperar el final (50 s).
 *  T1 · Fade tras seek con margen (rem≈20s, deja correr).
 *  T2 · Re-crossfade en la misma pista tras volver atrás (rearme firedFor).
 *  T3 · Arrastre casi al final (rem≈3s): sin doble salto, fade corto.
 *  T4 · Última pista + autoplay: la cola se amplía sola y hay fade.
 *
 * Prepara: perfil E2E aislado (userData propio), 6 tonos AAC de 50 s
 * registrados como descargas en metrolist.db, carátulas SVG de colores
 * distintos (para verificar la interpolación del ambient).
 */
import { _electron } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'

const profile = join(process.env.TEMP ?? '.', 'eros-e2e-profile')
mkdirSync(profile, { recursive: true })

// ---------- Fixtures ----------
const COLORS = ['ff2d55', '30d158', '0a84ff', 'ffd60a', 'bf5af2', 'ff9f0a']
const thumb = (hex) =>
  `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' fill='%23${hex}'/%3E%3C/svg%3E`
const track = (i) => ({
  kind: 'song',
  videoId: `e2e-tone-${i}`,
  title: `Tono E2E ${i}`,
  artists: [{ name: `Artista ${i}` }],
  durationSec: 50,
  thumbnailUrl: thumb(COLORS[i - 1])
})
const TRACKS = [1, 2, 3, 4, 5, 6].map(track)

// Registra los tonos como descargas (prepare → disco, cero red)
{
  const db = new DatabaseSync(join(profile, 'metrolist.db'))
  db.exec(`CREATE TABLE IF NOT EXISTS downloads (
    video_id TEXT PRIMARY KEY, json TEXT NOT NULL,
    file_path TEXT NOT NULL, downloaded_at INTEGER NOT NULL)`)
  const ins = db.prepare(
    'INSERT OR REPLACE INTO downloads (video_id, json, file_path, downloaded_at) VALUES (?, ?, ?, ?)'
  )
  for (const t of TRACKS) {
    ins.run(t.videoId, JSON.stringify(t), join(profile, 'e2e-audio', `${t.videoId}.m4a`), Date.now())
  }
  db.close()
}

// upNext canned para T4 (tonos 4-6 como "recomendaciones")
writeFileSync(
  join(profile, 'e2e-upnext.json'),
  JSON.stringify({ tracks: [4, 5, 6].map(track) })
)

// ---------- Lanzamiento ----------
const app = await _electron.launch({
  args: ['.'],
  cwd: 'F:/MetrolistPC',
  env: { ...process.env, EROS_E2E_PROFILE: profile }
})
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(e.message))

await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(2500)
await win.evaluate(() => document.querySelectorAll('audio').forEach((a) => (a.muted = true)))
await win.evaluate(() => window.api.settings.set({ crossfadeSec: 6 }))
await win.waitForTimeout(400)

const S = () =>
  win.evaluate(() => {
    const st = window.__erosMusicPlayerStore.getState()
    const els = [...document.querySelectorAll('audio')]
    return {
      index: st.index,
      qlen: st.queue.length,
      isPlaying: st.isPlaying,
      isBuffering: st.isBuffering,
      cx: st.crossfading ? { durationMs: st.crossfading.durationMs } : null,
      error: st.error,
      ambBg: getComputedStyle(document.documentElement).getPropertyValue('--amb-60').trim(),
      accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      coverLayers: document.querySelectorAll('.np-cover-wrap img').length,
      textOut: document.querySelectorAll('.np-text-out').length,
      // F51 · superficies nuevas
      qpMixOut: document.querySelectorAll('.qp-mix-out').length,
      qpProgress: document.querySelectorAll('.qp-mix-progress').length,
      vizArtLayers: document.querySelectorAll('[data-testid="visualizer-art"] img').length,
      bgOutLayers: document.querySelectorAll('.xf-bg-out').length,
      audios: els.map((a) => ({
        paused: a.paused,
        ct: +a.currentTime.toFixed(1),
        dur: +(a.duration || 0).toFixed(1)
      }))
    }
  })

const startQueue = (tracks, startIndex = 0) =>
  win.evaluate(
    ([ts, idx]) => window.__erosMusicPlayerStore.getState().playTracks(ts, idx),
    [tracks, startIndex]
  )

const seekToRemaining = (rem) =>
  win.evaluate((r) => {
    const st = window.__erosMusicPlayerStore.getState()
    if (st.duration > 0) st.seek(Math.max(0, st.duration - r))
  }, rem)

const waitPlaying = async () => {
  for (let i = 0; i < 30; i++) {
    await win.waitForTimeout(500)
    const s = await S()
    if (s.isPlaying && s.audios.some((a) => !a.paused && a.ct > 0.5)) return s
  }
  return await S()
}

async function observe(ms) {
  const snaps = []
  const steps = Math.ceil(ms / 250)
  for (let i = 0; i < steps; i++) {
    snaps.push(await S())
    await win.waitForTimeout(250)
  }
  return snaps
}

function analyzeFade(snaps, label) {
  let overlapMs = 0
  let sawCx = false
  let sawCoverLayers = false
  let sawTextOut = false
  let sawQpMix = false
  let sawQpProgress = false
  let sawVizLayers = false
  let sawBgOut = false
  let stuckBuffering = 0
  const hues = new Set()
  const accents = new Set()
  for (let i = 1; i < snaps.length; i++) {
    const s = snaps[i]
    const prev = snaps[i - 1]
    const bothAdvancing =
      s.audios.length === 2 &&
      s.audios.every((a, j) => {
        const p = prev.audios[j]
        return !a.paused && a.ct > 0 && p && a.ct > p.ct - 0.05
      })
    if (bothAdvancing) overlapMs += 250
    if (s.cx) sawCx = true
    if (s.coverLayers >= 2) sawCoverLayers = true
    if (s.textOut >= 1) sawTextOut = true
    if (s.qpMixOut >= 1) sawQpMix = true
    if (s.qpProgress >= 1) sawQpProgress = true
    if (s.vizArtLayers >= 2) sawVizLayers = true
    if (s.bgOutLayers >= 1) sawBgOut = true
    if (s.isBuffering) stuckBuffering++
    const m = s.ambBg.match(/hsl\((\d+)/)
    if (m) hues.add(m[1])
    if (s.accent) accents.add(s.accent)
  }
  const idxBefore = snaps[0].index
  const idxAfter = snaps[snaps.length - 1].index
  console.log(
    `[${label}] overlap≈${overlapMs}ms cx=${sawCx} capasCover=${sawCoverLayers} ` +
      `textFade=${sawTextOut} qpMix=${sawQpMix} qpProg=${sawQpProgress} viz=${sawVizLayers} ` +
      `bgOut=${sawBgOut} hues=${hues.size} accents=${accents.size} idx ${idxBefore}→${idxAfter}`
  )
  return {
    overlapMs, sawCx, sawCoverLayers, sawTextOut,
    sawQpMix, sawQpProgress, sawVizLayers, sawBgOut,
    hueCount: hues.size, accentCount: accents.size,
    idxBefore, idxAfter, stuckBuffering
  }
}

const results = {}

// F51 · Config de escenario: cola abierta + página del visualizador — la
// misma vista que usa el usuario, y donde viven las superficies nuevas.
await win.locator('button[aria-label="Cola"]').first().click()
await win.evaluate(() => window.__erosMusicRouter.getState().navigate({ name: 'visualizer' }))
await win.waitForTimeout(500)

// ---------- T0: transición 100% natural ----------
console.log('--- T0: reproducción natural completa (50s) ---')
await startQueue(TRACKS.slice(0, 3))
let s0 = await waitPlaying()
console.log(`inicio: index=${s0.index} qlen=${s0.qlen} playing=${s0.isPlaying}`)
// espera hasta rem≈11s
for (let i = 0; i < 100; i++) {
  await win.waitForTimeout(500)
  const s = await S()
  const act = s.audios.find((a) => !a.paused && a.dur > 10)
  if (act && act.dur - act.ct <= 11) break
}
results.T0 = analyzeFade(await observe(13_000), 'T0')

// ---------- T1: fade tras seek con margen ----------
console.log('\n--- T1: seek a rem≈20s y dejar correr ---')
await win.waitForTimeout(1000)
await seekToRemaining(20)
for (let i = 0; i < 40; i++) {
  await win.waitForTimeout(500)
  const s = await S()
  const act = s.audios.find((a) => !a.paused && a.dur > 10)
  if (act && act.dur - act.ct <= 11) break
}
results.T1 = analyzeFade(await observe(13_000), 'T1')

// ---------- T2: rearme en la MISMA pista (seek atrás y de nuevo al final) ----------
console.log('\n--- T2: seek atrás (rearme) y otra vez a rem≈10 ---')
await win.waitForTimeout(800)
await seekToRemaining(40) // atrás: rearma
await win.waitForTimeout(800)
await seekToRemaining(10)
results.T2 = analyzeFade(await observe(13_000), 'T2')

// ---------- T3: arrastre casi al final ----------
console.log('\n--- T3: seek a rem≈3s (fade corto, sin doble salto) ---')
await win.waitForTimeout(800)
const beforeT3 = await S()
await seekToRemaining(3)
results.T3 = analyzeFade(await observe(8_000), 'T3')
results.T3.expectedIdx = beforeT3.index + 1

// ---------- T4: última pista + autoplay (cola se amplía sola) ----------
console.log('\n--- T4: última pista con autoplay ---')
await startQueue(TRACKS.slice(0, 2), 1) // índice 1 = última (tono 2)
await waitPlaying()
const t4Start = await S()
console.log(`T4: index=${t4Start.index} qlen=${t4Start.qlen}`)
await seekToRemaining(22)
let extended = false
for (let i = 0; i < 30; i++) {
  await win.waitForTimeout(500)
  const s = await S()
  if (s.qlen > t4Start.qlen) {
    extended = true
    console.log(`T4: cola ampliada ${t4Start.qlen} → ${s.qlen}`)
    break
  }
}
results.T4ext = extended
for (let i = 0; i < 40; i++) {
  await win.waitForTimeout(500)
  const s = await S()
  const act = s.audios.find((a) => !a.paused && a.dur > 10)
  if (act && act.dur - act.ct <= 11) break
}
results.T4 = analyzeFade(await observe(13_000), 'T4')

// ---------- T5: sin "reaparición" al terminar el fade (F52) ----------
// El bug: al limpiar `crossfading`, la propiedad animation de la carátula
// y del fondo cambiaba de valor → el navegador reiniciaba la animación
// desde opacity 0 → la misma imagen "reaparecía". Aquí se muestrea la
// opacidad computada durante 1.5s TRAS acabar el fade: debe quedarse a 1.
console.log('\n--- T5: estabilidad post-fade (sin parpadeo de carátula/fondo) ---')
await win.waitForTimeout(1000)
await seekToRemaining(10)
const stability = await win.evaluate(async () => {
  const store = window.__erosMusicPlayerStore
  const until = (pred, timeout) =>
    new Promise((res) => {
      const t0 = Date.now()
      const iv = setInterval(() => {
        if (pred() || Date.now() - t0 > timeout) {
          clearInterval(iv)
          res()
        }
      }, 60)
    })
  await until(() => Boolean(store.getState().crossfading), 30000)
  await until(() => !store.getState().crossfading, 30000)
  const samples = []
  for (let i = 0; i < 15; i++) {
    const arts = [...document.querySelectorAll('[data-testid="visualizer-art"] img')]
    const bgs = [...document.querySelectorAll('.lyrics-bg')]
    const art = arts[arts.length - 1]
    const bg = bgs[bgs.length - 1]
    samples.push({
      art: art ? Number(getComputedStyle(art).opacity) : 1,
      bg: bg ? Number(getComputedStyle(bg).opacity) : 1
    })
    await new Promise((r) => setTimeout(r, 100))
  }
  return samples
})
results.T5 = {
  minArt: Math.min(...stability.map((s) => s.art)),
  minBg: Math.min(...stability.map((s) => s.bg))
}
console.log(
  `[T5] minArtOpacity=${results.T5.minArt.toFixed(2)} minBgOpacity=${results.T5.minBg.toFixed(2)}`
)

// ---------- T6: clic manual en pista arbitraria (F53) ----------
// El bug real: clic en la canción 4 de la playlist → parecía no hacer nada
// (la vieja seguía sonando durante el prepare), luego corte seco + spinner.
// Lo esperado: índice/UI cambian AL INSTANTE, la vieja suena hasta que la
// nueva arranca (cero silencio) y se funden ~1 s.
console.log('\n--- T6: salto manual con mini-fundido, sin silencio ni "cargando" ---')
await startQueue(TRACKS.slice(0, 5), 0)
await waitPlaying()
await win.waitForTimeout(2000)
await win.evaluate((ts) => {
  void window.__erosMusicPlayerStore.getState().playTracks(ts, 3)
}, TRACKS.slice(0, 5))
const t6 = await win.evaluate(async () => {
  const store = window.__erosMusicPlayerStore
  const samples = []
  for (let i = 0; i < 40; i++) {
    const els = [...document.querySelectorAll('audio')]
    const st = store.getState()
    samples.push({
      t: i * 100,
      index: st.index,
      cxMs: st.crossfading?.durationMs ?? null,
      buffering: st.isBuffering,
      playing: st.isPlaying,
      anyAudio: els.some((a) => !a.paused && a.currentTime > 0),
      bothAudio: els.filter((a) => !a.paused && a.currentTime > 0).length === 2
    })
    await new Promise((r) => setTimeout(r, 100))
  }
  return samples
})
const t6IdxAt = t6.find((s) => s.index === 3)
const t6Silence = t6.filter((s) => !s.anyAudio).length
const t6Overlap = t6.filter((s) => s.bothAudio).length * 100
const t6MiniCx = t6.some((s) => s.cxMs != null && s.cxMs <= 1500)
const t6End = t6[t6.length - 1]
// F54 · Sincronía aspecto↔audio: desde que el índice muestra la nueva hasta
// que su audio suena de verdad no pueden pasar más de ~600 ms (con la URL
// resuelta por delante, el fundido arranca casi al instante del cambio).
const t6FirstBoth = t6.find((s) => s.bothAudio)
const t6Gap = t6IdxAt && t6FirstBoth ? Math.max(0, t6FirstBoth.t - t6IdxAt.t) : 99999
console.log(
  `[T6] índice→3 en ${t6IdxAt ? t6IdxAt.t + 'ms' : 'NUNCA'} | muestras en silencio=${t6Silence} | ` +
    `solape≈${t6Overlap}ms | gap aspecto→audio=${t6Gap}ms | miniCx=${t6MiniCx} | ` +
    `final playing=${t6End.playing} buffering=${t6End.buffering}`
)
results.T6 = { t6IdxAt, t6Silence, t6Overlap, t6MiniCx, t6End, t6Gap }

// ---------- T7: toda la cola precargada para saltos instantáneos (F54) ----------
console.log('\n--- T7: precarga de URLs de toda la cola ---')
await startQueue(TRACKS, 0)
await waitPlaying()
let t7Urls = 0
for (let i = 0; i < 24; i++) {
  await win.waitForTimeout(500)
  t7Urls = await win.evaluate(() => window.__erosMusicPreloadStats().urls)
  if (t7Urls >= 6) break
}
console.log(`[T7] URLs resueltas en el mapa: ${t7Urls}/6`)
results.T7 = { urls: t7Urls }

// ---------- T8: un solo clic en la cola salta a la canción (F55) ----------
console.log('\n--- T8: un clic (no doble) en la cola salta a esa canción ---')
const t8Before = await S()
// Segunda fila de "A continuación" = índice actual + 2
await win.locator('.queue-panel .qp-list button.library-row').nth(1).click()
let t8After = t8Before
for (let i = 0; i < 20; i++) {
  await win.waitForTimeout(250)
  t8After = await S()
  if (t8After.index !== t8Before.index) break
}
console.log(`[T8] index ${t8Before.index} → ${t8After.index} (esperado ${t8Before.index + 2})`)
results.T8 = { before: t8Before.index, after: t8After.index }

// ---------- T9: mini-player — volumen + crossfade visual (F56) ----------
console.log('\n--- T9: mini-player (mute a 1 clic, slider, crossfade visual) ---')
const miniPromise = app.waitForEvent('window', { timeout: 15000 }).catch(() => null)
await win.evaluate(() => window.api.mini.toggle())
const mini = await miniPromise
let t9 = { opened: false, muted: false, restored: false, coverLayers: 0, popover: false }
if (mini) {
  await mini.waitForLoadState('domcontentloaded')
  await mini.waitForTimeout(1800) // llega el primer estado por IPC
  t9.opened = (await mini.locator('[data-testid="mini-volume"]').count()) > 0
  // Mute a 1 clic → el volumen REAL del reproductor principal baja a 0
  const volBefore = await win.evaluate(() => window.__erosMusicPlayerStore.getState().volume)
  await mini.locator('[data-testid="mini-volume"]').click()
  await mini.waitForTimeout(600)
  const volMuted = await win.evaluate(() => window.__erosMusicPlayerStore.getState().volume)
  t9.muted = volBefore > 0 && volMuted === 0
  // Segundo clic → restaura
  await mini.locator('[data-testid="mini-volume"]').click()
  await mini.waitForTimeout(600)
  const volRestored = await win.evaluate(() => window.__erosMusicPlayerStore.getState().volume)
  t9.restored = Math.abs(volRestored - volBefore) < 0.02
  // El hover despliega el slider
  await mini.locator('[data-testid="mini-volume"]').hover()
  await mini.waitForTimeout(300)
  t9.popover = (await mini.locator('[data-testid="mini-volume-popover"] input').count()) > 0
  // Crossfade visual en el mini: fuerza un fade y cuenta capas de carátula
  await seekToRemaining(10)
  for (let i = 0; i < 30; i++) {
    await win.waitForTimeout(250)
    const cxActive = await win.evaluate(() =>
      Boolean(window.__erosMusicPlayerStore.getState().crossfading)
    )
    if (cxActive) break
  }
  await win.waitForTimeout(600)
  t9.coverLayers = await mini.evaluate(
    () => document.querySelectorAll('img').length
  )
}
console.log(
  `[T9] abierto=${t9.opened} mute=${t9.muted} restaura=${t9.restored} ` +
    `popover=${t9.popover} capasCover=${t9.coverLayers}`
)
results.T9 = t9

// ---------- Veredicto ----------
console.log('\n========== VEREDICTO ==========')
const checks = [
  ['T0 natural: solape audio ≥ 3s', results.T0.overlapMs >= 3000],
  ['T0 natural: avance exacto +1', results.T0.idxAfter === results.T0.idxBefore + 1],
  ['T0 natural: crossfading publicado', results.T0.sawCx],
  ['T0 natural: capas visuales carátula', results.T0.sawCoverLayers],
  ['T0 natural: fade de texto', results.T0.sawTextOut],
  ['T0 natural: colores interpolando (≥4 hues)', results.T0.hueCount >= 4],
  ['T0 natural: acento interpolando (≥4 valores)', results.T0.accentCount >= 4],
  ['T0 F51: cola en modo mezcla (fila saliente colapsando)', results.T0.sawQpMix],
  ['T0 F51: subrayado de progreso en la cola', results.T0.sawQpProgress],
  ['T0 F51: carátula grande del visualizador en doble capa', results.T0.sawVizLayers],
  ['T0 F51: fondo difuminado en doble capa', results.T0.sawBgOut],
  ['T1 seek+margen: solape ≥ 3s', results.T1.overlapMs >= 3000],
  ['T1 avance exacto +1', results.T1.idxAfter === results.T1.idxBefore + 1],
  ['T2 rearme: re-crossfade dispara (solape ≥ 3s)', results.T2.overlapMs >= 3000],
  ['T2 avance exacto +1', results.T2.idxAfter === results.T2.idxBefore + 1],
  ['T3 rem≈3s: sin doble salto (avance exacto +1)', results.T3.idxAfter === results.T3.expectedIdx],
  ['T3 con algo de solape (fade corto ≥ 0.5s)', results.T3.overlapMs >= 500],
  ['T4 cola ampliada con autoplay', results.T4ext],
  ['T4 crossfade al encadenar (solape ≥ 3s)', results.T4.overlapMs >= 3000],
  ['T5 F52: carátula estable al acabar el fade (sin reaparición)', results.T5.minArt >= 0.95],
  ['T5 F52: fondo estable al acabar el fade (sin reaparición)', results.T5.minBg >= 0.95],
  ['T6 F53: índice cambia al instante (≤300ms)', Boolean(results.T6.t6IdxAt) && results.T6.t6IdxAt.t <= 300],
  ['T6 F53: sin silencio en el salto manual (≤1 muestra)', results.T6.t6Silence <= 1],
  ['T6 F53: mini-fundido audible (solape ≥ 300ms)', results.T6.t6Overlap >= 300],
  ['T6 F53: crossfading visual corto publicado (≤1.5s)', results.T6.t6MiniCx],
  ['T6 F53: acaba reproduciendo sin "cargando"', results.T6.t6End.playing && !results.T6.t6End.buffering],
  ['T6 F54: aspecto y audio cambian juntos (gap ≤600ms)', results.T6.t6Gap <= 600],
  ['T7 F54: toda la cola con URL precargada', results.T7.urls >= 6],
  ['T8 F55: un solo clic en la cola salta a la canción', results.T8.after === results.T8.before + 2],
  ['T9 F56: mini-player abre y recibe estado', results.T9.opened],
  ['T9 F56: mute a 1 clic desde el mini', results.T9.muted],
  ['T9 F56: segundo clic restaura el volumen', results.T9.restored],
  ['T9 F56: hover despliega el slider de volumen', results.T9.popover],
  ['T9 F56: crossfade visual en el mini (2 capas de carátula)', results.T9.coverLayers >= 2],
  ['Sin errores de página', errors.length === 0]
]
let pass = 0
for (const [name, ok] of checks) {
  console.log(`${ok ? '✅' : '❌'} ${name}`)
  if (ok) pass++
}
console.log(`\n${pass}/${checks.length} OK`)
if (errors.length) console.log('pageerrors:', errors.slice(0, 5))
await app.close()
process.exit(pass === checks.length ? 0 : 1)
