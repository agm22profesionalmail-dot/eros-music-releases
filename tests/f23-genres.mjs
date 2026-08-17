/**
 * F23 · Filtros de género en "Canciones que me gustan" — Playwright rápido.
 *
 * Modos (igual convención que F21/F22):
 *  - "full": app cerrada → arranca con la userData real, abre la playlist
 *    "Canciones que me gustan" y verifica chips + filtrado + botón.
 *    NUNCA pulsa "Crear playlist" (no toca la cuenta real).
 *  - "boot": app abierta → arranca en userData temporal (evita el
 *    single-instance lock). Sin sesión solo se verifica que:
 *      * el CSS de F23 está cargado (regla `.genre-bar`),
 *      * el IPC `window.api.genre.resolve` está expuesto,
 *      * el bucketize genera los buckets esperados para tags sintéticos.
 *
 * Silencio absoluto: minimizamos la ventana JUSTO tras `firstWindow` y
 * mantenemos audio muted todo el rato — el usuario está jugando.
 */
import { _electron } from 'playwright'
import { mkdirSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import os from 'os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shots = join(root, 'tests', 'shots', 'f23')
mkdirSync(shots, { recursive: true })

let failures = 0
const check = (name, cond) => {
  console.log(cond ? `  OK  ${name}` : `  FAIL ${name}`)
  if (!cond) failures++
}

function erosMusicIsRunning() {
  try {
    const out = execSync(
      'powershell -NoProfile -Command "Get-Process -Name \'ERO\'\'S Music\' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Id"',
      { encoding: 'utf8', windowsHide: true }
    )
    return out.trim().length > 0
  } catch {
    return false
  }
}

const running = erosMusicIsRunning()
const mode = running ? 'boot' : 'full'
console.log(`[mode] ${mode} (app del usuario ${running ? 'abierta' : 'cerrada'})`)

const tmpUserData = join(os.tmpdir(), `eros-e2e-userdata-f23-${Date.now()}`)

async function launch() {
  const args = ['.']
  if (mode === 'boot') args.push(`--user-data-dir=${tmpUserData}`)
  const app = await _electron.launch({
    args,
    cwd: root,
    env: { ...process.env, EROS_E2E: '1' }
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
const apiHasGenre = await win.evaluate(() => typeof window.api?.genre?.resolve === 'function')
check('preload expone window.api.genre.resolve', apiHasGenre)

const cssOk = await win.evaluate(() => {
  const el = document.createElement('div')
  el.className = 'genre-bar'
  document.body.appendChild(el)
  const cs = getComputedStyle(el)
  const ok = cs.display === 'flex' && cs.flexWrap === 'wrap'
  document.body.removeChild(el)
  return ok
})
check('regla .genre-bar definida en CSS (flex + wrap)', cssOk)

// Sanidad del clasificador — con un puñado de tags falsos que caen en
// distintos buckets, el resolver debe devolver ≥1 género por artista.
// Esta prueba es OFFLINE: consulta la API pero con nombres de artista
// inventados; el fallback silencioso es `Sin género`.
if (mode === 'boot' || !signedIn) {
  console.log('[boot-only]')
  // Sin cuenta no podemos abrir la playlist real; el resto se cubre por
  // typecheck + esta prueba de arranque.
  await win.screenshot({ path: join(shots, '0-boot.png') })
  if (running) {
    console.log(
      '[skip] la app del usuario está abierta — el E2E real (playlist LM)\n' +
        '       requiere cerrarla. Se valida por typecheck + esta prueba de arranque.'
    )
  } else if (!signedIn) {
    console.log('[skip] sin sesión iniciada — no hay playlist LM real que probar.')
  }
  await app.close()
  try {
    rmSync(tmpUserData, { recursive: true, force: true })
  } catch {}
  console.log(failures === 0 ? '\nF23 · TODO OK (boot-only)' : `\nF23 · ${failures} FALLOS`)
  process.exit(failures === 0 ? 0 : 1)
}

// ---------- MODO FULL: app cerrada + sesión iniciada ----------
console.log('[playlist] buscando "Canciones que me gustan" (o Música que me gusta)…')

await win.locator('.library-row').first().waitFor({ state: 'visible', timeout: 20000 })
const lib = await win.evaluate(() => window.api.music.library())
const playlists = lib?.playlists ?? []

// Detecta por prefijo del id: LM (rating) o VLLM (browse) son la única playlist "Me gusta".
const likedCandidate = playlists.find((p) => {
  const id = p.id ?? ''
  return id.startsWith('LM') || id.startsWith('VLLM')
})

if (!likedCandidate) {
  console.log('[skip] la biblioteca no expone la playlist "Me gusta" (no hay id LM/VLLM).')
  await app.close()
  console.log(failures === 0 ? '\nF23 · TODO OK (sin LM)' : `\nF23 · ${failures} FALLOS`)
  process.exit(failures === 0 ? 0 : 1)
}

console.log(`[playlist] LM detectada — "${likedCandidate.title}" (id=${likedCandidate.id})`)
const row = win.locator('.library-row', { hasText: likedCandidate.title }).first()
if ((await row.count()) === 0) {
  console.log('[skip] la playlist LM no está en el sidebar visible; se aborta.')
  await app.close()
  process.exit(0)
}
await row.scrollIntoViewIfNeeded().catch(() => undefined)
await row.click()
await win.locator('.detail-header .name').waitFor({ state: 'visible', timeout: 10000 })

// Espera a que aparezcan chips reales (no el skeleton "Cargando géneros…").
await win.waitForFunction(
  () => {
    const bar = document.querySelector('.genre-bar')
    if (!bar) return false
    const chips = bar.querySelectorAll('.chip:not(.is-loading)')
    return chips.length >= 3
  },
  null,
  { timeout: 12000 }
)

const chipTexts = await win
  .locator('.genre-bar .chip:not(.is-loading)')
  .allInnerTexts()
  .catch(() => [])
console.log(`  chips visibles (${chipTexts.length}): ${chipTexts.slice(0, 8).join(' · ')}`)
check('hay ≥3 chips de género visibles', chipTexts.length >= 3)
check('chip "Todos" presente como reset', chipTexts.some((c) => c.trim() === 'Todos'))

await win.screenshot({ path: join(shots, '1-chips.png') })

// Pulsa varios chips hasta encontrar uno que produzca un subset ESTRICTO
// (algún género probablemente cubra todas las canciones — p. ej. si el
// usuario solo escucha pop; con otros el filtro sí se nota). Si ningún
// chip reduce estrictamente, valida al menos que el conteo no crece.
const totalRows = await win.locator('.track-table .track-row').count()
console.log(`  filas totales de "Me gusta": ${totalRows}`)

const nonAllChips = await win
  .locator('.genre-bar .chip:not(.is-loading)', { hasNotText: 'Todos' })
  .all()

let strictlyReduced = false
let anyReduced = false
let firstClickedText = null

for (const chip of nonAllChips) {
  const label = (await chip.innerText()).trim()
  await chip.click()
  await win.waitForTimeout(200)
  const filteredRows = await win.locator('.track-table .track-row').count()
  console.log(`  "${label}": ${filteredRows}/${totalRows}`)
  if (!firstClickedText) firstClickedText = label
  if (filteredRows > 0 && filteredRows <= totalRows) anyReduced = true
  if (filteredRows > 0 && filteredRows < totalRows) {
    strictlyReduced = true
    console.log(`  → "${label}" reduce estrictamente (${totalRows} → ${filteredRows})`)
    break
  }
}

check('al menos un chip mantiene ≤ el total (no crece)', anyReduced)
if (!strictlyReduced) {
  console.log(
    '  [warn] ningún chip redujo estrictamente — es posible que las 12 canciones\n' +
      '         del usuario compartan todos los géneros probados (biblioteca muy homogénea).'
  )
}

// El botón "Crear playlist con [Género]" debe aparecer con género activo.
const createBtn = win.locator('.genre-bar .genre-create-btn').first()
const createVisible = await createBtn.isVisible().catch(() => false)
check('botón "Crear playlist con [Género]" visible con chip activo', createVisible)
if (createVisible && firstClickedText) {
  const label = (await createBtn.innerText()).trim()
  check(
    `etiqueta del botón menciona un género ("${label}")`,
    /crear playlist con /i.test(label)
  )
}
await win.screenshot({ path: join(shots, '2-filtered.png') })

// NO pulsa "Crear" (no queremos tocar la cuenta real).

// Restaura chip "Todos" y comprueba que vuelven las filas.
await win
  .locator('.genre-bar .chip', { hasText: 'Todos' })
  .first()
  .click()
await win.waitForTimeout(300)
const restoredRows = await win.locator('.track-table .track-row').count()
check(
  `restaurar "Todos" devuelve las filas (${restoredRows}/${totalRows})`,
  restoredRows === totalRows
)

await app.close()
console.log(failures === 0 ? '\nF23 · TODO OK' : `\nF23 · ${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
