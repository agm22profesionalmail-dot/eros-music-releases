/**
 * Prueba de humo interactiva con Playwright + Electron.
 * Uso: node tests/smoke.mjs [escenario]
 * Escenarios: login (por defecto) | search | all
 * Captura PNGs en tests/shots/.
 */
import { _electron } from 'playwright'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shots = join(root, 'tests', 'shots')
mkdirSync(shots, { recursive: true })

const scenario = process.argv[2] ?? 'all'

const app = await _electron.launch({
  args: ['.'],
  cwd: root,
  env: { ...process.env, METROLIST_E2E: '1' }
})

app.process().stdout?.on('data', (d) => {
  const s = String(d).trim()
  if (s) console.log('[main]', s)
})
app.process().stderr?.on('data', (d) => {
  const s = String(d).trim()
  if (s && !s.includes('Parser')) console.log('[main:err]', s)
})

const win = await app.firstWindow()
win.on('console', (msg) => {
  if (msg.type() === 'error') console.log('[renderer:error]', msg.text())
})
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(1500)

let failures = 0
const check = (name, cond) => {
  console.log(cond ? `  OK  ${name}` : `  FAIL ${name}`)
  if (!cond) failures++
}

// --- Escenario: pantalla de login / shell ---
if (scenario === 'login' || scenario === 'all') {
  console.log('[login]')
  check('sidebar Inicio visible', await win.locator('text=Inicio').first().isVisible())
  check(
    'botón Vincular con el móvil',
    await win.getByRole('button', { name: 'Vincular con el móvil' }).isVisible()
  )
  check('barra de reproducción', await win.locator('.nowplaying').isVisible())
  await win.screenshot({ path: join(shots, 'login.png') })
}

// --- Escenario: búsqueda sin login ---
if (scenario === 'search' || scenario === 'all') {
  console.log('[search]')
  await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
  await win.locator('.topbar-search input').fill('daft punk')
  // espera a resultados (hasta 15 s)
  await win
    .locator('.track-row')
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(() => undefined)
  const rows = await win.locator('.track-row').count()
  check(`resultados de canciones (${rows})`, rows > 0)
  const cards = await win.locator('.media-card').count()
  check(`tarjetas (artistas/álbumes) (${cards})`, cards > 0)
  await win.screenshot({ path: join(shots, 'search.png') })
}

// --- Escenario: reproducción ---
if (scenario === 'play' || scenario === 'all') {
  console.log('[play]')
  if ((await win.locator('.track-row').count()) === 0) {
    await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
    await win.locator('.topbar-search input').fill('daft punk')
    await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 15000 })
  }
  await win.locator('.track-row').first().dblclick()
  // espera a que el motor empiece a reproducir (barra con título + tiempo avanzando)
  await win.waitForTimeout(6000)
  const title = await win.locator('.np-left .title').textContent().catch(() => null)
  check(`pista cargada en la barra («${title ?? '—'}»)`, Boolean(title))
  const t1 = await win.evaluate(() => {
    const audios = document.querySelectorAll('audio')
    return Math.max(...[...audios].map((a) => a.currentTime), 0)
  })
  await win.waitForTimeout(3000)
  const t2 = await win.evaluate(() => {
    const audios = document.querySelectorAll('audio')
    return Math.max(...[...audios].map((a) => a.currentTime), 0)
  })
  console.log(`  tiempo de audio: ${t1.toFixed(1)}s -> ${t2.toFixed(1)}s`)
  check('el audio avanza', t2 > t1 && t2 > 1)
  await win.screenshot({ path: join(shots, 'play.png') })
}

await app.close()
console.log(failures === 0 ? '\nTODO OK' : `\n${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
