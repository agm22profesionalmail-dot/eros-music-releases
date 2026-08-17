import { _electron } from 'playwright'
const app = await _electron.launch({ args: ['.'], cwd: 'F:/MetrolistPC', env: { ...process.env,  NO_E2E: "1" } })
app.process().stderr?.on('data', (d) => {
  const s = String(d).trim()
  if (s && !s.includes('Debug') && !s.includes('YOUTUBEJS')) console.log('[main]', s.slice(0, 300))
})
const win = await app.firstWindow()
win.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning' || msg.text().includes('engine') || msg.text().includes('crossfade') || msg.text().includes('Sin URL')) {
    console.log(`[renderer:${msg.type()}]`, msg.text().slice(0, 400))
  }
})
win.on('pageerror', (e) => console.log('[pageerror]', e.message))
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(2000)
await win.evaluate(() => document.querySelectorAll('audio').forEach((a) => (a.muted = true)))
console.log('--- pulso play ---')
await win.locator('.np-play').first().click()
for (let i = 0; i < 12; i++) {
  await win.waitForTimeout(1000)
  const st = await win.evaluate(() => {
    const els = [...document.querySelectorAll('audio')]
    return {
      audios: els.map((a, i) => ({ i, paused: a.paused, ct: a.currentTime?.toFixed(2), dur: a.duration?.toFixed(0), rs: a.readyState, err: a.error?.code, src: a.src ? a.src.slice(-20) : '' })),
    }
  })
  console.log(`t+${i}s:`, JSON.stringify(st))
}
await app.close()
