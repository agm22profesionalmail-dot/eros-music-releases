/**
 * F42 · El volumen NUNCA debe desaparecer del todo. En ventana ancha se ve
 * el slider inline; en ventana estrecha (< 960px) se sustituye por un
 * popover accesible al pasar el ratón/enfocar el botón — nunca "nada".
 * Redimensiona la ventana NATIVA de verdad (no viewport de Playwright).
 */
import { _electron } from 'playwright'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

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

async function setNativeWindowSize(w, h) {
  await app.evaluate(
    ({ BrowserWindow }, { w, h }) =>
      new Promise((resolve) => {
        const win = BrowserWindow.getAllWindows()[0]
        const apply = () => {
          win.setContentSize(w, h)
          resolve()
        }
        if (win.isMaximized()) {
          win.once('unmaximize', () => setTimeout(apply, 60))
          win.unmaximize()
        } else {
          apply()
        }
      }),
    { w, h }
  )
  try {
    await win.waitForFunction(
      ({ w, h }) => Math.abs(window.innerWidth - w) < 30 && Math.abs(window.innerHeight - h) < 60,
      { w, h },
      { timeout: 8000 }
    )
  } catch {
    console.log(`  [aviso] resize a ${w}x${h} no confirmado en 8s`)
  }
  // Margen extra: deja que CSS/layout se asiente del todo tras el resize.
  await win.waitForTimeout(300)
}

// ---- Ventana ancha: slider inline visible ----
await setNativeWindowSize(1280, 832)
const wide = await win.evaluate(() => {
  const inline = document.querySelector('.np-right .volume')
  return inline ? getComputedStyle(inline).display !== 'none' : null
})
check(`[ancha] slider inline de volumen visible (${wide})`, wide === true)

// ---- Ventana estrecha: el volumen NUNCA debe ser totalmente inaccesible ----
await setNativeWindowSize(900, 700)
// Poll directo sobre el propio media query (más fiable que fiarse de
// `window.innerWidth`, que a veces tarda un pelín más en propagarse).
try {
  await win.waitForFunction(
    () => {
      const popover = document.querySelector('.volume-popover')
      return popover ? getComputedStyle(popover).display !== 'none' : false
    },
    {},
    { timeout: 8000 }
  )
} catch {
  console.log('  [aviso] el media query de ventana estrecha no se aplicó en 8s')
}
const diagBounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentBounds())
const diagInner = await win.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
console.log('[diagnóstico] contentBounds=', JSON.stringify(diagBounds), 'innerWidth/Height=', JSON.stringify(diagInner))
const narrow = await win.evaluate(() => {
  const inline = document.querySelector('.np-right .volume')
  const popover = document.querySelector('.volume-popover')
  const muteBtn = document.querySelector('.np-volume-group .np-ctrl')
  return {
    inlineVisible: inline ? getComputedStyle(inline).display !== 'none' : false,
    popoverExists: Boolean(popover),
    popoverDisplay: popover ? getComputedStyle(popover).display : null,
    muteBtnExists: Boolean(muteBtn)
  }
})
console.log('[estrecha]', JSON.stringify(narrow))
check('[estrecha] el botón de silenciar sigue existiendo', narrow.muteBtnExists)
check('[estrecha] el popover de volumen existe en el DOM', narrow.popoverExists)
check(
  '[estrecha] el popover NO es display:none (listo para mostrarse al hover)',
  narrow.popoverDisplay !== 'none'
)
check(
  '[estrecha] NUNCA los dos a la vez invisibles (slider inline oculto está OK, pero el popover cubre el hueco)',
  narrow.popoverDisplay !== 'none' || narrow.inlineVisible
)

// ---- Hover revela el popover y permite arrastrar ----
const group = win.locator('.np-volume-group')
await group.hover()
await win.waitForTimeout(300)
const revealed = await win.evaluate(() => {
  const popover = document.querySelector('.volume-popover')
  if (!popover) return null
  const cs = getComputedStyle(popover)
  return { opacity: cs.opacity, pointerEvents: cs.pointerEvents }
})
console.log('[hover]', JSON.stringify(revealed))
check(
  `[hover] el popover se revela (opacity=${revealed?.opacity})`,
  revealed && Number(revealed.opacity) > 0.5
)
check(
  '[hover] el popover es interactivo (pointer-events != none)',
  revealed && revealed.pointerEvents !== 'none'
)

await app.close()
console.log(failures === 0 ? '\nF42 · TODO OK' : `\nF42 · ${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
