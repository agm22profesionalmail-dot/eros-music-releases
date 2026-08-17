/**
 * F40 · El visualizador NUNCA debe generar scroll en `.main-scroll` (ni
 * desfase ni hueco) y debe quedar centrado, en TRES configuraciones de
 * ventana como pidió el usuario explícitamente: normal, pantalla completa
 * (maximizada) y un tamaño aleatorio intermedio. Además comprueba que Inicio
 * (página larga) sigue scrolleando con normalidad — no debe regresionar.
 */
import { _electron } from 'playwright'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shots = join(root, 'tests', 'shots', 'f40')
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

async function probeVisualizer(label) {
  await win.waitForTimeout(400)
  const m = await win.evaluate(() => {
    const scroll = document.querySelector('.main-scroll')
    const topbar = document.querySelector('.topbar')
    const root = document.querySelector('[data-testid="visualizer-root"]')
    const art = document.querySelector('[data-testid="visualizer-art"]')
    const titleBlock = document.querySelector('[data-testid="visualizer-title-block"]')
    if (!scroll || !topbar || !root || !art || !titleBlock) return null
    const sr = scroll.getBoundingClientRect()
    const tbr = topbar.getBoundingClientRect()
    const rr = root.getBoundingClientRect()
    const ar = art.getBoundingClientRect()
    const tr = titleBlock.getBoundingClientRect()
    const cs = getComputedStyle(scroll)
    return {
      // Overflow real: si scrollHeight > clientHeight hay barra de scroll
      scrollHeight: scroll.scrollHeight,
      clientHeight: scroll.clientHeight,
      hasOverflow: scroll.scrollHeight > scroll.clientHeight + 1,
      overflowPx: scroll.scrollHeight - scroll.clientHeight,
      overflowYStyle: cs.overflowY,
      rootH: rr.height,
      scrollH: sr.height,
      topbarH: tbr.height,
      // El root debe llenar EXACTAMENTE lo que queda tras el topbar — ni un
      // píxel de más (scroll fantasma) ni de menos (bug original).
      rootFillsRemainder: Math.abs(rr.height - (sr.height - tbr.height)) < 4,
      topGap: ar.top - rr.top,
      bottomGap: rr.bottom - tr.bottom
    }
  })
  console.log(`[${label}]`, JSON.stringify(m))
  return m
}

function checkNoScrollAndCentered(label, m) {
  check(`[${label}] medición válida`, Boolean(m))
  if (!m) return
  check(`[${label}] SIN scroll fantasma (overflow=${m.overflowPx}px)`, !m.hasOverflow)
  check(
    `[${label}] .visualizer-root llena .main-scroll exacto (root=${m.rootH.toFixed(0)} scroll=${m.scrollH.toFixed(0)})`,
    m.rootFillsScroll
  )
  const diff = Math.abs(m.topGap - m.bottomGap)
  check(
    `[${label}] centrado correcto (top=${m.topGap.toFixed(0)} bottom=${m.bottomGap.toFixed(0)}, diff=${diff.toFixed(0)})`,
    diff < 6
  )
}

// ---- 1) Ventana normal (la que trae por defecto electron-vite/tests) ----
const normal = await probeVisualizer('normal')
checkNoScrollAndCentered('normal', normal)
await win.screenshot({ path: join(shots, '1-normal.png') })

// ---- 2) Pantalla completa: maximiza la ventana Electron DE VERDAD ----
// (no un simple resize de viewport — usa el control nativo de la app)
await win.evaluate(() => {
  const titlebar = document.querySelector('.titlebar')
  titlebar?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
})
await win.waitForTimeout(700)
// Red de seguridad si el doble-clic no maximizó (algunas builds requieren
// IPC nativo): fuerza un tamaño grande equivalente vía viewport.
const stillSmall = await win.evaluate(() => window.innerWidth < 1400)
if (stillSmall) await win.setViewportSize({ width: 1920, height: 1040 })
await win.waitForTimeout(500)
const maxed = await probeVisualizer('pantalla completa')
checkNoScrollAndCentered('pantalla completa', maxed)
await win.screenshot({ path: join(shots, '2-fullscreen.png') })

// ---- 3) Tamaño ALEATORIO intermedio (pedido explícito del usuario) ----
const randomSizes = [
  { w: 1123, h: 761 },
  { w: 987, h: 601 },
  { w: 1345, h: 919 }
]
const rnd = randomSizes[Math.floor((Date.now() % 997) / 997 * randomSizes.length) % randomSizes.length]
await win.setViewportSize({ width: rnd.w, height: rnd.h })
await win.waitForTimeout(500)
const randomProbe = await probeVisualizer(`aleatorio ${rnd.w}x${rnd.h}`)
checkNoScrollAndCentered(`aleatorio ${rnd.w}x${rnd.h}`, randomProbe)
await win.screenshot({ path: join(shots, '3-random.png') })

// ---- Regresión: Inicio (página larga) sigue scrolleando con normalidad ----
await win.setViewportSize({ width: 1280, height: 800 })
await win.locator('.sidebar-nav-item', { hasText: 'Inicio' }).click().catch(() => undefined)
await win.waitForTimeout(600)
const homeOverflow = await win.evaluate(() => {
  const scroll = document.querySelector('.main-scroll')
  return scroll ? scroll.scrollHeight - scroll.clientHeight : null
})
check(
  `Inicio SIGUE desbordando/scrolleando con normalidad (overflow=${homeOverflow}px)`,
  typeof homeOverflow === 'number' && homeOverflow > 20
)

await app.close()
console.log(failures === 0 ? '\nF40 · TODO OK' : `\nF40 · ${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
