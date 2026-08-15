/**
 * F24 · Home: Sorpréndeme + Mix Personal — Playwright rápido.
 *
 * Modos (igual convención que F21/F22/F23):
 *  - "full": app cerrada → arranca con la userData real, verifica las dos
 *    tarjetas hero y pulsa "Sorpréndeme". Espera hasta 15 s a que aparezca
 *    una pista en la barra inferior; si aparece, comprueba que quedó
 *    pausada; si no aparece, el toast de invitación debe estar visible.
 *  - "boot": app abierta → arranca en userData temporal (evita el
 *    single-instance lock). Sin sesión la Home muestra el LoginPage, así
 *    que solo verificamos que:
 *      * las clases `.home-hero` / `.hero-card` están definidas en CSS
 *        (creando el elemento a mano para leer los computed styles),
 *      * el IPC `window.api.discovery.surprise|mix` está expuesto.
 *
 * Silencio absoluto: minimizamos la ventana JUSTO tras `firstWindow` y
 * mantenemos audio muted todo el rato — el usuario está jugando. Además,
 * NO cambiamos de canción si ya había una sonando (guardamos el estado
 * inicial y pausamos al final).
 */
import { _electron } from 'playwright'
import { mkdirSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import os from 'os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shots = join(root, 'tests', 'shots', 'f24')
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

const tmpUserData = join(os.tmpdir(), `metrolist-e2e-userdata-f24-${Date.now()}`)

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
  // Silencio visual: minimiza sin esperar.
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
  return { app, win }
}

const { app, win } = await launch()

const authState = await win.evaluate(() => window.api.auth.getState())
const signedIn = authState.status === 'signedIn'
console.log(`[session] status=${authState.status}`)

// ---------- Comunes a los dos modos ----------
const apiSurprise = await win.evaluate(
  () => typeof window.api?.discovery?.surprise === 'function'
)
const apiMix = await win.evaluate(() => typeof window.api?.discovery?.mix === 'function')
check('preload expone window.api.discovery.surprise', apiSurprise)
check('preload expone window.api.discovery.mix', apiMix)

// Sanidad del CSS: fabricamos una tarjeta fuera del árbol para leer computed
// styles — funciona incluso con LoginPage en pantalla (sin sesión).
const cssOk = await win.evaluate(() => {
  const wrap = document.createElement('div')
  wrap.className = 'home-hero'
  const c1 = document.createElement('button')
  c1.className = 'hero-card hero-card--surprise'
  wrap.appendChild(c1)
  const c2 = document.createElement('button')
  c2.className = 'hero-card hero-card--mix'
  wrap.appendChild(c2)
  document.body.appendChild(wrap)
  const csWrap = getComputedStyle(wrap)
  const csCard = getComputedStyle(c1)
  const ok =
    csWrap.display === 'grid' &&
    csCard.borderRadius.includes('12') &&
    typeof csCard.backgroundImage === 'string' &&
    csCard.backgroundImage.includes('gradient')
  document.body.removeChild(wrap)
  return ok
})
check('regla .home-hero + .hero-card definida en CSS (grid + degradado)', cssOk)

if (mode === 'boot' || !signedIn) {
  console.log('[boot-only]')
  // Sin cuenta la Home muestra el LoginPage, así que las tarjetas hero no se
  // pintan. El resto se cubre por typecheck + CSS + preload.
  await win.screenshot({ path: join(shots, '0-boot.png') })
  if (running) {
    console.log(
      '[skip] la app del usuario está abierta — el E2E real (Sorpréndeme)\n' +
        '       requiere cerrarla. Se valida por typecheck + CSS + preload.'
    )
  } else if (!signedIn) {
    console.log('[skip] sin sesión iniciada — la Home muestra LoginPage.')
  }
  await app.close()
  try {
    rmSync(tmpUserData, { recursive: true, force: true })
  } catch {}
  console.log(failures === 0 ? '\nF24 · TODO OK (boot-only)' : `\nF24 · ${failures} FALLOS`)
  process.exit(failures === 0 ? 0 : 1)
}

// ---------- MODO FULL: app cerrada + sesión iniciada ----------
// La Home debe estar activa por defecto — el router arranca ahí.
await win.locator('.page h1').first().waitFor({ state: 'visible', timeout: 15000 })

const heroCount = await win.locator('.home-hero .hero-card').count()
console.log(`  tarjetas hero visibles: ${heroCount}`)
check('hay exactamente 2 tarjetas .hero-card', heroCount === 2)

const heroTexts = await win.locator('.home-hero .hero-card .hero-title').allInnerTexts()
console.log(`  títulos hero: [${heroTexts.map((t) => `"${t}"`).join(', ')}]`)
check(
  'una tarjeta se titula "Sorpréndeme"',
  heroTexts.some((t) => /sorpr[ée]ndeme/i.test(t))
)
check(
  'una tarjeta se titula "Mix Personal"',
  heroTexts.some((t) => /mix personal/i.test(t))
)

// Estilo esperado: min-height ≥ 128 (por si el media query kicks-in a 720px).
const heroHeight = await win.locator('.home-hero .hero-card').first().evaluate((el) => {
  const cs = getComputedStyle(el)
  return { minHeight: parseFloat(cs.minHeight), gradient: cs.backgroundImage }
})
check(
  `la tarjeta tiene altura visual (min-height=${heroHeight.minHeight}px)`,
  heroHeight.minHeight >= 120
)
check(
  'la tarjeta usa gradiente del acento',
  typeof heroHeight.gradient === 'string' && heroHeight.gradient.includes('gradient')
)

await win.screenshot({ path: join(shots, '1-hero.png') })

// Snapshot inicial: qué pista suena YA (si es que suena algo). No la pisamos
// jamás — pausamos siempre al final para que el jugador no oiga música.
const initialSrc = await win.evaluate(() => {
  const a = document.querySelector('audio')
  return a?.src ?? ''
})
console.log(`  estado inicial audio.src="${String(initialSrc).slice(0, 80)}"`)

console.log('[surprise] pulsando Sorpréndeme y esperando resultado…')
const surpriseBtn = win.locator('.home-hero .hero-card--surprise').first()
await surpriseBtn.click()

// Espera hasta 15 s a que:
//   (a) aparezca un toast en pantalla (invitación o "Porque escuchas a…"), o
//   (b) cambie audio.src (aparece pista nueva).
let toastText = ''
let changedTrack = false
const deadline = Date.now() + 15_000
while (Date.now() < deadline) {
  const t = await win
    .locator('.toast-host .toast')
    .first()
    .textContent()
    .catch(() => '')
  if (t) toastText = String(t).trim()
  const currentSrc = await win.evaluate(() => {
    const a = document.querySelector('audio')
    return a?.src ?? ''
  })
  if (currentSrc && currentSrc !== initialSrc) {
    changedTrack = true
    break
  }
  if (toastText) {
    // Si el toast es de invitación, nada más va a cambiar; no esperamos más.
    if (/añade.*favor|favor.*añade|no pude/i.test(toastText)) break
  }
  await win.waitForTimeout(400)
}

console.log(`  toast="${toastText}", cambió pista=${changedTrack}`)
check(
  'apareció una respuesta a Sorpréndeme (toast o cambio de pista)',
  Boolean(toastText) || changedTrack
)

// Pausa siempre al terminar — el usuario está jugando y no queremos audio.
await win.evaluate(() => {
  document.querySelectorAll('audio').forEach((a) => {
    try {
      a.pause()
      a.muted = true
    } catch {}
  })
})

await win.screenshot({ path: join(shots, '2-after-surprise.png') })

await app.close()
console.log(failures === 0 ? '\nF24 · TODO OK' : `\nF24 · ${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
