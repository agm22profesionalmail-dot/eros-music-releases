/**
 * Auditoría visual sistemática: recorre TODAS las pantallas y estados,
 * captura y hace zoom en zonas típicas de bugs (bordes, iconos, textos truncados).
 */
import { _electron } from 'playwright'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shots = join(root, 'tests', 'audit')
mkdirSync(shots, { recursive: true })

const app = await _electron.launch({ args: ['.'], cwd: root })
const win = await app.firstWindow()
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(2000)
await win.setViewportSize({ width: 1280, height: 800 })
// Silencio durante la auditoría (el usuario está en otra cosa)
await win.evaluate(() => {
  document.querySelectorAll('audio').forEach((a) => (a.muted = true))
  window.__mmObserver = new MutationObserver(() => {
    document.querySelectorAll('audio').forEach((a) => (a.muted = true))
  })
  window.__mmObserver.observe(document.body, { childList: true, subtree: true })
})

const shot = async (page, name) => {
  try {
    await page.screenshot({ path: join(shots, `${name}.png`) })
    console.log('shot:', name)
  } catch (e) {
    console.log('skip:', name, String(e).slice(0, 80))
  }
}
const step = async (name, fn) => {
  try {
    await fn()
  } catch (e) {
    console.log('step-fail:', name, String(e).slice(0, 120))
  }
}

// 1. Home
await shot(win, '01-home')

// 2. Sidebar zoom (iconos, filas de biblioteca, corazón truncado)
await win.locator('.sidebar').screenshot({ path: join(shots, '02-sidebar.png') })

// 3. Now playing bar en frío (sin música)
await win.locator('.nowplaying').screenshot({ path: join(shots, '03-npbar-cold.png') })

// 4. Empieza a reproducir
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.locator('.topbar-search input').fill('daft punk')
await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 15000 })
await win.waitForTimeout(1000)
await shot(win, '04-search-results')

// 4b. Zoom a la tabla de pistas (mira #, iconos, hover, truncados)
await win.locator('.track-table').first().screenshot({ path: join(shots, '05-track-table.png') })

await win.locator('.track-row').first().hover()
await win.waitForTimeout(300)
await win.locator('.track-row').first().screenshot({ path: join(shots, '06-track-row-hover.png') })

// 5. Reproduce y captura la barra caliente
await win.locator('.track-row').first().locator('.play-hover').click()
await win.locator('.np-left .title').waitFor({ state: 'visible', timeout: 20000 })
await win.waitForTimeout(3500)
await win.locator('.nowplaying').screenshot({ path: join(shots, '07-npbar-hot.png') })

// 6. Panel de cola
await win.locator('[aria-label="Cola"]').click()
await win.waitForTimeout(400)
await shot(win, '08-queue-open')
await win.locator('.queue-panel').screenshot({ path: join(shots, '09-queue-panel.png') })
await win.locator('[aria-label="Cerrar cola"]').click()

// 7. Home con música sonando (ambiente activo)
await win.locator('.sidebar-nav-item', { hasText: 'Inicio' }).click()
await win.waitForTimeout(2000)
await shot(win, '10-home-ambient')

// 8. Página de álbum (busca uno específicamente)
await step('album', async () => {
  await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
  await win.locator('.topbar-search input').fill('daft punk discovery')
  await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 15000 })
  await win.waitForTimeout(1500)
  // Buscar la sección de Álbumes en la página
  const albumCard = win.locator('h2:has-text("Álbumes") + .card-grid .media-card').first()
  if (await albumCard.count()) {
    await albumCard.click()
    await win.locator('.detail-header').waitFor({ state: 'visible', timeout: 10000 })
    await win.waitForTimeout(2500)
    await shot(win, '11-album-detail')
    await win.locator('.detail-header').screenshot({ path: join(shots, '12-detail-header.png') })
  }
})

// 9. Página de artista
await step('artist', async () => {
  const backBtn = win.locator('.nav-circle').first()
  await backBtn.click()
  await win.waitForTimeout(800)
  await win.locator('.topbar-search input').fill('daft punk')
  await win.locator('.media-card.artist').first().waitFor({ state: 'visible', timeout: 10000 })
  await win.locator('.media-card.artist').first().click()
  await win.waitForTimeout(2500)
  await shot(win, '13-artist-page')
})

// 10. Biblioteca (todas las pestañas)
await step('library', async () => {
  await win.locator('.sidebar-library-header button').first().click()
  await win.waitForTimeout(1500)
  for (const tab of ['Playlists', 'Álbumes', 'Artistas', 'Canciones', 'Historial', 'Descargas']) {
    await step(`library-${tab}`, async () => {
      // Los chips de la biblioteca están en el body de la página, no en el sidebar
      await win.locator('.page .sidebar-filters .chip', { hasText: tab }).first().click()
      await win.waitForTimeout(800)
      await shot(win, `14-library-${tab.toLowerCase().replace('á', 'a')}`)
    })
  }
})

// 11. Página de playlist propia
await step('playlist', async () => {
  await win.locator('.page .sidebar-filters .chip', { hasText: 'Playlists' }).first().click()
  await win.waitForTimeout(600)
  await win.locator('.card-grid .media-card').first().click()
  await win.waitForTimeout(2500)
  await shot(win, '15-playlist-page')
})

// 12. Letras
await step('lyrics', async () => {
  await win.locator('[aria-label="Letra"]').click()
  await win.waitForTimeout(6000)
  await shot(win, '16-lyrics')
})

// 13. Visualizador
await step('visualizer', async () => {
  await win.locator('[aria-label="Visualizador"]').click()
  await win.waitForTimeout(3500)
  await shot(win, '17-visualizer')
})

// 14. Ajustes (todas las secciones scrolleadas)
await step('settings', async () => {
  // Navegar directo al store del router
  await win.evaluate(() => {
    // no hay window.api.route, pero el botón ajustes navega
  })
  // Buscamos el botón de settings — usamos su selector
  const gearBtn = win.locator('.topbar-right button').first()
  await gearBtn.click()
  await win.waitForTimeout(1200)
  await shot(win, '18-settings-top')
  await win.evaluate(() => document.querySelector('.main-scroll')?.scrollTo({ top: 700 }))
  await win.waitForTimeout(500)
  await shot(win, '19-settings-mid')
  await win.evaluate(() => document.querySelector('.main-scroll')?.scrollTo({ top: 1400 }))
  await win.waitForTimeout(500)
  await shot(win, '20-settings-bottom')
  await win.evaluate(() => document.querySelector('.main-scroll')?.scrollTo({ top: 2100 }))
  await win.waitForTimeout(500)
  await shot(win, '20b-settings-bottom2')
})

// 15. Mini-player
await win.evaluate(() => document.querySelector('.main-scroll')?.scrollTo({ top: 0 }))
await win.waitForTimeout(300)
await step('mini', async () => {
await win.locator('[aria-label="Mini-player"]').click()
let mini = null
for (let i = 0; i < 20 && !mini; i++) {
  await win.waitForTimeout(400)
  mini = app.windows().find((w) => w.url().includes('#/mini') && !w.url().includes('settings'))
}
if (mini) {
  await mini.waitForLoadState('domcontentloaded')
  await mini.waitForTimeout(2000)
  await shot(mini, '21-mini-normal')
  await mini.hover('body')
  await mini.waitForTimeout(400)
  await shot(mini, '22-mini-hover')

  // Karaoke on
  await win.evaluate(() => window.api.settings.set({ miniKaraoke: true }))
  await mini.waitForTimeout(5000)
  await shot(mini, '23-mini-karaoke')
  await win.evaluate(() => window.api.settings.set({ miniKaraoke: false }))

  // Mini settings
  await mini.hover('body')
  await mini.locator('[title="Ajustes del mini-player"]').click()
  let sett = null
  for (let i = 0; i < 20 && !sett; i++) {
    await win.waitForTimeout(400)
    sett = app.windows().find((w) => w.url().includes('#/mini-settings'))
  }
  if (sett) {
    await sett.waitForLoadState('domcontentloaded')
    await sett.waitForTimeout(600)
    await shot(sett, '24-mini-settings')
    await sett.locator('[aria-label="Cerrar"]').click()
  }
  await mini.hover('body')
  await mini.locator('[title="Cerrar mini-player"]').click()
}
})

// 16. Búsqueda vacía
await step('search-empty', async () => {
  await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
  await win.locator('.topbar-search input').fill('')
  await win.waitForTimeout(500)
  await shot(win, '25-search-empty')
})

// 17. Menú contextual sobre una pista
await step('context', async () => {
  await win.locator('.topbar-search input').fill('daft punk')
  await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 10000 })
  await win.waitForTimeout(800)
  await win.locator('.track-row').first().click({ button: 'right' })
  await win.waitForTimeout(400)
  await shot(win, '26-context-menu')
  await win.keyboard.press('Escape')
  await win.waitForTimeout(200)
})

// 18. TextModal (crear playlist)
await step('modal', async () => {
  await win.locator('.sidebar-library-header button').nth(1).click()
  await win.waitForTimeout(500)
  await shot(win, '27-text-modal')
  await win.keyboard.press('Escape')
})

// 19. Sidebar plegado por resize pequeño
await step('resize', async () => {
  await win.setViewportSize({ width: 900, height: 600 })
  await win.waitForTimeout(600)
  await shot(win, '28-small-viewport')
  await win.setViewportSize({ width: 1280, height: 800 })
})

await app.close()
console.log('Auditoría completa en', shots)
