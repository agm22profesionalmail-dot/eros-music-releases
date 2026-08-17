/**
 * F37 · Crossfade real: con crossfadeSec=6 y la cola restaurada, saltamos a
 * duración-6.5s y comprobamos que la SIGUIENTE pista arranca mientras la
 * actual sigue sonando (ambos <audio> reproduciendo = solape de verdad).
 * Antes del fix, la transición solo ocurría tras 'ended' (sin solape posible).
 */
import { _electron } from 'playwright'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
const check = (name, cond) => {
  console.log(cond ? `  OK  ${name}` : `  FAIL ${name}`)
  if (!cond) failures++
}

const app = await _electron.launch({
  args: ['.'],
  cwd: root,
  env: { ...process.env, EROS_E2E: '1' }
})
const win = await app.firstWindow()
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(1800)
// Silencio absoluto durante todo el test
await win.evaluate(() => {
  document.querySelectorAll('audio').forEach((a) => (a.muted = true))
  new MutationObserver(() => {
    document.querySelectorAll('audio').forEach((a) => (a.muted = true))
  }).observe(document.body, { childList: true, subtree: true })
})

const originalSettings = await win.evaluate(() => window.api.settings.get())
await win.evaluate(() => window.api.settings.set({ crossfadeSec: 6 }))
await win.waitForTimeout(400)

// Arranca reproducción (cola persistida de la sesión anterior → botón play)
const playBtn = win.locator('.np-play')
if (!(await playBtn.count())) {
  console.log('FAIL: sin botón de play (¿cola vacía?)')
  await app.close()
  process.exit(1)
}
await playBtn.first().click()

// Espera a que haya un deck sonando con duración conocida
let ready = null
for (let i = 0; i < 40; i++) {
  await win.waitForTimeout(500)
  ready = await win.evaluate(() => {
    const els = [...document.querySelectorAll('audio')]
    const playing = els.filter((a) => a.src && !a.paused && a.duration > 30)
    return playing.length === 1
      ? { duration: playing[0].duration, current: playing[0].currentTime }
      : null
  })
  if (ready) break
}
check(`reproducción activa (dur=${ready?.duration?.toFixed(0)}s)`, Boolean(ready))
if (!ready) {
  await app.close()
  process.exit(1)
}

// Deja tiempo a que la precarga de la siguiente pista termine
await win.waitForTimeout(6000)

const titleBefore = await win.evaluate(
  () => document.querySelector('.np-title, .nowplaying .title')?.textContent ?? ''
)

// Salta a 6.5 s del final: el early-trigger debe disparar el solape
await win.evaluate(() => {
  const els = [...document.querySelectorAll('audio')]
  const active = els.find((a) => a.src && !a.paused && a.duration > 30)
  if (active) active.currentTime = active.duration - 6.5
})

// Muestrea cada 400 ms buscando el momento con DOS decks sonando a la vez
let overlapSeen = false
let samples = []
for (let i = 0; i < 25; i++) {
  await win.waitForTimeout(400)
  const st = await win.evaluate(() => {
    const els = [...document.querySelectorAll('audio')]
    return els.map((a) => ({ has: Boolean(a.src), playing: Boolean(a.src) && !a.paused }))
  })
  const playing = st.filter((s) => s.playing).length
  samples.push(playing)
  if (playing >= 2) {
    overlapSeen = true
    break
  }
}
check(
  `solape real: dos decks sonando a la vez durante la transición (muestras: ${samples.join(',')})`,
  overlapSeen
)

// Tras el fade la pista anterior se limpia y avanza el título
await win.waitForTimeout(8000)
const after = await win.evaluate(() => {
  const els = [...document.querySelectorAll('audio')]
  const playing = els.filter((a) => a.src && !a.paused)
  return {
    playing: playing.length,
    title: document.querySelector('.np-title, .nowplaying .title')?.textContent ?? ''
  }
})
check(`tras el fade queda un solo deck sonando (${after.playing})`, after.playing === 1)
check(
  `la pista avanzó ("${titleBefore.slice(0, 30)}" → "${after.title.slice(0, 30)}")`,
  after.title !== titleBefore && after.title.length > 0
)

// Restaura ajustes y para la música
await win.evaluate((s) => window.api.settings.set({ crossfadeSec: s.crossfadeSec ?? 0 }), originalSettings)
await win.evaluate(() => document.querySelectorAll('audio').forEach((a) => a.pause()))

await app.close()
console.log(failures === 0 ? '\nF37 · TODO OK' : `\nF37 · ${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
