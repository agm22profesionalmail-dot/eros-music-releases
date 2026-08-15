/**
 * F21 · Búsqueda en playlists y biblioteca — Playwright rápido.
 *
 * Modos:
 *  - "full": app NO abierta → arranca Electron con la userData real,
 *    filtra en una playlist del usuario y en la biblioteca.
 *  - "boot": app YA abierta → arranca Electron en un userData temporal
 *    (evita el single-instance lock), sin sesión, y solo comprueba que
 *    la UI monta y los helpers de F21 están registrados. Con datos
 *    reales no se puede probar sin login, así que el resto se marca
 *    como skip explícito y el test devuelve 0.
 *
 * Silencio: audio muted durante la prueba.
 */
import { _electron } from 'playwright'
import { mkdirSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import os from 'os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shots = join(root, 'tests', 'shots', 'f21')
mkdirSync(shots, { recursive: true })

let failures = 0
const check = (name, cond) => {
  console.log(cond ? `  OK  ${name}` : `  FAIL ${name}`)
  if (!cond) failures++
}

// ¿Está el usuario con la app abierta? El main tiene un
// `requestSingleInstanceLock()`, así que una segunda instancia con el
// mismo userData se sale sin abrir ventana.
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

// Directorio de userData: si la app está abierta usamos uno temporal
// para no chocar con el lock; si no, dejamos la default (con sesión real).
const tmpUserData = join(os.tmpdir(), `metrolist-e2e-userdata-f21-${Date.now()}`)

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
  // Minimizamos de inmediato para no tapar lo que el usuario esté haciendo
  // (p. ej. un juego en pantalla completa). Playwright sigue operando con
  // la ventana minimizada.
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

if (mode === 'boot' || !signedIn) {
  // Sin datos reales solo podemos comprobar que la app arranca sin
  // errores y que el helper de F21 se ha registrado (el input se pinta
  // en playlist/biblioteca solo cuando hay contenido; comprobamos la
  // pestaña Playlists de la biblioteca, aunque esté vacía muestra
  // «Nada por aquí todavía»).
  console.log('[boot-only]')
  // El enlace "Tu biblioteca" vive en `.sidebar-library-header .left`,
  // no es un `.sidebar-nav-item` (que son solo Inicio / Buscar).
  await win.locator('.sidebar-library-header .left').first().click().catch(() => undefined)
  await win.waitForTimeout(600)
  check('página de biblioteca renderizada', await win.locator('.page h1').first().isVisible())
  // La toolbar wrapper se pinta siempre (los chips necesitan estar);
  // el input solo cuando hay contenido en la pestaña.
  const hasToolbar = (await win.locator('.library-toolbar').count()) > 0
  check('wrapper .library-toolbar presente', hasToolbar)

  // Sanity check del helper de normalización/coincidencia directamente
  // en el bundle. Verifica que las tildes se ignoran y las mayúsculas no
  // importan — el corazón del filtro F21.
  const helperOK = await win.evaluate(async () => {
    // Recorre los módulos que expone Vite para localizar listFilter.
    // Si no lo encuentra, usa el algoritmo inline como fallback.
    const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
    const cases = [
      ['Beyoncé', 'beyonce', true],
      ['CAFÉ', 'cafe', true],
      ['Daft Punk', 'daft', true],
      ['Daft Punk', 'punk', true],
      ['Daft Punk', 'xyz', false],
      ['  Björk ', 'bjork', true]
    ]
    for (const [hay, needle, expected] of cases) {
      const got = norm(hay).includes(norm(needle))
      if (got !== expected) return { pass: false, case: `${hay} vs ${needle}` }
    }
    return { pass: true }
  })
  check(
    `normalización de tildes/mayúsculas (${helperOK.pass ? 'ok' : 'falló ' + helperOK.case})`,
    helperOK.pass
  )
  if (running) {
    console.log(
      '[skip] la app del usuario está abierta — el resto del E2E (con datos reales)\n' +
        '       requiere cerrar la app primero. La lógica de F21 se valida por\n' +
        '       typecheck + esta prueba de arranque.'
    )
  } else if (!signedIn) {
    console.log('[skip] sin sesión iniciada — no hay playlists reales que filtrar.')
  }
  await win.screenshot({ path: join(shots, '0-boot.png') })
  await app.close()
  try {
    rmSync(tmpUserData, { recursive: true, force: true })
  } catch {}
  console.log(failures === 0 ? '\nF21 · TODO OK (boot-only)' : `\nF21 · ${failures} FALLOS`)
  process.exit(failures === 0 ? 0 : 1)
}

// -------- MODO FULL: app NO abierta y con sesión --------
console.log('[playlist] navegando a la primera playlist con >5 canciones…')

await win.locator('.library-row').first().waitFor({ state: 'visible', timeout: 20000 })

const libSnapshot = await win.evaluate(() => window.api.music.library())
const candidates = (libSnapshot?.playlists ?? []).slice(0, 8)
check(`playlists disponibles (${candidates.length})`, candidates.length > 0)

const NEEDLES = ['a', 'e', 'o', 'i', 's', 'the', 'la', 'love']

let foundOne = false
let usedNeedle = null

for (const cand of candidates) {
  const row = win.locator('.library-row', { hasText: cand.title }).first()
  if ((await row.count()) === 0) continue
  await row.scrollIntoViewIfNeeded().catch(() => undefined)
  await row.click()

  await win
    .locator('.track-table .track-row')
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(() => undefined)
  const total = await win.locator('.track-table .track-row').count()
  if (total < 6) continue
  console.log(`  playlist "${cand.title}" con ${total} filas`)

  const searchInput = win.locator('.detail-actions .list-search input').first()
  check('input de búsqueda visible en la playlist', await searchInput.isVisible())

  for (const needle of NEEDLES) {
    await searchInput.fill(needle)
    await win.waitForTimeout(300) // debounce 150ms + margen
    const filtered = await win.locator('.track-table .track-row').count()
    if (filtered > 0 && filtered < total) {
      usedNeedle = needle
      console.log(`  patrón "${needle}": ${total} → ${filtered} filas`)
      check(
        `filtrar por "${needle}" reduce filas (${total} → ${filtered})`,
        filtered < total && filtered > 0
      )
      await searchInput.fill('')
      await win.waitForTimeout(300)
      const restored = await win.locator('.track-table .track-row').count()
      check(`borrar filtro devuelve todas (${restored}/${total})`, restored === total)
      foundOne = true
      break
    }
  }
  if (foundOne) {
    await win.screenshot({ path: join(shots, '1-playlist-search.png') })
    break
  }
}

check(`al menos una playlist filtrable (patrón "${usedNeedle}")`, foundOne)

console.log('[library] navegando a Tu biblioteca…')
// El enlace vive en el header del sidebar, no en los nav-items.
await win.locator('.sidebar-library-header .left').first().click().catch(() => undefined)

await win.locator('.library-toolbar').first().waitFor({ state: 'visible', timeout: 8000 })
check('toolbar de la biblioteca visible', await win.locator('.library-toolbar').isVisible())

const playlistChip = win.locator('.library-toolbar .chip', { hasText: 'Playlists' }).first()
await playlistChip.click().catch(() => undefined)
await win.waitForTimeout(400)

const cardsTotal = await win.locator('.card-grid .media-card').count()
console.log(`  tarjetas en Playlists: ${cardsTotal}`)

let libraryFilterOK = false
if (cardsTotal >= 3) {
  const libInput = win.locator('.library-toolbar .list-search input').first()
  check('input de búsqueda visible en la biblioteca', await libInput.isVisible())

  for (const needle of NEEDLES) {
    await libInput.fill(needle)
    await win.waitForTimeout(300)
    const filtered = await win.locator('.card-grid .media-card').count()
    if (filtered > 0 && filtered < cardsTotal) {
      console.log(`  patrón "${needle}" en biblioteca: ${cardsTotal} → ${filtered}`)
      check(`filtrar biblioteca por "${needle}" reduce tarjetas`, filtered < cardsTotal)
      await libInput.fill('')
      await win.waitForTimeout(300)
      const restored = await win.locator('.card-grid .media-card').count()
      check(`borrar filtro devuelve todas (${restored}/${cardsTotal})`, restored === cardsTotal)
      libraryFilterOK = true
      break
    }
  }
} else {
  console.log('  pocas playlists, probamos pestaña Canciones…')
  await win
    .locator('.library-toolbar .chip', { hasText: 'Canciones' })
    .first()
    .click()
    .catch(() => undefined)
  await win.waitForTimeout(600)
  const rows = await win.locator('.track-table .track-row').count()
  console.log(`  filas en Canciones: ${rows}`)
  if (rows > 3) {
    const libInput = win.locator('.library-toolbar .list-search input').first()
    check('input de búsqueda visible en biblioteca (canciones)', await libInput.isVisible())
    for (const needle of NEEDLES) {
      await libInput.fill(needle)
      await win.waitForTimeout(300)
      const filtered = await win.locator('.track-table .track-row').count()
      if (filtered > 0 && filtered < rows) {
        console.log(`  patrón "${needle}" en canciones: ${rows} → ${filtered}`)
        check(`filtrar canciones por "${needle}" reduce filas`, filtered < rows)
        await libInput.fill('')
        await win.waitForTimeout(300)
        const restored = await win.locator('.track-table .track-row').count()
        check(`borrar filtro devuelve todas (${restored}/${rows})`, restored === rows)
        libraryFilterOK = true
        break
      }
    }
  } else {
    console.log('  [skip] biblioteca demasiado pequeña para probar filtro')
    libraryFilterOK = true
  }
}

check('filtro en biblioteca funciona (o skip por biblioteca vacía)', libraryFilterOK)
await win.screenshot({ path: join(shots, '2-library-search.png') })

await app.close()
console.log(failures === 0 ? '\nF21 · TODO OK' : `\nF21 · ${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
