import { _electron } from 'playwright'
const app = await _electron.launch({
  // F63 · el instalador v1.2.0+ (name `eros-music`) instala aquí; las
  // versiones viejas vivían en .../Programs/metrolist-pc/Metrolist PC.exe
  executablePath: "C:/Users/Zero/AppData/Local/Programs/eros-music/ERO'S Music.exe",
})
app.process().stderr?.on('data', (d) => {
  const s = String(d).trim()
  if (s && !s.includes('Debug') && !s.includes('YOUTUBEJS')) console.log('[main]', s.slice(0, 400))
})
const win = await app.firstWindow()
win.on('console', (msg) => {
  const t = msg.text()
  if (msg.type() === 'error' || msg.type() === 'warning' || t.includes('engine') || t.includes('crossfade') || t.includes('Sin URL') || t.includes('timeout') || t.includes('preparar')) {
    console.log(`[renderer:${msg.type()}]`, t.slice(0, 400))
  }
})
win.on('pageerror', (e) => console.log('[pageerror]', e.message))
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(2000)
await win.evaluate(() => document.querySelectorAll('audio').forEach((a) => (a.muted = true)))
console.log('--- pulso play ---')
await win.locator('.np-play').first().click()
for (let i = 0; i < 25; i++) {
  await win.waitForTimeout(1000)
  const st = await win.evaluate(() => {
    const els = [...document.querySelectorAll('audio')]
    return {
      audios: els.map((a, i) => ({ i, paused: a.paused, ct: a.currentTime?.toFixed(2), dur: a.duration?.toFixed(0), rs: a.readyState, err: a.error?.code, src: a.src ? a.src.slice(-24) : '' })),
      buffering: window.__erosMusicSettingsStore ? 'present' : '-'
    }
  })
  console.log(`t+${i}s:`, JSON.stringify(st))
}
await app.close()
