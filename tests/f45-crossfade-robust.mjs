/**
 * F45 · Crossfade robusto: repetir el fundido MÚLTIPLES veces seguidas y
 * comprobar que siempre hay solape (dos <audio> reproduciendo a la vez
 * durante la transición) y que el título de la pista avanza. Antes del fix
 * "muchas veces fallaba" — un crossfade que a la primera funciona pero se
 * cae en la 2ª/3ª pasada por falta de precarga o por el flag `earlyFadeKey`
 * no reseteándose bien.
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
await win.waitForTimeout(2000)
await win.evaluate(() => {
  document.querySelectorAll('audio').forEach((a) => (a.muted = true))
  new MutationObserver(() => {
    document.querySelectorAll('audio').forEach((a) => (a.muted = true))
  }).observe(document.body, { childList: true, subtree: true })
})

const originalSettings = await win.evaluate(() => window.api.settings.get())
await win.evaluate(() => window.api.settings.set({ crossfadeSec: 6 }))
await win.waitForTimeout(400)

// Arranca reproducción (cola restaurada de sesión anterior)
const playBtn = win.locator('.np-play')
await playBtn.first().click()

// Espera a que arranque el primer deck
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
await win.waitForTimeout(4000)

// Realiza 3 crossfades seguidos, saltando al final de cada pista
const overlapResults = []
const titleAdvances = []
for (let round = 1; round <= 3; round++) {
  console.log(`\n--- Ronda ${round} ---`)
  const titleBefore = await win.evaluate(
    () => document.querySelector('.np-title, .nowplaying .title')?.textContent ?? ''
  )

  // Salta al final-6.5 s para forzar el early trigger
  await win.evaluate(() => {
    const els = [...document.querySelectorAll('audio')]
    const active = els.find((a) => a.src && !a.paused && a.duration > 30)
    if (active) active.currentTime = active.duration - 6.5
  })

  // Muestrea buscando el solape
  let overlapSeen = false
  let samples = []
  for (let i = 0; i < 30; i++) {
    await win.waitForTimeout(400)
    const st = await win.evaluate(() => {
      const els = [...document.querySelectorAll('audio')]
      return els.map((a) => ({ playing: Boolean(a.src) && !a.paused }))
    })
    const playing = st.filter((s) => s.playing).length
    samples.push(playing)
    if (playing >= 2) {
      overlapSeen = true
      break
    }
  }
  console.log(`   muestras: ${samples.join(',')}`)
  overlapResults.push(overlapSeen)

  // Deja que el fade complete y la cola avance
  await win.waitForTimeout(8000)

  const after = await win.evaluate(() => {
    const els = [...document.querySelectorAll('audio')]
    return {
      playing: els.filter((a) => a.src && !a.paused).length,
      title: document.querySelector('.np-title, .nowplaying .title')?.textContent ?? ''
    }
  })
  const advanced = after.title !== titleBefore && after.title.length > 0
  titleAdvances.push(advanced)
  check(
    `ronda ${round}: solape real (${overlapSeen}) + título avanzó (${advanced}: "${titleBefore.slice(0, 20)}" → "${after.title.slice(0, 20)}")`,
    overlapSeen && advanced
  )
}

// Asegura que TODAS las rondas tuvieron solape y avance
check(
  `3/3 rondas con solape correcto (${overlapResults.filter(Boolean).length}/3)`,
  overlapResults.every(Boolean)
)
check(
  `3/3 rondas con avance de título (${titleAdvances.filter(Boolean).length}/3)`,
  titleAdvances.every(Boolean)
)

// Restaura y limpia
await win.evaluate(
  (s) => window.api.settings.set({ crossfadeSec: s.crossfadeSec ?? 0 }),
  originalSettings
)
await win.evaluate(() => document.querySelectorAll('audio').forEach((a) => a.pause()))

await app.close()
console.log(failures === 0 ? '\nF45 · TODO OK' : `\nF45 · ${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
