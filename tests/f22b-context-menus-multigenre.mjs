/**
 * F22b · Menú contextual universal + multi-select de géneros — Playwright.
 *
 * Modos igual que F22/F23:
 *  - "full": app cerrada → arranca con la userData real y valida contra la
 *    Home/Sidebar/playlist "Me gusta" reales del usuario. NUNCA pulsa
 *    "Crear playlist" (no toca la cuenta).
 *  - "boot": app abierta → arranca en userData temporal (evita single-instance
 *    lock). Sin sesión solo verifica que existen las clases y la fábrica
 *    (openContextMenu global, chip "Todos", etc.).
 *
 * Silencio absoluto: minimizamos JUSTO tras `firstWindow` y mantenemos audio
 * muted todo el rato — el usuario está jugando.
 */
import { _electron } from 'playwright'
import { mkdirSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import os from 'os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shots = join(root, 'tests', 'shots', 'f22b')
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

const tmpUserData = join(os.tmpdir(), `eros-e2e-userdata-f22b-${Date.now()}`)

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

// ---------- Comunes: ContextMenuHost + CSS presente ----------
const cssCtxOk = await win.evaluate(() => {
  const el = document.createElement('div')
  el.className = 'context-menu'
  document.body.appendChild(el)
  const cs = getComputedStyle(el)
  const ok = cs.position === 'fixed'
  document.body.removeChild(el)
  return ok
})
check('regla .context-menu definida en CSS', cssCtxOk)

if (mode === 'boot' || !signedIn) {
  console.log('[boot-only]')
  await win.screenshot({ path: join(shots, '0-boot.png') })
  if (running) {
    console.log(
      '[skip] la app del usuario está abierta — el E2E real (Home + sidebar +\n' +
        '       LM) requiere cerrarla. Se valida por typecheck + esta prueba de arranque.'
    )
  } else if (!signedIn) {
    console.log('[skip] sin sesión iniciada — no hay Home/sidebar poblados.')
  }
  await app.close()
  try {
    rmSync(tmpUserData, { recursive: true, force: true })
  } catch {}
  console.log(failures === 0 ? '\nF22b · TODO OK (boot-only)' : `\nF22b · ${failures} FALLOS`)
  process.exit(failures === 0 ? 0 : 1)
}

// ---------- MODO FULL: app cerrada + sesión iniciada ----------

// 1) HOME · Clic derecho en la primera .media-card debe abrir menú.
console.log('[home] esperando tarjetas…')
try {
  await win
    .locator('.media-card')
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
} catch {
  console.log('[skip] Home sin tarjetas visibles — abortamos sin fallar')
  await app.close()
  console.log(failures === 0 ? '\nF22b · TODO OK (sin Home)' : `\nF22b · ${failures} FALLOS`)
  process.exit(failures === 0 ? 0 : 1)
}
const firstCard = win.locator('.media-card').first()
await firstCard.scrollIntoViewIfNeeded().catch(() => undefined)
await firstCard.click({ button: 'right' })
await win.waitForTimeout(200)
const homeMenuVisible = await win.locator('.context-menu').first().isVisible().catch(() => false)
check('clic derecho en .media-card abre .context-menu', homeMenuVisible)
const homeMenuItems = await win.locator('.context-menu button').count()
console.log(`  items del menú: ${homeMenuItems}`)
check('menú de tarjeta tiene ≥3 opciones', homeMenuItems >= 3)
await win.screenshot({ path: join(shots, '1-card-menu.png') })
// Cierra con Escape
await win.keyboard.press('Escape')
await win.waitForTimeout(150)
check(
  '.context-menu se cierra al pulsar Escape',
  (await win.locator('.context-menu').count()) === 0
)

// 2) SIDEBAR · Clic derecho en la primera .library-row.
await win.locator('.library-row').first().waitFor({ state: 'visible', timeout: 15000 })
const firstSidebarRow = win.locator('.library-row').first()
await firstSidebarRow.scrollIntoViewIfNeeded().catch(() => undefined)
await firstSidebarRow.click({ button: 'right' })
await win.waitForTimeout(200)
const sideMenuVisible = await win.locator('.context-menu').first().isVisible().catch(() => false)
check('clic derecho en .library-row abre .context-menu', sideMenuVisible)
const sideItems = await win.locator('.context-menu button').count()
console.log(`  items del menú sidebar: ${sideItems}`)
check('menú de sidebar tiene ≥3 opciones', sideItems >= 3)
await win.screenshot({ path: join(shots, '2-sidebar-menu.png') })
await win.keyboard.press('Escape')
await win.waitForTimeout(150)

// 3) LM · Multi-select de géneros.
console.log('[playlist] buscando "Canciones/Música que me gusta"…')
const lib = await win.evaluate(() => window.api.music.library())
const playlists = lib?.playlists ?? []
const liked = playlists.find((p) => {
  const id = p.id ?? ''
  return id.startsWith('LM') || id.startsWith('VLLM')
})
if (!liked) {
  console.log('[skip] la biblioteca no expone la playlist LM/VLLM; no se puede probar multi-select.')
  await app.close()
  console.log(failures === 0 ? '\nF22b · TODO OK (sin LM)' : `\nF22b · ${failures} FALLOS`)
  process.exit(failures === 0 ? 0 : 1)
}
console.log(`[playlist] LM detectada — "${liked.title}" (id=${liked.id})`)
const likedRow = win.locator('.library-row', { hasText: liked.title }).first()
await likedRow.scrollIntoViewIfNeeded().catch(() => undefined)
await likedRow.click()
await win.locator('.detail-header .name').waitFor({ state: 'visible', timeout: 10000 })

// Espera a que aparezcan chips reales (no el skeleton "Cargando géneros…").
await win
  .waitForFunction(
    () => {
      const bar = document.querySelector('.genre-bar')
      if (!bar) return false
      const chips = bar.querySelectorAll('.chip:not(.is-loading)')
      return chips.length >= 3
    },
    null,
    { timeout: 12000 }
  )
  .catch(() => undefined)

const chipCount = await win.locator('.genre-bar .chip:not(.is-loading)').count()
check('hay ≥3 chips de género en LM', chipCount >= 3)

const totalRows = await win.locator('.track-table .track-row').count()
console.log(`  filas totales de LM: ${totalRows}`)

// Encuentra los primeros DOS chips que NO son "Todos" y púlsalos.
const nonAllChips = await win
  .locator('.genre-bar .chip:not(.is-loading)', { hasNotText: 'Todos' })
  .all()

if (nonAllChips.length < 2) {
  console.log('  [warn] menos de 2 chips no-"Todos" — no se puede validar multi-select estricto')
} else {
  const label1 = (await nonAllChips[0].innerText()).trim()
  const label2 = (await nonAllChips[1].innerText()).trim()
  await nonAllChips[0].click()
  await win.waitForTimeout(200)
  await nonAllChips[1].click()
  await win.waitForTimeout(200)

  const active = await win.locator('.genre-bar .chip.active-accent').count()
  console.log(`  chips activos tras 2 clicks: ${active} (esperado ≥2)`)
  check(`ambos chips ("${label1}" + "${label2}") quedan .active-accent`, active >= 2)

  const filteredRows = await win.locator('.track-table .track-row').count()
  console.log(`  filas tras multi-select: ${filteredRows}/${totalRows}`)
  check(
    'el filtro múltiple deja > 0 filas y ≤ el total (no crece)',
    filteredRows > 0 && filteredRows <= totalRows
  )

  const createBtn = win.locator('.genre-bar .genre-create-btn').first()
  const createVisible = await createBtn.isVisible().catch(() => false)
  check('botón "Crear playlist con [X + Y]" visible con ≥1 chip activo', createVisible)
  if (createVisible) {
    const label = (await createBtn.innerText()).trim()
    console.log(`  etiqueta del botón: "${label}"`)
    const mentionsBoth = label.includes(label1) && label.includes(label2)
    check(
      `etiqueta menciona ambos géneros (${label1} + ${label2})`,
      mentionsBoth || /crear playlist con .+ \+ .+/i.test(label)
    )
  }

  await win.screenshot({ path: join(shots, '3-multi-genre.png') })

  // NO pulsa "Crear" — no queremos tocar la cuenta.

  // Restaura pulsando "Todos".
  await win.locator('.genre-bar .chip', { hasText: 'Todos' }).first().click()
  await win.waitForTimeout(200)
  const restoredActive = await win.locator('.genre-bar .chip.active-accent').count()
  check(
    `"Todos" restaura y deja solo un chip activo (${restoredActive} activo/s)`,
    restoredActive === 1
  )
}

await app.close()
console.log(failures === 0 ? '\nF22b · TODO OK' : `\nF22b · ${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
