/**
 * Ronda 2 del tour visual: letras a pantalla completa y visualizador vinilo.
 * Espera si hay ya una instancia (el QA del mini) y reintenta.
 */
import { _electron } from 'playwright'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shots = join(root, 'tests', 'shots', 'v3')
mkdirSync(shots, { recursive: true })

async function launch() {
  for (let i = 0; i < 12; i++) {
    try {
      return await _electron.launch({ args: ['.'], cwd: root })
    } catch (e) {
      await new Promise((r) => setTimeout(r, 5000))
      console.log('reintentando launch…')
    }
  }
  throw new Error('no pude arrancar (¿instancia abierta?)')
}

const app = await launch()
const win = await app.firstWindow()
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(1800)
await win.setViewportSize({ width: 1280, height: 800 })

// Reproducir algo
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.locator('.topbar-search input').fill('the weeknd blinding lights')
await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 15000 })
await win.waitForTimeout(1000)
await win.locator('.track-row').first().hover()
await win.locator('.track-row').first().locator('.play-hover').click()
await win.locator('.np-left .title').waitFor({ state: 'visible', timeout: 20000 })
await win.waitForTimeout(3500)

// Letras a pantalla completa
await win.locator('[aria-label="Letra"]').click()
await win.waitForTimeout(6000)
await win.screenshot({ path: join(shots, '6-lyrics-fullscreen.png') })
console.log('shot: 6-lyrics-fullscreen.png')

// Visualizador vinilo
await win.locator('[aria-label="Visualizador"]').click()
await win.waitForTimeout(3500)
await win.screenshot({ path: join(shots, '7-vinyl.png') })
console.log('shot: 7-vinyl.png')

await app.close()
console.log('Listo')
