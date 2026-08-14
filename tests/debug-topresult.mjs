import { _electron } from 'playwright'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const app = await _electron.launch({ args: ['.'], cwd: root })
app.process().stdout?.on('data', (d) => {
  const s = String(d).trim()
  if (s.includes('[search]')) console.log('MAIN:', s)
})
const win = await app.firstWindow()
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(2500)
const res = await win.evaluate(async () => {
  const r = await window.api.music.search('daft punk get lucky', 'all')
  return {
    hasTopResult: !!r.topResult,
    topResult: r.topResult,
    songCount: r.songs.length,
    firstSong: r.songs[0]?.title,
    keys: Object.keys(r)
  }
})
console.log(JSON.stringify(res, null, 2))
await win.waitForTimeout(500)
await app.close()
