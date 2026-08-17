/**
 * F39 · El contenido del visualizador (carátula + título) debe quedar
 * VERTICALMENTE CENTRADO dentro de `.main-scroll`, con el hueco sobrante
 * repartido arriba y abajo por igual — no todo pegado abajo. Se comprueba en
 * ventana normal y, sobre todo, MAXIMIZADA/grande (donde el bug era más
 * visible: cuanto más alta la ventana, más crecía solo el hueco de abajo).
 *
 * Mide contra anclas estables (`data-testid`) en vez de heurísticas de CSS.
 */
import { _electron } from 'playwright'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shots = join(root, 'tests', 'shots', 'f39')
mkdirSync(shots, { recursive: true })

let failures = 0
const check = (name, cond) => {
  console.log(cond ? `  OK  ${name}` : `  FAIL ${name}`)
  if (!cond) failures++
}

const app = await _electron.launch({
  args: ['.'],
  cwd: root,
  env: { ...process.env, EROS_E2E: '1' }
})
const win = await app.firstWindow()
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(1500)
await win.evaluate(() => document.querySelectorAll('audio').forEach((a) => (a.muted = true)))

const visBtn = win.locator('[title*="isualizador"], [aria-label*="isualizador"]')
if (!(await visBtn.count())) {
  console.log('FAIL: no encontré el botón del visualizador')
  await app.close()
  process.exit(1)
}
await visBtn.first().click()
await win.waitForTimeout(600)

async function measure(label) {
  await win.waitForTimeout(400)
  const m = await win.evaluate(() => {
    const scroll = document.querySelector('.main-scroll')
    const root = document.querySelector('[data-testid="visualizer-root"]')
    const art = document.querySelector('[data-testid="visualizer-art"]')
    const titleBlock = document.querySelector('[data-testid="visualizer-title-block"]')
    if (!scroll || !root || !art || !titleBlock) return null
    const sr = scroll.getBoundingClientRect()
    const rr = root.getBoundingClientRect()
    const ar = art.getBoundingClientRect()
    const tr = titleBlock.getBoundingClientRect()
    return {
      scrollH: sr.height,
      rootH: rr.height,
      // Root (height:100%) debe llenar prácticamente todo `.main-scroll`
      rootFillsScroll: Math.abs(rr.height - sr.height) < 4,
      // Hueco por encima de la carátula vs hueco por debajo del título,
      // dentro del root — deben ser prácticamente iguales si está centrado.
      topGap: ar.top - rr.top,
      bottomGap: rr.bottom - tr.bottom
    }
  })
  console.log(`[${label}]`, JSON.stringify(m))
  return m
}

const normal = await measure('ventana normal')
check('medición válida en ventana normal', Boolean(normal))
if (normal) {
  check(
    `.visualizer-root llena .main-scroll (root=${normal.rootH.toFixed(0)} scroll=${normal.scrollH.toFixed(0)})`,
    normal.rootFillsScroll
  )
  const diff = Math.abs(normal.topGap - normal.bottomGap)
  check(
    `centrado correcto en ventana normal (top=${normal.topGap.toFixed(0)} bottom=${normal.bottomGap.toFixed(0)})`,
    diff < 20
  )
}
await win.screenshot({ path: join(shots, 'normal.png') })

// ---- Ventana grande (simula maximizar, donde el bug era más visible) ----
await win.setViewportSize({ width: 1920, height: 1040 })
await win.waitForTimeout(600)

const big = await measure('ventana grande')
check('medición válida en ventana grande', Boolean(big))
if (big) {
  check(
    `.visualizer-root sigue llenando .main-scroll al crecer (root=${big.rootH.toFixed(0)} scroll=${big.scrollH.toFixed(0)})`,
    big.rootFillsScroll
  )
  const diff = Math.abs(big.topGap - big.bottomGap)
  check(
    `centrado correcto en ventana grande (top=${big.topGap.toFixed(0)} bottom=${big.bottomGap.toFixed(0)}, diff=${diff.toFixed(0)})`,
    diff < 20
  )
}
await win.screenshot({ path: join(shots, 'big.png') })

// ---- Página larga (Inicio) sigue creciendo/scrolleando con normalidad ----
await win.setViewportSize({ width: 1280, height: 800 })
await win.locator('.sidebar-nav-item', { hasText: 'Inicio' }).click().catch(() => undefined)
await win.waitForTimeout(600)
const homeScrollable = await win.evaluate(() => {
  const scroll = document.querySelector('.main-scroll')
  return scroll ? scroll.scrollHeight > scroll.clientHeight + 10 : null
})
check(`Inicio sigue siendo scrolleable (scrollHeight > clientHeight): ${homeScrollable}`, homeScrollable === true)

await app.close()
console.log(failures === 0 ? '\nF39 · TODO OK' : `\nF39 · ${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
