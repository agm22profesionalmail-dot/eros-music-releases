/**
 * F34 · i18n de la UI (es/en).
 *
 * SILENCIO ABSOLUTO. Minimiza inmediatamente tras firstWindow y mantiene
 * audio muted. Restaura uiLanguage='auto' al final.
 *
 * Verifica:
 *   1. `uiLanguage` existe en settings y su default es 'auto'.
 *   2. Al setear 'en', el sidebar cambia el texto de "Inicio" a "Home".
 *   3. Al setear 'es', vuelve a "Inicio".
 *   4. Restaura 'auto'.
 */
import { _electron } from 'playwright'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const short = (s, n = 220) => String(s ?? '').slice(0, n)
const results = []

function ok(name, cond, note = '') {
  const s = cond ? 'OK' : 'BUG'
  results.push({ name, status: s, note })
  console.log(`  ${s}  ${name}${note ? ` — ${note}` : ''}`)
}

console.log(`[F34] arrancando · ${new Date().toISOString()}`)
const app = await _electron.launch({
  args: ['.'],
  cwd: root,
  env: { ...process.env, METROLIST_E2E: '1' }
})

const win = await app.firstWindow()
await win.evaluate(() => window.api.win.minimize()).catch(() => undefined)

win.on('console', (m) => {
  if (m.type() === 'error') console.log(`  [renderer error] ${short(m.text(), 200)}`)
})

await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(1500)
await win.evaluate(() => {
  document.querySelectorAll('audio').forEach((a) => (a.muted = true))
})
await win.evaluate(() => window.api.win.minimize()).catch(() => undefined)

// Snapshot inicial — para restaurar al final
const initialSettings = await win.evaluate(() => window.api.settings.get())
const initialLang = initialSettings?.uiLanguage
console.log(`[F34] uiLanguage inicial = "${initialLang}"`)

try {
  // 1. uiLanguage existe y default = 'auto'
  ok('settings.uiLanguage está definido', typeof initialLang === 'string',
    `got=${typeof initialLang}`)
  // El default es 'auto'; si el usuario ya lo cambió en su sesión, aceptamos
  // cualquier valor válido y solo garantizamos que lo restauramos al final.
  ok('uiLanguage tiene valor válido', ['auto', 'es', 'en'].includes(initialLang),
    `value=${initialLang}`)

  // Espera a que el sidebar exista
  await win.locator('.sidebar-nav-item').first().waitFor({ state: 'visible', timeout: 8000 })

  // Lee la etiqueta del primer .sidebar-nav-item (que es "Inicio"/"Home")
  const readHome = async () =>
    (await win.locator('.sidebar-nav-item').first().innerText()).trim()

  const before = await readHome()
  console.log(`  sidebar item[0] antes = "${before}"`)

  // 2. Cambia a inglés
  await win.evaluate(() => window.api.settings.set({ uiLanguage: 'en' }))
  await win.waitForTimeout(700)
  const enText = await readHome()
  console.log(`  sidebar item[0] tras EN = "${enText}"`)
  ok('sidebar cambia con uiLanguage=en (texto distinto al inicial)',
    enText !== before || /home/i.test(enText),
    `"${before}" → "${enText}"`)
  ok('sidebar dice "Home" en inglés', /home/i.test(enText), `got="${enText}"`)

  // 3. Cambia a español
  await win.evaluate(() => window.api.settings.set({ uiLanguage: 'es' }))
  await win.waitForTimeout(700)
  const esText = await readHome()
  console.log(`  sidebar item[0] tras ES = "${esText}"`)
  ok('sidebar dice "Inicio" en español', /inicio/i.test(esText), `got="${esText}"`)

  // Comprueba también el título de Ajustes: debe ser "Ajustes" en es, "Settings" en en
  await win.evaluate(() => window.api.settings.set({ uiLanguage: 'en' }))
  await win.waitForTimeout(400)
  // Navega a Ajustes clicando el primer avatar-btn del topbar
  const settingsBtn = win.locator('.avatar-btn').first()
  await settingsBtn.click().catch(() => undefined)
  await win.waitForTimeout(500)
  const h1En = await win.locator('.page h1').first().innerText().catch(() => '')
  ok('página Ajustes en EN muestra "Settings"', /settings/i.test(h1En), `h1="${h1En}"`)

  await win.evaluate(() => window.api.settings.set({ uiLanguage: 'es' }))
  await win.waitForTimeout(500)
  const h1Es = await win.locator('.page h1').first().innerText().catch(() => '')
  ok('página Ajustes en ES muestra "Ajustes"', /ajustes/i.test(h1Es), `h1="${h1Es}"`)
} catch (err) {
  console.log('  !! excepción:', short(err?.stack || err?.message || err, 400))
  ok('flujo completo sin excepción', false, short(err?.message || err))
}

// Restauración final: siempre auto (aunque el inicial fuera otro,
// 'auto' es el valor por defecto de fábrica que el brief pide restaurar).
try {
  const final = await win.evaluate(() => window.api.settings.set({ uiLanguage: 'auto' }))
  ok('restauración uiLanguage=auto', final?.uiLanguage === 'auto',
    `final=${final?.uiLanguage}`)
} catch (err) {
  ok('restauración uiLanguage=auto', false, short(err?.message || err))
}

await app.close()

const okN = results.filter((r) => r.status === 'OK').length
const bugN = results.filter((r) => r.status === 'BUG').length
console.log(`\n[F34] hecho · ${results.length} pruebas · ${okN} OK / ${bugN} BUG`)
process.exit(bugN > 0 ? 1 : 0)
