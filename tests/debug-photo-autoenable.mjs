/**
 * Verifica que subir una foto (sin tocar el interruptor "Usar perfil
 * personalizado") activa `enabled` automáticamente y el icono de la
 * topbar (siempre visible) refleja la foto nueva.
 */
import { _electron } from 'playwright'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const photoPath =
  'C:\\Users\\Zero\\AppData\\Local\\Temp\\claude\\F--\\5c36d9e6-ea16-4e82-b9de-5d3f440a4e8e\\scratchpad\\test-photo.png'

let failures = 0
const check = (name, cond) => {
  console.log(cond ? `  OK  ${name}` : `  FAIL ${name}`)
  if (!cond) failures++
}

const app = await _electron.launch({
  args: ['.'],
  cwd: root,
  env: { ...process.env, EROS_E2E: '1' }
})
const win = await app.firstWindow()
win.on('console', (msg) => {
  if (msg.type() === 'error') console.log('[renderer:error]', msg.text().slice(0, 300))
})
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(1200)
await win.evaluate(() => document.querySelectorAll('audio').forEach((a) => (a.muted = true)))

// Snapshot EXACTO del perfil real actual (no tocar nada de esto salvo para
// restaurarlo al final tal cual).
const original = await win.evaluate(() => window.api.profile.get())
console.log('perfil real actual: enabled=%s photoLen=%d name=%s', original.enabled, (original.photoDataUrl || '').length, original.displayName)

const avatars = win.locator('.avatar-btn')
await avatars.nth(1).click()
await win.waitForTimeout(400)

// NO tocamos el checkbox — solo subimos la foto, como haría el usuario real.
const fileInput = win.locator('.profile-page input[type=file]')
await win.getByRole('button', { name: 'Cambiar foto' }).click()
await fileInput.setInputFiles(photoPath)
await win.waitForTimeout(1200)

const stored = await win.evaluate(() => window.api.profile.get())
check('enabled se activó solo al subir la foto', stored.enabled === true)
check('photoDataUrl se guardó', (stored.photoDataUrl || '').length > 0)

const toggleChecked = await win.locator('.profile-row input[type=checkbox]').first().isChecked()
check('el checkbox en pantalla también aparece marcado', toggleChecked === true)

const topbarAvatarLen = await win.evaluate(() => {
  const btns = document.querySelectorAll('.topbar-right .avatar-btn img')
  return btns.length ? (btns[0].getAttribute('src')?.length ?? -1) : -1
})
check(
  `icono pequeño de topbar refleja la foto nueva (len=${topbarAvatarLen} vs stored=${(stored.photoDataUrl || '').length})`,
  topbarAvatarLen === (stored.photoDataUrl || '').length
)

await win.screenshot({ path: join(root, 'tests', 'shots', 'debug-photo-autoenable.png') })

// Restaura EXACTAMENTE el perfil real que había antes de este test.
await win.evaluate((p) => window.api.profile.set(p), original)
const restored = await win.evaluate(() => window.api.profile.get())
check('perfil real restaurado sin pérdidas', JSON.stringify(restored) === JSON.stringify(original))

await app.close()
console.log(failures === 0 ? '\nTODO OK' : `\n${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
