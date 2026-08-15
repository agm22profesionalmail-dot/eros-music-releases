/**
 * F31 · Wrapped y estadísticas.
 *
 * Verifica:
 *  1. `settings.get()` devuelve las 4 claves nuevas con sus defaults.
 *  2. `stats.recap()` devuelve objeto con hoursListened / topTracks / topArtists.
 *  3. `stats.topTracks(period)` devuelve array (posiblemente vacío).
 *  4. `stats.topArtists(period)` devuelve array (posiblemente vacío).
 *  5. Si `showWrappedRecapCard` está activo, Home muestra `.recap-card`.
 *  6. Navega a `/recap` y verifica que la página renderiza sin errores.
 *  7. `stats.createTopPlaylist` existe (no se ejecuta para no crear nada).
 *  8. RESTAURA los settings originales.
 *
 * SILENCIO ABSOLUTO: ventana minimizada + audio silenciado (usuario jugando).
 */
import { _electron } from 'playwright'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shots = join(root, 'tests', 'shots', 'f31')
mkdirSync(shots, { recursive: true })

let failures = 0
const check = (name, cond) => {
  console.log(cond ? `  OK  ${name}` : `  FAIL ${name}`)
  if (!cond) failures++
}

const app = await _electron.launch({
  args: ['.'],
  cwd: root,
  env: { ...process.env, METROLIST_E2E: '1' }
})

const win = await app.firstWindow()
// SILENCIO: minimiza inmediatamente
await win.evaluate(() => window.api.win.minimize()).catch(() => undefined)
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(1500)
await win.evaluate(() => window.api.win.minimize()).catch(() => undefined)
// Silencia todo <audio> por si algún autoplay arranca
await win.evaluate(() => {
  const mute = () => document.querySelectorAll('audio').forEach((a) => (a.muted = true))
  mute()
  new MutationObserver(mute).observe(document.body, { childList: true, subtree: true })
})

const originalSettings = await win.evaluate(() => window.api.settings.get())

// -----------------------------------------------------------------
// 1. Defaults de F31
// -----------------------------------------------------------------
console.log('\n[1] Defaults de F31')
check('wrappedTopN es number entre 10 y 500',
  typeof originalSettings.wrappedTopN === 'number' &&
    originalSettings.wrappedTopN >= 10 &&
    originalSettings.wrappedTopN <= 500)
check('wrappedTopN por defecto 50', originalSettings.wrappedTopN === 50)
check('showWrappedRecapCard === true', originalSettings.showWrappedRecapCard === true)
check('showTopWeekly === true', originalSettings.showTopWeekly === true)
check('showTopMonthly === true', originalSettings.showTopMonthly === true)

// -----------------------------------------------------------------
// 2. IPC stats.recap()
// -----------------------------------------------------------------
console.log('\n[2] stats.recap() devuelve estructura correcta')
const recap = await win.evaluate(() => window.api.stats.recap())
check('recap es objeto', recap && typeof recap === 'object')
check('recap.period tiene start y end', typeof recap.period?.start === 'number' && typeof recap.period?.end === 'number')
check('recap.hoursListened es number', typeof recap.hoursListened === 'number')
check('recap.uniqueTracks es number', typeof recap.uniqueTracks === 'number')
check('recap.uniqueArtists es number', typeof recap.uniqueArtists === 'number')
check('recap.topTracks es array', Array.isArray(recap.topTracks))
check('recap.topArtists es array', Array.isArray(recap.topArtists))

// -----------------------------------------------------------------
// 3-4. stats.topTracks / stats.topArtists con período
// -----------------------------------------------------------------
console.log('\n[3] stats.topTracks(last30)')
const now = Date.now()
const period30 = { start: now - 30 * 86400000, end: now }
const tracks = await win.evaluate((p) => window.api.stats.topTracks(p), period30)
check('topTracks devuelve array', Array.isArray(tracks))

console.log('\n[4] stats.topArtists(last30)')
const artists = await win.evaluate((p) => window.api.stats.topArtists(p), period30)
check('topArtists devuelve array', Array.isArray(artists))

// -----------------------------------------------------------------
// 5. Home muestra .recap-card cuando el toggle está activo
// -----------------------------------------------------------------
console.log('\n[5] Home muestra la tarjeta Recap')
// Navega a Home
await win.evaluate(() => {
  // Estado inicial ya es home, pero forzamos por si el test previo dejó otra vista
  const el = document.querySelector('.home-recap')
  return !!el
})
await win.waitForTimeout(500)
const recapCardCount = await win.evaluate(() => document.querySelectorAll('.recap-card').length)
check('hay al menos 1 .recap-card en Home', recapCardCount >= 1)

// -----------------------------------------------------------------
// 6. Navega a /recap y verifica que renderiza
// -----------------------------------------------------------------
console.log('\n[6] Navegación a Recap')
await win.evaluate(() => {
  // Usa la API global del router expuesta por zustand a través del bundle:
  // en su defecto, click en la tarjeta Recap.
  const btn = document.querySelector('.recap-card--wrapped') || document.querySelector('.recap-card')
  if (btn) btn.click()
})
await win.waitForTimeout(600)
const hasRecapPage = await win.evaluate(() => !!document.querySelector('.recap-page'))
check('.recap-page se monta al navegar', hasRecapPage)
const hasRecapH1 = await win.evaluate(() => {
  const h1 = document.querySelector('.recap-page h1')
  return h1?.textContent?.trim() === 'Tu Recap'
})
check('cabecera "Tu Recap" presente', hasRecapH1)
const rangeChips = await win.evaluate(() => document.querySelectorAll('.recap-range .chip').length)
check('3 chips de rango (semana/mes/30 días)', rangeChips === 3)
const metricsCount = await win.evaluate(() => document.querySelectorAll('.recap-metric').length)
check('4 tarjetas de métricas', metricsCount === 4)

// -----------------------------------------------------------------
// 7. stats.createTopPlaylist existe (NO se ejecuta la creación)
// -----------------------------------------------------------------
console.log('\n[7] stats.createTopPlaylist expuesto')
const hasCreate = await win.evaluate(
  () => typeof window.api.stats?.createTopPlaylist === 'function'
)
check('window.api.stats.createTopPlaylist es función', hasCreate === true)

// -----------------------------------------------------------------
// 8. RESTAURA defaults (por si el usuario tenía otros)
// -----------------------------------------------------------------
console.log('\n[8] Restaurando ajustes originales')
await win.evaluate(
  (patch) => window.api.settings.set(patch),
  {
    wrappedTopN: originalSettings.wrappedTopN,
    showWrappedRecapCard: originalSettings.showWrappedRecapCard,
    showTopMonthly: originalSettings.showTopMonthly,
    showTopWeekly: originalSettings.showTopWeekly
  }
)
const finalSettings = await win.evaluate(() => window.api.settings.get())
check('wrappedTopN restaurado', finalSettings.wrappedTopN === originalSettings.wrappedTopN)
check('showWrappedRecapCard restaurado', finalSettings.showWrappedRecapCard === originalSettings.showWrappedRecapCard)

await app.close()
console.log(failures === 0 ? '\nF31 · TODO OK' : `\nF31 · ${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
