import { _electron } from 'playwright'
const app = await _electron.launch({ args: ['.'], cwd: 'F:/MetrolistPC' })
app.process().stderr?.on('data', (d) => {
  const s = String(d).trim()
  if (s && !s.includes('YOUTUBEJS') && !s.includes('Debug')) console.log('[main]', s.slice(0, 250))
})
const win = await app.firstWindow()
win.on('console', (msg) => {
  const t = msg.text()
  if (t.includes('XFADE') || t.includes('early-trigger') || t.includes('crossfade') || t.includes('engine.load')) {
    console.log(t.slice(0, 200))
  }
})
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(2000)
await win.evaluate(() => document.querySelectorAll('audio').forEach((a) => (a.muted = true)))

// Fija xfade=6
await win.evaluate(() => window.api.settings.set({ crossfadeSec: 6 }))
await win.waitForTimeout(300)

console.log('--- play ---')
await win.locator('.np-play').first().click()
// Espera arranque
for (let i = 0; i < 30; i++) {
  await win.waitForTimeout(500)
  const ok = await win.evaluate(() => {
    const els = [...document.querySelectorAll('audio')]
    return els.some((a) => a.src && !a.paused && a.duration > 30)
  })
  if (ok) break
}
console.log('--- arrancado, espero al final ---')
// Espera 3s para que precargue la siguiente
await win.waitForTimeout(3000)
// Salto SEGURO: currentTime = duration - 15s (más que xfade+2 con margen)
// Ejecutamos SEEK menor (a la mitad) para que Chromium ya tenga buffer,
// y luego dejamos correr los últimos 15s naturalmente.
await win.evaluate(() => {
  const els = [...document.querySelectorAll('audio')]
  const active = els.find((a) => a.src && !a.paused && a.duration > 30)
  if (active) {
    console.log('[test] forcing ct to', (active.duration - 15).toFixed(1), 'from', active.currentTime.toFixed(1))
    active.currentTime = active.duration - 15
  }
})
// Observa durante 25s (15s naturales + 10s tras el fade)
for (let i = 0; i < 50; i++) {
  await win.waitForTimeout(500)
}
await app.close()
