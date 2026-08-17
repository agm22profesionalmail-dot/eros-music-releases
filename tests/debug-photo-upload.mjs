/**
 * Debug dirigido: reproduce el flujo REAL de usuario para "Cambiar foto"
 * en la página de Perfil — clic en el botón, seleccionar un archivo con
 * el <input type=file> oculto, y comprobar que el avatar se actualiza.
 * A diferencia de f22c-reactivity.mjs, esto NO usa window.api.profile.set
 * directamente: pasa por onFileChange -> readAndResize -> FileReader/canvas.
 */
import { _electron } from 'playwright'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const photoPath = 'C:\\Users\\Zero\\AppData\\Local\\Temp\\claude\\F--\\5c36d9e6-ea16-4e82-b9de-5d3f440a4e8e\\scratchpad\\test-photo.png'

const app = await _electron.launch({
  args: ['.'],
  cwd: root,
  env: { ...process.env, EROS_E2E: '1' }
})
app.process().stderr?.on('data', (d) => {
  const s = String(d).trim()
  if (s) console.log('[main:err]', s.slice(0, 300))
})
const win = await app.firstWindow()
win.on('console', (msg) => {
  console.log(`[renderer:${msg.type()}]`, msg.text().slice(0, 300))
})
win.on('pageerror', (err) => console.log('[renderer:pageerror]', err.message))
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(1500)
await win.evaluate(() => {
  document.querySelectorAll('audio').forEach((a) => (a.muted = true))
})

const authState = await win.evaluate(() => window.api.auth.getState())
console.log('auth state:', authState.status)
if (authState.status !== 'signedIn') {
  console.log('No hay sesión iniciada, no puedo llegar a Perfil. Abortando.')
  await app.close()
  process.exit(1)
}

const originalProfile = await win.evaluate(() => window.api.profile.get())
console.log('perfil original photo len:', (originalProfile.photoDataUrl || '').length)

// Navega a Perfil vía el segundo .avatar-btn (topbar)
const avatars = win.locator('.avatar-btn')
await avatars.nth(1).click()
await win.waitForTimeout(500)
console.log('en /perfil:', await win.locator('.profile-page h1').first().isVisible())

// Clic en "Cambiar foto" y sube el archivo real por el input oculto
const fileInput = win.locator('.profile-page input[type=file]')
await win.getByRole('button', { name: 'Cambiar foto' }).click()
await fileInput.setInputFiles(photoPath)

// Espera al procesamiento (readAndResize + update + flashSaved)
await win.waitForTimeout(1500)

const photoErr = await win.locator('.profile-page .error-banner').count()
if (photoErr > 0) {
  console.log('ERROR mostrado en UI:', await win.locator('.profile-page .error-banner').innerText())
}

const afterProfile = await win.evaluate(() => window.api.profile.get())
console.log('perfil tras subir photo len:', (afterProfile.photoDataUrl || '').length)
console.log('cambio detectado en backend:', afterProfile.photoDataUrl !== originalProfile.photoDataUrl)

const avatarImgSrcLen = await win.evaluate(() => {
  const img = document.querySelector('.profile-avatar img')
  return img ? img.getAttribute('src')?.length ?? -1 : -1
})
console.log('avatar <img src> len en DOM:', avatarImgSrcLen)

await win.screenshot({ path: join(root, 'tests', 'shots', 'debug-photo-after.png') })

// Limpieza: restaura el perfil original
await win.evaluate((p) => window.api.profile.set(p), originalProfile)

await app.close()
