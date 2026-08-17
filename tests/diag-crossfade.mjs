/**
 * Diagnóstico del crossfade — captura todos los console.log del engine y
 * store, arranca reproducción, fuerza el escenario final-6.5s, y observa
 * segundo a segundo qué pasa en los DOS decks (paused/currentTime/duration).
 */
import { _electron } from 'playwright'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const app = await _electron.launch({
  args: ['.'],
  cwd: root,
  env: { ...process.env, EROS_E2E: '1' }
})
app.process().stderr?.on('data', (d) => {
  const s = String(d).trim()
  if (s && !s.includes('Debug')) console.log('[main]', s.slice(0, 300))
})
const win = await app.firstWindow()
win.on('console', (msg) => {
  const t = msg.text()
  if (t.includes('[engine.load]') || t.includes('[crossfade]') || t.includes('crossfade')) {
    console.log(`[renderer:${msg.type()}] ${t}`)
  }
})
win.on('pageerror', (e) => console.log('[pageerror]', e.message))
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(1500)
await win.evaluate(() => {
  document.querySelectorAll('audio').forEach((a) => (a.muted = true))
  new MutationObserver(() => {
    document.querySelectorAll('audio').forEach((a) => (a.muted = true))
  }).observe(document.body, { childList: true, subtree: true })
})

const originalXf = await win.evaluate(() => window.api.settings.get())
await win.evaluate(() => window.api.settings.set({ crossfadeSec: 6 }))
await win.waitForTimeout(400)
console.log('crossfadeSec=6 configurado')

await win.locator('.np-play').first().click()
console.log('play pulsado, esperando arranque...')

// Espera arranque
let ready = null
for (let i = 0; i < 40; i++) {
  await win.waitForTimeout(500)
  ready = await win.evaluate(() => {
    const els = [...document.querySelectorAll('audio')]
    const playing = els.filter((a) => a.src && !a.paused && a.duration > 30)
    return playing.length === 1 ? { duration: playing[0].duration } : null
  })
  if (ready) break
}
console.log(`arrancado, duración=${ready?.duration?.toFixed(0)}s`)
await win.waitForTimeout(5000)  // deja que precargue la siguiente

// Estado de precarga
const preloadState = await win.evaluate(() => {
  const els = [...document.querySelectorAll('audio')]
  return els.map((a, i) => ({
    idx: i,
    src: a.src ? a.src.slice(-30) : '(vacío)',
    paused: a.paused,
    readyState: a.readyState,
    dur: a.duration,
    currentTime: a.currentTime
  }))
})
console.log('estado ANTES de forzar final:', JSON.stringify(preloadState, null, 2))

// Fuerza escenario final-6.5s
await win.evaluate(() => {
  const els = [...document.querySelectorAll('audio')]
  const active = els.find((a) => a.src && !a.paused && a.duration > 30)
  if (active) {
    console.log('[test] forzando currentTime =', active.duration - 6.5)
    active.currentTime = active.duration - 6.5
  }
})

// Muestrea cada 500ms durante 8 segundos
console.log('=== observando 8s ===')
for (let i = 0; i < 16; i++) {
  await win.waitForTimeout(500)
  const st = await win.evaluate(() => {
    const els = [...document.querySelectorAll('audio')]
    return els.map((a, i) => {
      // Extrae ID de la URL del proxy local: /stream/<videoId>?...
      const m = a.src.match(/stream\/([\w-]+)/)
      const vid = m ? m[1] : '?'
      return {
        idx: i,
        paused: a.paused,
        ct: a.currentTime?.toFixed(2),
        vid,
        rs: a.readyState,
        vol: a.volume?.toFixed(2)
      }
    })
  })
  console.log(`t+${(i * 0.5).toFixed(1)}s:`, JSON.stringify(st))
}

await win.evaluate((s) => window.api.settings.set({ crossfadeSec: s.crossfadeSec ?? 0 }), originalXf)
await app.close()
console.log('diagnóstico completo')
