/**
 * F20 · Perfil de usuario — prueba rápida con Playwright.
 *
 * UX: pulsar la foto de perfil de la topbar navega DIRECTO a la página
 * de Perfil (sin menú desplegable — un peer del brief lo cambió a esto).
 *
 * 1) Abre la app, guarda el perfil previo (para restaurarlo al final).
 * 2) Navega a Perfil pulsando el avatar.
 * 3) Escribe nombre "Test User", bio "Amante de la música", enabled=true.
 * 4) Cierra y reabre la app; comprueba que persiste (BD SQLite compartida).
 * 5) Restaura el perfil al valor original.
 * 6) Cierra Electron.
 */
import { _electron } from 'playwright'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shots = join(root, 'tests', 'shots', 'f20')
mkdirSync(shots, { recursive: true })

let failures = 0
const check = (name, cond) => {
  console.log(cond ? `  OK  ${name}` : `  FAIL ${name}`)
  if (!cond) failures++
}

// ---- helper: relanza la app ----
async function launch() {
  const app = await _electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, METROLIST_E2E: '1' }
  })
  app.process().stderr?.on('data', (d) => {
    const s = String(d).trim()
    if (s && !s.includes('Parser') && !s.includes('Autofill'))
      console.log('[main:err]', s.slice(0, 200))
  })
  const win = await app.firstWindow()
  win.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[renderer:error]', msg.text().slice(0, 200))
  })
  await win.waitForLoadState('domcontentloaded')
  await win.waitForTimeout(1500)
  // Silencio: audio muted para no molestar durante el test
  await win.evaluate(() => {
    document.querySelectorAll('audio').forEach((a) => (a.muted = true))
    // engancha un observer por si aparecen nuevos <audio>
    new MutationObserver(() => {
      document.querySelectorAll('audio').forEach((a) => (a.muted = true))
    }).observe(document.body, { childList: true, subtree: true })
  })
  return { app, win }
}

// ---- 1) captura estado inicial ----
console.log('[setup] guardando perfil previo…')
let originalProfile
{
  const { app, win } = await launch()
  originalProfile = await win.evaluate(() => window.api.profile.get())
  console.log('  perfil original:', JSON.stringify(originalProfile).slice(0, 120))
  await app.close()
}

// ---- 2) escribe el perfil de prueba ----
console.log('[test] escribiendo perfil de prueba…')
{
  const { app, win } = await launch()

  // Comprueba sesión (si no hay, el menú del avatar no existe)
  const authState = await win.evaluate(() => window.api.auth.getState())
  const signedIn = authState.status === 'signedIn'
  check('sesión iniciada (necesario para el menú del avatar)', signedIn)

  if (signedIn) {
    // Pulsa la foto de perfil de la topbar (segundo .avatar-btn):
    // por el nuevo UX debe navegar DIRECTO a la página de Perfil.
    const avatars = win.locator('.avatar-btn')
    check('botones .avatar-btn en topbar', (await avatars.count()) >= 2)
    await avatars.nth(1).click()
    await win.waitForTimeout(400)

    // Estamos en la página de perfil
    check(
      'cabecera "Perfil" visible',
      await win.locator('.profile-page h1').first().isVisible()
    )

    // Nombre y bio
    await win.locator('#pf-name').fill('Test User')
    await win.locator('#pf-bio').fill('Amante de la música')

    // Toggle "enabled"
    const toggle = win.locator('.profile-row input[type=checkbox]').first()
    const isChecked = await toggle.isChecked()
    if (!isChecked) await toggle.check()

    // Espera al autoguardado (debounce 300 ms + un margen)
    await win.waitForTimeout(900)
    await win.screenshot({ path: join(shots, '1-editing.png') })

    // Verifica que el perfil está guardado en el main
    const stored = await win.evaluate(() => window.api.profile.get())
    console.log('  perfil guardado:', JSON.stringify(stored).slice(0, 200))
    check('displayName persistido', stored.displayName === 'Test User')
    check('bio persistida', stored.bio === 'Amante de la música')
    check('enabled=true persistido', stored.enabled === true)

    // El avatar de la topbar debería mostrar el nombre en su title
    // (la topbar se renderiza en todas las páginas)
    const avatarTitle = await avatars.nth(1).getAttribute('title')
    check(`title del avatar = "Test User" (recibí "${avatarTitle}")`, avatarTitle === 'Test User')
  }

  await app.close()
}

// ---- 3) relanza y comprueba persistencia ----
console.log('[test] reabriendo para comprobar persistencia…')
{
  const { app, win } = await launch()
  const reopened = await win.evaluate(() => window.api.profile.get())
  console.log('  perfil tras reabrir:', JSON.stringify(reopened).slice(0, 200))
  check('displayName persiste tras cerrar/reabrir', reopened.displayName === 'Test User')
  check('bio persiste tras cerrar/reabrir', reopened.bio === 'Amante de la música')
  check('enabled=true persiste tras cerrar/reabrir', reopened.enabled === true)
  await app.close()
}

// ---- 4) restaura el perfil original ----
console.log('[cleanup] restaurando perfil original…')
{
  const { app, win } = await launch()
  const restored = await win.evaluate(async (p) => {
    // set del parche completo — sobrescribe todos los campos editados por el test
    return window.api.profile.set(p)
  }, originalProfile)
  console.log('  perfil restaurado:', JSON.stringify(restored).slice(0, 200))
  check(
    'restauración: displayName vuelve al original',
    (restored.displayName ?? '') === (originalProfile.displayName ?? '')
  )
  check(
    'restauración: bio vuelve al original',
    (restored.bio ?? '') === (originalProfile.bio ?? '')
  )
  check('restauración: enabled vuelve al original', restored.enabled === originalProfile.enabled)
  await app.close()
}

console.log(failures === 0 ? '\nF20 · TODO OK' : `\nF20 · ${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
