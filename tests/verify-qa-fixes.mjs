/**
 * Verifica de forma dirigida los hallazgos del QA integral que pueden ser
 * bugs reales, distinguiendo de los falsos positivos por selector.
 */
import { _electron } from 'playwright'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const app = await _electron.launch({ args: ['.'], cwd: root })
const win = await app.firstWindow()
await win.waitForLoadState('domcontentloaded')
// Muted
await win.evaluate(() => {
  const mute = () => document.querySelectorAll('audio').forEach((a) => (a.muted = true))
  mute()
  new MutationObserver(mute).observe(document.body, { childList: true, subtree: true })
})
await win.waitForTimeout(2000)
await win.setViewportSize({ width: 1280, height: 800 })

const check = (name, cond, detail = '') => {
  console.log(cond ? `  OK  ${name}` : `  BUG ${name}${detail ? ' — ' + detail : ''}`)
}

// 1) Home: `.shelf` visible ahora
await win.locator('.sidebar-nav-item', { hasText: 'Inicio' }).click()
await win.waitForTimeout(3000)
const shelves = await win.locator('.shelf').count()
check(`Home .shelf count (>0)`, shelves > 0, `count=${shelves}`)

// 2) TextModal: clic en + del sidebar abre modal con clase estable
await win.locator('.sidebar-library-header .icon-btn').click()
await win.waitForTimeout(500)
const modal = await win.locator('.text-modal-overlay, .text-modal').count()
check(`TextModal se abre con clase estable`, modal > 0, `count=${modal}`)
await win.keyboard.press('Escape')
await win.waitForTimeout(200)

// 3) Cambio de tema propaga al main
await win.evaluate(() => window.api.settings.set({ theme: 'black' }))
await win.waitForTimeout(600)
const themeAfterBlack = await win.evaluate(() => document.documentElement.dataset.theme)
check(`Tema propaga: black`, themeAfterBlack === 'black', `dataset.theme=${themeAfterBlack}`)
await win.evaluate(() => window.api.settings.set({ theme: 'light' }))
await win.waitForTimeout(600)
const themeAfterLight = await win.evaluate(() => document.documentElement.dataset.theme)
check(`Tema propaga: light`, themeAfterLight === 'light', `dataset.theme=${themeAfterLight}`)
// Restaurar
await win.evaluate(() => window.api.settings.set({ theme: 'dark' }))
await win.waitForTimeout(400)

// 4) playbackRate se aplica al elemento activo
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.locator('.topbar-search input').fill('daft punk')
await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 15000 })
await win.waitForTimeout(1200)
await win.locator('.track-row').first().hover()
await win.locator('.track-row').first().locator('.play-hover').click()
await win.locator('.np-left .title').waitFor({ state: 'visible', timeout: 20000 })
await win.waitForTimeout(2500)

const rateBefore = await win.evaluate(() => document.querySelector('audio')?.playbackRate)
await win.evaluate(() => window.api.settings.set({ playbackRate: 1.5 }))
await win.waitForTimeout(1000)
const rateAfter = await win.evaluate(() => document.querySelector('audio')?.playbackRate)
check(`playbackRate se aplica en vivo`, rateAfter === 1.5, `${rateBefore} -> ${rateAfter}`)
await win.evaluate(() => window.api.settings.set({ playbackRate: 1 }))
await win.waitForTimeout(400)

// 5) Búsqueda con "Mejor resultado"
await win.locator('.topbar-search input').fill('daft punk get lucky')
await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 15000 })
await win.waitForTimeout(1200)
const hasTopResult = await win.locator('h2', { hasText: 'Mejor resultado' }).count()
check(`Sección Mejor resultado aparece`, hasTopResult > 0, `count=${hasTopResult}`)

// 6) LyricsPage tiene .lyrics-bg (blur del fondo)
await win.locator('[aria-label="Letra"]').click()
await win.waitForTimeout(3000)
const bg = await win.locator('.lyrics-bg').count()
check(`LyricsPage tiene .lyrics-bg`, bg > 0, `count=${bg}`)

// 7) Álbum: sin thumbnails en filas. Uso la sección "Álbumes" explícita.
await win.locator('.topbar-search input').fill('daft punk')
await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 10000 })
await win.waitForTimeout(1200)
await win.locator('.chip', { hasText: 'Álbumes' }).click()
await win.waitForTimeout(1500)
const albumCard = win.locator('.media-card.album').first()
if ((await albumCard.count()) > 0) {
  await albumCard.click()
  await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 10000 })
  await win.waitForTimeout(1500)
  const info = await win.evaluate(() => ({
    tableClass: document.querySelector('.track-table')?.className,
    imgs: document.querySelectorAll('.track-row img').length,
    url: window.location.hash
  }))
  console.log('  álbum info:', JSON.stringify(info))
  check(
    `Álbum: 0 imágenes en filas (redundantes)`,
    info.imgs === 0,
    `class=${info.tableClass} imgs=${info.imgs}`
  )
}

await app.close()
console.log('\nVerificación completa.')
