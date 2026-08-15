/**
 * F33 · Proxy HTTP/SOCKS.
 *
 * Verifica:
 *  1. Defaults en AppSettings (proxyMode='off', proxyUrl='').
 *  2. `settings.set({proxyMode:'off', proxyUrl:''})` no crashea.
 *  3. `settings.set({proxyMode:'http', proxyUrl:'127.0.0.1:9999'})` no crashea
 *     (aunque no haya proxy escuchando ahí — la aplicación del proxy es a
 *     nivel de sesión de Electron, no debe tumbar la app).
 *  4. Restaura los ajustes originales.
 *
 * SILENCIO ABSOLUTO: ventana minimizada + audio silenciado (usuario jugando).
 */
import { _electron } from 'playwright'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
const check = (name, cond) => {
  console.log(cond ? `  OK   ${name}` : `  FAIL ${name}`)
  if (!cond) failures++
}

const app = await _electron.launch({
  args: ['.'],
  cwd: root,
  env: { ...process.env, METROLIST_E2E: '1' }
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
// 1. Defaults
// -----------------------------------------------------------------
console.log('\n[1] Defaults de F33')
check('proxyMode es string', typeof originalSettings.proxyMode === 'string')
check("proxyMode default 'off'", originalSettings.proxyMode === 'off')
check('proxyUrl es string', typeof originalSettings.proxyUrl === 'string')
check("proxyUrl default ''", originalSettings.proxyUrl === '')

// -----------------------------------------------------------------
// 2. Set off/'' no crashea
// -----------------------------------------------------------------
console.log('\n[2] settings.set({proxyMode:off, proxyUrl:""})')
const s2 = await win
  .evaluate(() => window.api.settings.set({ proxyMode: 'off', proxyUrl: '' }))
  .catch((e) => ({ error: String(e?.message ?? e) }))
check('set devuelve objeto sin error', s2 && !s2.error)
check('proxyMode aplicado a off', s2?.proxyMode === 'off')

// -----------------------------------------------------------------
// 3. Set http/'127.0.0.1:9999' no crashea la app
// -----------------------------------------------------------------
console.log('\n[3] settings.set({proxyMode:http, proxyUrl:127.0.0.1:9999})')
const s3 = await win
  .evaluate(() =>
    window.api.settings.set({ proxyMode: 'http', proxyUrl: '127.0.0.1:9999' })
  )
  .catch((e) => ({ error: String(e?.message ?? e) }))
check('set devuelve objeto sin error', s3 && !s3.error)
check('proxyMode aplicado a http', s3?.proxyMode === 'http')
check('proxyUrl guardado', s3?.proxyUrl === '127.0.0.1:9999')

await win.waitForTimeout(500)
const stillAlive = await win.evaluate(() => 1 + 1).catch(() => null)
check('la ventana sigue viva tras aplicar proxy inexistente', stillAlive === 2)

// -----------------------------------------------------------------
// 4. Restaura defaults
// -----------------------------------------------------------------
console.log('\n[4] Restaurando ajustes originales')
await win.evaluate(
  (patch) => window.api.settings.set(patch),
  { proxyMode: originalSettings.proxyMode, proxyUrl: originalSettings.proxyUrl }
)
const finalSettings = await win.evaluate(() => window.api.settings.get())
check('proxyMode restaurado', finalSettings.proxyMode === originalSettings.proxyMode)
check('proxyUrl restaurado', finalSettings.proxyUrl === originalSettings.proxyUrl)

await app.close()
console.log(failures === 0 ? '\nF33 · TODO OK' : `\nF33 · ${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
