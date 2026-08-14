/**
 * Prueba de mini-player flotante + Discord Rich Presence.
 * Uso: node tests/mini-discord.mjs
 */
import { _electron } from 'playwright'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shots = join(root, 'tests', 'shots')
mkdirSync(shots, { recursive: true })

const app = await _electron.launch({ args: ['.'], cwd: root })

const mainLog = []
app.process().stdout?.on('data', (d) => {
  const s = String(d).trim()
  if (s) mainLog.push(s)
})
app.process().stderr?.on('data', (d) => {
  const s = String(d).trim()
  if (s && !s.includes('Parser')) mainLog.push(s)
})

const win = await app.firstWindow()
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(1500)

let failures = 0
const check = (name, cond) => {
  console.log(cond ? `  OK  ${name}` : `  FAIL ${name}`)
  if (!cond) failures++
}

// 1. Activa Discord RPC vía ajustes
await win.evaluate(() => window.api.settings.set({ discordRpc: true }))

// 2. Reproduce una canción (necesaria para estado del mini y presencia)
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.locator('.topbar-search input').fill('daft punk')
await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 15000 })
await win.waitForTimeout(800)
await win.locator('.track-row').first().hover()
await win.locator('.track-row').first().locator('.play-hover').click()
await win.locator('.np-left .title').waitFor({ state: 'visible', timeout: 20000 })
const playingTitle = (await win.locator('.np-left .title').textContent()) ?? ''
console.log('  reproduciendo:', playingTitle)

// 3. Abre el mini-player
await win.locator('[aria-label="Mini-player"]').click()
// Espera a la segunda ventana
let miniPage = null
for (let i = 0; i < 20 && !miniPage; i++) {
  await win.waitForTimeout(500)
  miniPage = app.windows().find((w) => w.url().includes('#/mini'))
}
check('ventana mini abierta', Boolean(miniPage))

if (miniPage) {
  await miniPage.waitForLoadState('domcontentloaded')
  // El estado tarda ≤1 s en publicarse
  await miniPage.waitForTimeout(2500)
  const miniTitle = await miniPage.locator('div[title="Abrir Metrolist"]').textContent()
  console.log('  título en mini:', miniTitle)
  check('el mini muestra la pista actual', Boolean(miniTitle) && miniTitle !== 'Metrolist')
  await miniPage.screenshot({ path: join(shots, 'miniplayer.png') })

  // 4. Control desde el mini: pausa
  const wasPlaying = await win.evaluate(() => {
    const audios = [...document.querySelectorAll('audio')]
    return audios.some((a) => !a.paused)
  })
  await miniPage.locator('.np-play').click()
  await win.waitForTimeout(1500)
  const nowPaused = await win.evaluate(() => {
    const audios = [...document.querySelectorAll('audio')]
    return audios.every((a) => a.paused)
  })
  check(`pausa desde el mini (antes sonaba=${wasPlaying})`, wasPlaying && nowPaused)

  // Reanuda desde el mini
  await miniPage.locator('.np-play').click()
  await win.waitForTimeout(1500)
  const resumed = await win.evaluate(() => {
    const audios = [...document.querySelectorAll('audio')]
    return audios.some((a) => !a.paused)
  })
  check('reanudar desde el mini', resumed)

  // 5. Cierra el mini con su botón
  await miniPage.locator('[title="Cerrar mini-player"]').click()
  await win.waitForTimeout(1000)
  const stillOpen = app.windows().some((w) => w.url().includes('#/mini'))
  check('mini cerrado con su botón', !stillOpen)
}

// 6. Discord: espera a las trazas de conexión/presencia en el log del main
await win.waitForTimeout(4000)
const discordConnected = mainLog.some((l) => l.includes('[discord] conectado'))
const discordPresence = mainLog.some((l) => l.includes('[discord] presencia:'))
check('Discord RPC conectado', discordConnected)
check('presencia enviada a Discord', discordPresence)
console.log(
  '  trazas discord:',
  mainLog.filter((l) => l.includes('[discord]')).join(' | ') || '(ninguna)'
)

// Deja el ajuste de Discord como estaba (desactivado por defecto)
await win.evaluate(() => window.api.settings.set({ discordRpc: false }))

await app.close()
console.log(failures === 0 ? '\nTODO OK' : `\n${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
