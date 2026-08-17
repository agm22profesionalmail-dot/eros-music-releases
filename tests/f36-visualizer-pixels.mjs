/**
 * F36 · Verificación de píxeles del visualizador:
 *  - Ninguna barra pintada DENTRO del rectángulo de la carátula (ni esquinas).
 *  - Hay barras pintadas a ambos lados (fila de latido en silencio).
 *  - Nada pintado pegado a los bordes laterales de la ventana.
 * También limpia playlists huérfanas "Test F36 *" de ejecuciones previas.
 */
import { _electron } from 'playwright'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shots = join(root, 'tests', 'shots', 'f36')
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
await win.waitForTimeout(1800)
await win.evaluate(() => {
  document.querySelectorAll('audio').forEach((a) => (a.muted = true))
  new MutationObserver(() => {
    document.querySelectorAll('audio').forEach((a) => (a.muted = true))
  }).observe(document.body, { childList: true, subtree: true })
})

// ---- Limpieza de playlists huérfanas de tests previos ----
{
  const auth = await win.evaluate(() => window.api.auth.getState())
  if (auth.status === 'signedIn') {
    const removed = await win.evaluate(async () => {
      const lib = await window.api.music.library()
      const strays = lib.playlists.filter((p) => p.title.startsWith('Test F36'))
      for (const s of strays) await window.api.library.playlistDelete(s.id)
      return strays.map((s) => s.title)
    })
    console.log('limpieza playlists huérfanas:', removed.length ? removed.join(', ') : '(ninguna)')
  }
}

// ---- Visualizador ----
const visBtn = win.locator('[title*="isualizador"], [aria-label*="isualizador"]')
if (!(await visBtn.count())) {
  console.log('FAIL: no encontré el botón del visualizador')
  await app.close()
  process.exit(1)
}
await visBtn.first().click()
await win.waitForTimeout(1500)

const probe = await win.evaluate(() => {
  // El visualizador es el canvas MÁS GRANDE (hay otros: fondo ambiental, etc.)
  const canvas = [...document.querySelectorAll('canvas')].sort(
    (a, b) => b.width * b.height - a.width * a.height
  )[0]
  const art = document.querySelector('img[src*="w1080"]') ?? document.querySelector('canvas ~ * img')
  if (!canvas) return { error: 'sin canvas' }
  const ctx = canvas.getContext('2d')
  if (!ctx) return { error: 'sin ctx' }
  const W = canvas.width
  const H = canvas.height
  const cr = canvas.getBoundingClientRect()
  const scaleX = W / cr.width
  const scaleY = H / cr.height
  // Rectángulo de la carátula en coords del canvas
  let artRect = null
  if (art) {
    const ar = art.getBoundingClientRect()
    artRect = {
      x0: (ar.left - cr.left) * scaleX,
      y0: (ar.top - cr.top) * scaleY,
      x1: (ar.right - cr.left) * scaleX,
      y1: (ar.bottom - cr.top) * scaleY
    }
  }
  const img = ctx.getImageData(0, 0, W, H)
  const alphaAt = (x, y) => img.data[(Math.round(y) * W + Math.round(x)) * 4 + 3]
  // 1) muestreo dentro del arte (incluidas las 4 esquinas con margen 6px)
  let insideArt = 0
  if (artRect) {
    const pts = []
    for (let i = 0; i <= 10; i++) {
      for (let j = 0; j <= 10; j++) {
        pts.push([
          artRect.x0 + ((artRect.x1 - artRect.x0) * i) / 10,
          artRect.y0 + ((artRect.y1 - artRect.y0) * j) / 10
        ])
      }
    }
    for (const [x, y] of pts) if (alphaAt(x, y) > 8) insideArt++
  }
  // 2) barras presentes a ambos lados (franja central ±40 px del eje)
  const midY = artRect ? (artRect.y0 + artRect.y1) / 2 : H / 2
  let leftLit = 0
  let rightLit = 0
  for (let x = 10; x < (artRect?.x0 ?? W / 2) - 4; x += 4) {
    if (alphaAt(x, midY) > 8) leftLit++
  }
  for (let x = (artRect?.x1 ?? W / 2) + 4; x < W - 10; x += 4) {
    if (alphaAt(x, midY) > 8) rightLit++
  }
  // 3) borde de pantalla limpio (primeros/últimos 30 px físicos)
  let edgeLit = 0
  for (let y = 0; y < H; y += 8) {
    for (let x = 0; x < 30; x += 6) if (alphaAt(x, y) > 8) edgeLit++
    for (let x = W - 30; x < W; x += 6) if (alphaAt(x, y) > 8) edgeLit++
  }
  return { W, H, artRect: Boolean(artRect), insideArt, leftLit, rightLit, edgeLit }
})

console.log('probe:', JSON.stringify(probe))
check('canvas y carátula localizados', !probe.error && probe.artRect)
check(`0 píxeles pintados sobre la carátula/esquinas (${probe.insideArt})`, probe.insideArt === 0)
check(`latido visible a la izquierda (${probe.leftLit} muestras)`, probe.leftLit > 3)
check(`latido visible a la derecha (${probe.rightLit} muestras)`, probe.rightLit > 3)
check(`bordes de pantalla limpios (${probe.edgeLit})`, probe.edgeLit === 0)

await win.screenshot({ path: join(shots, 'visualizer-idle.png') })
await app.close()
console.log(failures === 0 ? '\nPIXELS · TODO OK' : `\nPIXELS · ${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
