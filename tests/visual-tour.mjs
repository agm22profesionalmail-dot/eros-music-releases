/**
 * Tour visual del rediseño: captura shell con ambiente, detalle de álbum,
 * visualizador y mini-player con la nueva estética.
 */
import { _electron } from 'playwright'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shots = join(root, 'tests', 'shots', 'v3')
mkdirSync(shots, { recursive: true })

const app = await _electron.launch({ args: ['.'], cwd: root })
app.process().stdout?.on('data', (d) => {
  const s = String(d).trim()
  if (s.includes('[stream]')) console.log('[main]', s)
})

const win = await app.firstWindow()
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(1800)
await win.setViewportSize({ width: 1280, height: 800 })

// 1) Reproducir algo popular con carátula colorida
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.locator('.topbar-search input').fill('daft punk discovery')
await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 15000 })
await win.waitForTimeout(1500)

// Abre el primer álbum
await win.locator('.media-card').first().click()
await win.locator('.detail-header').waitFor({ state: 'visible', timeout: 10000 })
await win.waitForTimeout(2500) // deja que el ambiente se asiente
await win.screenshot({ path: join(shots, '1-album-ambient.png') })
console.log('shot: 1-album-ambient.png')

// Lanza la reproducción del álbum
await win.locator('.big-play').click()
await win.waitForTimeout(4500)
await win.screenshot({ path: join(shots, '2-playing.png') })

// 2) Visualizador
await win.locator('[aria-label="Visualizador"]').click()
await win.waitForTimeout(3000)
await win.screenshot({ path: join(shots, '3-visualizer.png') })

// 3) Home con carátulas variadas
await win.locator('.sidebar-nav-item', { hasText: 'Inicio' }).click()
await win.waitForTimeout(2500)
await win.screenshot({ path: join(shots, '4-home.png') })

// 4) Mini-player con el ambiente
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.waitForTimeout(600)
await win.locator('[aria-label="Mini-player"]').click()
let miniPage = null
for (let i = 0; i < 20 && !miniPage; i++) {
  await win.waitForTimeout(400)
  miniPage = app.windows().find((w) => w.url().includes('#/mini'))
}
if (miniPage) {
  await miniPage.waitForLoadState('domcontentloaded')
  await miniPage.waitForTimeout(2500)
  await miniPage.screenshot({ path: join(shots, '5-mini.png') })
  await miniPage.locator('[title="Cerrar mini-player"]').click({ timeout: 5000 }).catch(() => undefined)
}

await app.close()
console.log('Todo capturado en', shots)
