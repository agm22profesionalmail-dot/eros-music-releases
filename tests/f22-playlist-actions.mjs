/**
 * F22 · Playlist: añadir · compartir · editar — Playwright rápido.
 *
 * Modos como F21:
 *  - "full": app cerrada → arranca con userData real y prueba con playlists
 *    reales del usuario (SIN escribir en la cuenta: el picker no se confirma
 *    y el modal de editar tampoco se guarda).
 *  - "boot": app abierta → arranca en userData temporal (evita single-instance
 *    lock). Sin sesión solo se verifica que:
 *      * el CSS de F22 está cargado (clases `.action-circle`, `.picker-*`,
 *        `.toast-host`),
 *      * el IPC nuevo (`library.playlistEdit`) está expuesto en `window.api`.
 *
 * Silencio absoluto: minimizamos la ventana justo tras `firstWindow` y
 * mantenemos audio muted todo el rato — el usuario está jugando.
 */
import { _electron } from 'playwright'
import { mkdirSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import os from 'os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shots = join(root, 'tests', 'shots', 'f22')
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

const tmpUserData = join(os.tmpdir(), `metrolist-e2e-userdata-f22-${Date.now()}`)

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
  // Silencio visual: minimiza sin esperar
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
const apiHasEdit = await win.evaluate(
  () => typeof window.api?.library?.playlistEdit === 'function'
)
check('preload expone window.api.library.playlistEdit', apiHasEdit)

if (mode === 'boot' || !signedIn) {
  console.log('[boot-only]')
  // Sin sesión no hay playlists reales que abrir, así que solo comprobamos que
  // los estilos y el toast host están cargados.
  const cssOk = await win.evaluate(() => {
    // Fabricamos una fila con `.action-circle` fuera de pantalla para leer
    // background-color computado — así vemos si la regla está viva.
    const el = document.createElement('button')
    el.className = 'action-circle'
    document.body.appendChild(el)
    const bg = getComputedStyle(el).backgroundColor
    document.body.removeChild(el)
    return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent'
  })
  check('regla .action-circle definida en CSS', cssOk)

  const toastCss = await win.evaluate(() => {
    const el = document.createElement('div')
    el.className = 'toast-host'
    document.body.appendChild(el)
    const pos = getComputedStyle(el).position
    document.body.removeChild(el)
    return pos === 'fixed'
  })
  check('regla .toast-host definida en CSS', toastCss)

  await win.screenshot({ path: join(shots, '0-boot.png') })
  if (running) {
    console.log(
      '[skip] la app del usuario está abierta — el E2E real (playlists reales)\n' +
        '       requiere cerrarla. Se valida por typecheck + esta prueba de arranque.'
    )
  } else if (!signedIn) {
    console.log('[skip] sin sesión iniciada — no hay playlists reales que probar.')
  }
  await app.close()
  try {
    rmSync(tmpUserData, { recursive: true, force: true })
  } catch {}
  console.log(failures === 0 ? '\nF22 · TODO OK (boot-only)' : `\nF22 · ${failures} FALLOS`)
  process.exit(failures === 0 ? 0 : 1)
}

// ---------- MODO FULL: app cerrada + sesión iniciada ----------
console.log('[playlist] buscando una playlist editable del usuario…')

await win.locator('.library-row').first().waitFor({ state: 'visible', timeout: 20000 })
const lib = await win.evaluate(() => window.api.music.library())
const playlists = lib?.playlists ?? []

// Filtro heurístico igual que en PlaylistPage: preferimos las que empiezan por
// PL (creadas por el usuario) y no son LM (me gusta) ni OLAK (mix auto).
const editableCandidates = playlists.filter((p) => {
  const raw = p.id.startsWith('VL') ? p.id.slice(2) : p.id
  return raw.startsWith('PL') && !raw.startsWith('PLLM') && !raw.startsWith('OLAK')
})

if (!editableCandidates.length) {
  console.log('[skip] el usuario no tiene ninguna playlist editable (todo son LM/OLAK)')
  await app.close()
  console.log(failures === 0 ? '\nF22 · TODO OK (sin playlist editable)' : `\nF22 · ${failures} FALLOS`)
  process.exit(failures === 0 ? 0 : 1)
}

let opened = false
let opts = null
for (const cand of editableCandidates.slice(0, 6)) {
  const row = win.locator('.library-row', { hasText: cand.title }).first()
  if ((await row.count()) === 0) continue
  await row.scrollIntoViewIfNeeded().catch(() => undefined)
  await row.click()
  await win.waitForTimeout(600)
  const detail = await win.evaluate(() => document.querySelector('.detail-header .name')?.textContent)
  if (detail) {
    opts = cand
    opened = true
    break
  }
}
check('abierta al menos una playlist editable', opened)
if (!opened) {
  await app.close()
  console.log(`\nF22 · ${failures} FALLOS`)
  process.exit(1)
}

// ---- Verifica los tres botones circulares ----
const addBtn = win.locator('.detail-actions .action-circle[aria-label*="Añadir"]').first()
const shareBtn = win.locator('.detail-actions .action-circle[aria-label*="Compartir"]').first()
const editBtn = win.locator('.detail-actions .action-circle[aria-label*="Editar"]').first()

check('botón + (Añadir canciones) visible', await addBtn.isVisible())
check('botón ↗ (Compartir) visible', await shareBtn.isVisible())
check('botón ✎ (Editar) visible', await editBtn.isVisible())

await win.screenshot({ path: join(shots, '1-actions.png') })

// ---- Compartir: pulsa y comprueba que se copió al portapapeles ----
await shareBtn.click()
await win.waitForTimeout(250)
const clipboard = await win
  .evaluate(() => navigator.clipboard.readText())
  .catch(() => '')
const expectedFragment = `music.youtube.com/playlist?list=`
check(
  `portapapeles contiene el enlace de la playlist ("${clipboard.slice(0, 60)}…")`,
  typeof clipboard === 'string' && clipboard.includes(expectedFragment)
)
check(
  'toast "Enlace copiado" visible tras compartir',
  await win.locator('.toast-host .toast', { hasText: 'Enlace copiado' }).first().isVisible().catch(() => false)
)
await win.waitForTimeout(2200) // deja que el toast se auto-desmonte

// ---- Añadir canciones: abre el modal, marca 2 canciones de 2 búsquedas, NO añade ----
await addBtn.click()
await win.locator('.picker-card').first().waitFor({ state: 'visible', timeout: 4000 })
check('TrackPickerModal abierto', await win.locator('.picker-card').isVisible())

const pickerInput = win.locator('.picker-card .picker-search .list-search input').first()
await pickerInput.fill('daft punk')
await win.waitForTimeout(900) // debounce 250 + red
const rows1 = await win.locator('.picker-card .picker-row').count()
console.log(`  resultados "daft punk": ${rows1}`)
if (rows1 > 0) await win.locator('.picker-card .picker-row').first().click()

await pickerInput.fill('rosalia')
await win.waitForTimeout(900)
const rows2 = await win.locator('.picker-card .picker-row').count()
console.log(`  resultados "rosalia": ${rows2}`)
if (rows2 > 0) await win.locator('.picker-card .picker-row').first().click()

const chipText = await win
  .locator('.picker-card .picker-chip')
  .first()
  .textContent()
  .catch(() => '')
console.log(`  chip contador: "${chipText}"`)
check(
  'chip contador dice "2 canciones seleccionadas"',
  typeof chipText === 'string' && chipText.includes('2 canciones seleccionadas')
)

await win.screenshot({ path: join(shots, '2-picker.png') })

// Cierra el picker SIN pulsar Añadir (no queremos tocar la playlist real).
await win
  .locator('.picker-card .btn.btn-secondary', { hasText: 'Cancelar' })
  .first()
  .click()
await win.locator('.picker-card').waitFor({ state: 'detached', timeout: 3000 }).catch(() => undefined)
check(
  'TrackPickerModal cerrado tras Cancelar',
  (await win.locator('.picker-card').count()) === 0
)

// ---- Editar: abre modal, cambia título, NO guarda, cancela ----
await editBtn.click()
await win.locator('.edit-card').first().waitFor({ state: 'visible', timeout: 4000 })
check('PlaylistEditModal abierto', await win.locator('.edit-card').isVisible())

const titleInput = win.locator('.edit-card .edit-title-input').first()
const originalTitle = await titleInput.inputValue()
await titleInput.fill('Metrolist test 2026')
const counterTxt = await win
  .locator('.edit-card .edit-counter')
  .first()
  .textContent()
  .catch(() => '')
check(
  `contador refleja los 19 chars ("${counterTxt?.trim()}")`,
  typeof counterTxt === 'string' && counterTxt.includes('19/100')
)
await win.screenshot({ path: join(shots, '3-edit.png') })

// Cancela sin guardar.
await win
  .locator('.edit-card .btn.btn-secondary', { hasText: 'Cancelar' })
  .first()
  .click()
await win.locator('.edit-card').waitFor({ state: 'detached', timeout: 3000 }).catch(() => undefined)
check('PlaylistEditModal cerrado tras Cancelar', (await win.locator('.edit-card').count()) === 0)

// Verifica que el título de la playlist en pantalla NO se ha modificado.
const headerAfter = await win
  .locator('.detail-header .name')
  .first()
  .textContent()
  .catch(() => '')
check(
  `título de la playlist intacto ("${headerAfter?.trim()}" vs "${originalTitle}" en el input)`,
  typeof headerAfter === 'string' &&
    headerAfter.trim() !== 'Metrolist test 2026'
)

await app.close()
console.log(failures === 0 ? '\nF22 · TODO OK' : `\nF22 · ${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
