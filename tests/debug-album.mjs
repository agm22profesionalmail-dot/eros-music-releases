import { _electron } from 'playwright'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const app = await _electron.launch({ args: ['.'], cwd: root })
const win = await app.firstWindow()
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(2000)
await win.evaluate(() => document.querySelectorAll('audio').forEach((a) => (a.muted = true)))
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.locator('.topbar-search input').fill('daft punk discovery')
await win.waitForTimeout(2500)
const albumCard = win.locator('.media-card').filter({ hasText: 'Discovery' }).first()
await albumCard.click()
await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 10000 })
await win.waitForTimeout(1500)
const info = await win.evaluate(() => {
  const rows = document.querySelectorAll('.track-row')
  return {
    rowCount: rows.length,
    firstRowHTML: rows[0]?.outerHTML?.slice(0, 500),
    imgs: [...document.querySelectorAll('.track-row img')].map((i) => ({
      src: (i.src || '').slice(0, 80),
      w: i.width,
      h: i.height,
      cls: i.className,
      parent: i.parentElement?.className
    })).slice(0, 3),
    tableClasses: [...document.querySelectorAll('.track-table')].map((t) => t.className)
  }
})
console.log(JSON.stringify(info, null, 2))
await app.close()
