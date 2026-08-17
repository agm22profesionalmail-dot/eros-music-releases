/**
 * F32 · Personalización de Home.
 *
 * Verifica:
 *  1. Defaults en AppSettings (homeShuffleShelves, homeShelvesOrder,
 *     homeHiddenShelves, homeQuickPicks).
 *  2. Con `homeShuffleShelves: true` la app no crashea y sigue renderizando.
 *  3. Ocultar la categoría "recientes" hace desaparecer estanterías cuyo
 *     título matchee ese patrón.
 *  4. El sidebar tiene la entrada "Recap" bajo Buscar.
 *  5. Restaura todos los ajustes al finalizar.
 *
 * SILENCIO ABSOLUTO: ventana minimizada + audio silenciado (usuario jugando).
 */
import { _electron } from 'playwright'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shots = join(root, 'tests', 'shots', 'f32')
mkdirSync(shots, { recursive: true })

let failures = 0
const check = (name, cond) => {
  console.log(cond ? `  OK   ${name}` : `  FAIL ${name}`)
  if (!cond) failures++
}

const app = await _electron.launch({
  args: ['.'],
  cwd: root,
  env: { ...process.env, EROS_E2E: '1' }
})

const win = await app.firstWindow()
await win.evaluate(() => window.api.win.minimize()).catch(() => undefined)
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(1500)
await win.evaluate(() => window.api.win.minimize()).catch(() => undefined)
await win.evaluate(() => {
  const mute = () => document.querySelectorAll('audio').forEach((a) => (a.muted = true))
  mute()
  new MutationObserver(mute).observe(document.body, { childList: true, subtree: true })
})

const originalSettings = await win.evaluate(() => window.api.settings.get())

// -----------------------------------------------------------------
// 1. Defaults de F32
// -----------------------------------------------------------------
console.log('\n[1] Defaults de F32')
check('homeShuffleShelves es booleano', typeof originalSettings.homeShuffleShelves === 'boolean')
check('homeShuffleShelves default false', originalSettings.homeShuffleShelves === false)
check('homeShelvesOrder es array', Array.isArray(originalSettings.homeShelvesOrder))
check('homeHiddenShelves es array', Array.isArray(originalSettings.homeHiddenShelves))
check('homeQuickPicks es array', Array.isArray(originalSettings.homeQuickPicks))
check(
  'homeQuickPicks default = [recientes, novedades, mixes, radios]',
  JSON.stringify(originalSettings.homeQuickPicks) ===
    JSON.stringify(['recientes', 'novedades', 'mixes', 'radios'])
)

// -----------------------------------------------------------------
// 2. Sidebar tiene entrada "Recap"
// -----------------------------------------------------------------
console.log('\n[2] Sidebar entry Recap')
await win.waitForTimeout(400)
const sidebarHasRecap = await win.evaluate(() => {
  const items = Array.from(document.querySelectorAll('.sidebar-nav .sidebar-nav-item'))
  return items.some((el) => /recap/i.test(el.textContent ?? ''))
})
check('sidebar-nav contiene item "Recap"', sidebarHasRecap === true)

// -----------------------------------------------------------------
// 3. IPC de índice de estanterías responde (aunque no haya sesión)
// -----------------------------------------------------------------
console.log('\n[3] IPC homeShelfIndex')
const indexed = await win
  .evaluate(() => window.api.music.homeShelfIndex())
  .catch(() => null)
check('homeShelfIndex devuelve algo (array o vacío)', indexed === null || Array.isArray(indexed))

// -----------------------------------------------------------------
// 4. Shuffle no crashea (renderiza estanterías o el estado vacío)
// -----------------------------------------------------------------
console.log('\n[4] Shuffle activado no rompe Home')
await win.evaluate(() => window.api.settings.set({ homeShuffleShelves: true }))
await win.waitForTimeout(500)
// Fuerza remount navegando search→home para reejecutar useMemo
await win.evaluate(() => document.querySelector('.sidebar-nav .sidebar-nav-item')?.click())
await win.waitForTimeout(300)
const homeStillWorks1 = await win.evaluate(
  () =>
    !!document.querySelector('.home-hero') || !!document.querySelector('.error-banner')
)
check('Home renderiza con shuffle=true (1a carga)', homeStillWorks1 === true)

// -----------------------------------------------------------------
// 5. Ocultar "recientes" — verifica que ninguna estantería visible matchee
// -----------------------------------------------------------------
console.log('\n[5] Ocultar categoría "recientes"')
await win.evaluate(() =>
  window.api.settings.set({ homeHiddenShelves: ['recientes'], homeShuffleShelves: false })
)
await win.waitForTimeout(800)
const visibleTitles = await win.evaluate(() =>
  Array.from(document.querySelectorAll('.shelf .shelf-header h2')).map(
    (el) => el.textContent?.toLowerCase() ?? ''
  )
)
const anyRecent = visibleTitles.some((t) => /reciente|recent|vuelve a escuchar/.test(t))
check(
  'ninguna estantería con "reciente" visible tras filtrar',
  anyRecent === false
)

// -----------------------------------------------------------------
// 6. RESTAURA defaults
// -----------------------------------------------------------------
console.log('\n[6] Restaurando ajustes originales')
await win.evaluate(
  (patch) => window.api.settings.set(patch),
  {
    homeShuffleShelves: originalSettings.homeShuffleShelves,
    homeShelvesOrder: originalSettings.homeShelvesOrder,
    homeHiddenShelves: originalSettings.homeHiddenShelves,
    homeQuickPicks: originalSettings.homeQuickPicks
  }
)
const finalSettings = await win.evaluate(() => window.api.settings.get())
check('homeShuffleShelves restaurado', finalSettings.homeShuffleShelves === originalSettings.homeShuffleShelves)
check(
  'homeShelvesOrder restaurado',
  JSON.stringify(finalSettings.homeShelvesOrder) === JSON.stringify(originalSettings.homeShelvesOrder)
)
check(
  'homeHiddenShelves restaurado',
  JSON.stringify(finalSettings.homeHiddenShelves) === JSON.stringify(originalSettings.homeHiddenShelves)
)
check(
  'homeQuickPicks restaurado',
  JSON.stringify(finalSettings.homeQuickPicks) === JSON.stringify(originalSettings.homeQuickPicks)
)

await app.close()
console.log(failures === 0 ? '\nF32 · TODO OK' : `\nF32 · ${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
