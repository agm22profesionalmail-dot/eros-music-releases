/**
 * F24b · Visualizador Tuneform — Playwright rápido.
 *
 * Verifica que la nueva vista del visualizador (canvas de espectro dual
 * espejado + carátula centrada) monta bien y REACCIONA al audio:
 *   1. Minimiza la ventana al arrancar (silencio visual absoluto).
 *   2. Busca "daft punk get lucky" y reproduce el primer resultado.
 *   3. Navega al visualizador vía el botón aria-label="Visualizador".
 *   4. Verifica que hay 1 canvas con dimensiones > 0.
 *   5. Verifica que hay 1 <img> con src http(s).
 *   6. Toma dos snapshots del canvas separados 500 ms y comprueba que
 *      los píxeles NO son idénticos (la línea se mueve).
 *   7. Cierra.
 *
 * Silencio: audio muteado con MutationObserver, ventana minimizada, y
 * ejecución completa sin "ver" nada — el usuario está jugando.
 */
import { _electron } from 'playwright'
import { mkdirSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import os from 'os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shots = join(root, 'tests', 'shots', 'f24b')
mkdirSync(shots, { recursive: true })

let failures = 0
const check = (name, cond) => {
  console.log(cond ? `  OK  ${name}` : `  FAIL ${name}`)
  if (!cond) failures++
}

function metrolistIsRunning() {
  try {
    const out = execSync(
      'powershell -NoProfile -Command "Get-Process -Name \'Metrolist PC\' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Id"',
      { encoding: 'utf8', windowsHide: true }
    )
    return out.trim().length > 0
  } catch {
    return false
  }
}

const running = metrolistIsRunning()
const mode = running ? 'boot' : 'full'
console.log(`[mode] ${mode} (app del usuario ${running ? 'abierta' : 'cerrada'})`)

const tmpUserData = join(os.tmpdir(), `metrolist-e2e-userdata-f24b-${Date.now()}`)

async function launch() {
  const args = ['.']
  if (mode === 'boot') args.push(`--user-data-dir=${tmpUserData}`)
  const app = await _electron.launch({
    args,
    cwd: root,
    env: { ...process.env, METROLIST_E2E: '1' }
  })
  app.process().stderr?.on('data', (d) => {
    const s = String(d).trim()
    if (s && !s.includes('Parser') && !s.includes('Autofill'))
      console.log('[main:err]', s.slice(0, 200))
  })
  const win = await app.firstWindow()
  // Silencio visual absoluto: minimiza YA.
  await win.evaluate(() => window.api.win.minimize()).catch(() => undefined)
  win.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[renderer:error]', msg.text().slice(0, 200))
  })
  await win.waitForLoadState('domcontentloaded')
  await win.waitForTimeout(1500)
  await win.evaluate(() => {
    document.querySelectorAll('audio').forEach((a) => (a.muted = true))
    new MutationObserver(() => {
      document.querySelectorAll('audio').forEach((a) => (a.muted = true))
    }).observe(document.body, { childList: true, subtree: true })
  })
  // Y por si acaso reaparece.
  await win.evaluate(() => window.api.win.minimize()).catch(() => undefined)
  return { app, win }
}

const { app, win } = await launch()

const authState = await win.evaluate(() => window.api.auth.getState())
const signedIn = authState.status === 'signedIn'
console.log(`[session] status=${authState.status}`)

// ---------- Sanidad de CSS: la página no depende de una regla nueva ----------
// El visualizador se pinta con estilos inline y usa `lyrics-bg-in` y
// `detail-in` (ya existentes). Como sanity, comprobamos que la keyframe
// del fondo esté disponible fabricando un elemento fantasma.
const cssOk = await win.evaluate(() => {
  const el = document.createElement('div')
  el.style.animation = 'lyrics-bg-in 1s forwards'
  document.body.appendChild(el)
  const cs = getComputedStyle(el).animationName
  document.body.removeChild(el)
  return cs === 'lyrics-bg-in'
})
check('keyframe lyrics-bg-in disponible (fondo del visualizador)', cssOk)

if (mode === 'boot' || !signedIn) {
  console.log('[boot-only]')
  if (running) {
    console.log('[skip] la app del usuario está abierta — E2E real requiere cerrarla.')
  } else if (!signedIn) {
    console.log('[skip] sin sesión iniciada — no podemos reproducir canciones.')
  }
  await app.close()
  try {
    rmSync(tmpUserData, { recursive: true, force: true })
  } catch {}
  console.log(failures === 0 ? '\nF24b · TODO OK (boot-only)' : `\nF24b · ${failures} FALLOS`)
  process.exit(failures === 0 ? 0 : 1)
}

// ---------- MODO FULL ----------
// Snapshot inicial: por si ya sonaba algo, lo restauramos al final.
const initialSrc = await win.evaluate(() => {
  const a = document.querySelector('audio')
  return a?.src ?? ''
})
console.log(`  estado inicial audio.src="${String(initialSrc).slice(0, 80)}"`)

// 1) Buscar "daft punk get lucky" vía UI y reproducir el primer resultado.
console.log('[search] navegando a buscador…')
// Botón del sidebar (aria-label o texto "Buscar")
const searchBtn = win
  .locator('button')
  .filter({ hasText: /^\s*Buscar\s*$/ })
  .first()
if ((await searchBtn.count()) > 0) {
  await searchBtn.click()
} else {
  // Fallback: cualquier botón con aria-label que contenga "Buscar"
  await win.locator('[aria-label*="Buscar" i]').first().click().catch(() => undefined)
}
await win.waitForTimeout(400)

const searchInput = win.locator('.topbar-search input').first()
await searchInput.waitFor({ state: 'visible', timeout: 5000 })
await searchInput.fill('daft punk get lucky')
console.log('[search] esperando resultados…')
// Debounce interno = 300 ms; el fetch tarda 1-3 s
await win
  .locator('.track-row')
  .first()
  .waitFor({ state: 'visible', timeout: 15000 })

console.log('[search] doble-click en el primer resultado')
await win.locator('.track-row').first().dblclick()

// Esperar hasta 8 s a que audio.src cambie
const deadline = Date.now() + 8000
let playingSrc = ''
while (Date.now() < deadline) {
  playingSrc = await win.evaluate(() => {
    const a = document.querySelector('audio')
    return a?.src ?? ''
  })
  if (playingSrc && playingSrc !== initialSrc) break
  await win.waitForTimeout(300)
}
console.log(`  audio.src tras reproducir="${String(playingSrc).slice(0, 80)}"`)
check('empezó a reproducirse alguna pista', Boolean(playingSrc) && playingSrc !== initialSrc)

// 3 s más para que el AnalyserNode reciba muestras
await win.waitForTimeout(3000)

// 2) Navegar al visualizador
console.log('[nav] al visualizador…')
const visBtn = win.locator('[aria-label="Visualizador"]')
const visBtnCount = await visBtn.count()
check('botón [aria-label="Visualizador"] presente', visBtnCount >= 1)
if (visBtnCount >= 1) {
  await visBtn.first().click()
  await win.waitForTimeout(800)
}

// 3) Un canvas visible con dimensiones > 0
const canvasInfo = await win.evaluate(() => {
  const cs = Array.from(document.querySelectorAll('canvas'))
  const visibles = cs.filter((c) => c.clientWidth > 0 && c.clientHeight > 0)
  return {
    total: cs.length,
    visible: visibles.length,
    first: visibles[0]
      ? { w: visibles[0].width, h: visibles[0].height, cw: visibles[0].clientWidth }
      : null
  }
})
console.log(`  canvas total=${canvasInfo.total} visible=${canvasInfo.visible}`)
check(
  'hay al menos 1 canvas visible con dimensiones > 0',
  canvasInfo.visible >= 1 && canvasInfo.first && canvasInfo.first.w > 0 && canvasInfo.first.h > 0
)

// 4) Un <img> centrado con src http
const imgInfo = await win.evaluate(() => {
  const imgs = Array.from(document.querySelectorAll('img')).filter((i) => {
    const src = i.getAttribute('src') || ''
    return /^https?:/.test(src) && i.clientWidth > 100
  })
  return {
    count: imgs.length,
    first: imgs[0] ? { src: imgs[0].src.slice(0, 60), w: imgs[0].clientWidth } : null
  }
})
console.log(`  img candidatas=${imgInfo.count} first=${JSON.stringify(imgInfo.first)}`)
check(
  'hay al menos 1 <img> con src http y tamaño grande (la carátula)',
  imgInfo.count >= 1 && Boolean(imgInfo.first && imgInfo.first.src.startsWith('http'))
)

await win.screenshot({ path: join(shots, '1-visualizer.png') })

// 5) Dos lecturas del canvas separadas 500 ms — deben diferir
async function pixelHash() {
  return await win.evaluate(() => {
    // Coge el canvas MÁS GRANDE (el del visualizador). Puede haber otros
    // canvas pequeños en la app (fondo ambiental, etc.).
    const all = Array.from(document.querySelectorAll('canvas'))
    let c = null
    let bestArea = 0
    for (const el of all) {
      const a = el.width * el.height
      if (a > bestArea) {
        bestArea = a
        c = el
      }
    }
    if (!c || !c.width || !c.height) return ''
    const ctx = c.getContext('2d')
    if (!ctx) return ''
    // Muestrea una franja horizontal DONDE dibuja el espectro (banda central
    // a lo largo del eje midY), no el centro exacto (ahí está la carátula
    // y el canvas es transparente).
    const cw = c.width
    const ch = c.height
    const sw = Math.min(cw, 800) // franja ancha
    const sh = Math.min(240, ch) // banda alrededor de midY
    const sx = Math.floor((cw - sw) / 2)
    const sy = Math.floor((ch - sh) / 2)
    const img = ctx.getImageData(sx, sy, sw, sh)
    // Hash rápido: suma incluyendo alpha (queremos detectar píxeles nuevos)
    let sum = 0
    for (let i = 0; i < img.data.length; i += 4) {
      sum += img.data[i] + img.data[i + 1] + img.data[i + 2] + img.data[i + 3]
    }
    return `${sw}x${sh}:${sum}`
  })
}

// Diagnóstico: estado del audio + info del canvas
const audioDiag = await win.evaluate(() => {
  const a = document.querySelector('audio')
  return a
    ? {
        paused: a.paused,
        muted: a.muted,
        currentTime: a.currentTime,
        readyState: a.readyState,
        vol: a.volume
      }
    : null
})
console.log(`  audio=${JSON.stringify(audioDiag)}`)
const canvasDiag = await win.evaluate(() => {
  return Array.from(document.querySelectorAll('canvas')).map((c) => ({
    w: c.width,
    h: c.height,
    cw: c.clientWidth,
    ch: c.clientHeight
  }))
})
console.log(`  canvases=${JSON.stringify(canvasDiag)}`)

const h1 = await pixelHash()
await win.waitForTimeout(700)
const h2 = await pixelHash()
console.log(`  hash1="${h1}" hash2="${h2}"`)
check('hash del canvas ≠ entre frames (el espectro se mueve)', h1 !== '' && h2 !== '' && h1 !== h2)

await win.screenshot({ path: join(shots, '2-visualizer-later.png') })

// Cerrar: pausar antes por si acaso.
await win.evaluate(() => {
  document.querySelectorAll('audio').forEach((a) => {
    try {
      a.pause()
      a.muted = true
    } catch {}
  })
})

await app.close()
console.log(failures === 0 ? '\nF24b · TODO OK' : `\nF24b · ${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
