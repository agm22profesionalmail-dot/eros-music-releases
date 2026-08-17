import { _electron } from 'playwright'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const photoPath =
  'C:\\Users\\Zero\\AppData\\Local\\Temp\\claude\\F--\\5c36d9e6-ea16-4e82-b9de-5d3f440a4e8e\\scratchpad\\test-photo.png'

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

const original = await win.evaluate(() => window.api.profile.get())
console.log('original:', JSON.stringify(original))

const avatars = win.locator('.avatar-btn')
await avatars.nth(1).click()
await win.waitForTimeout(400)

// Activa el interruptor "usar perfil personalizado"
const toggle = win.locator('.profile-row input[type=checkbox]').first()
if (!(await toggle.isChecked())) await toggle.check()
await win.waitForTimeout(500)

// Sube la foto
const fileInput = win.locator('.profile-page input[type=file]')
await win.getByRole('button', { name: 'Cambiar foto' }).click()
await fileInput.setInputFiles(photoPath)
await win.waitForTimeout(1200)

const stored = await win.evaluate(() => window.api.profile.get())
console.log('stored enabled:', stored.enabled, 'photo len:', (stored.photoDataUrl || '').length)

const profileAvatarLen = await win.evaluate(
  () => document.querySelector('.profile-avatar img')?.getAttribute('src')?.length ?? -1
)
const topbarAvatarLen = await win.evaluate(() => {
  const btns = document.querySelectorAll('.topbar-right .avatar-btn img')
  return btns.length ? (btns[0].getAttribute('src')?.length ?? -1) : -1
})
console.log('profile page avatar len:', profileAvatarLen)
console.log('topbar avatar len:', topbarAvatarLen)

await win.screenshot({ path: join(root, 'tests', 'shots', 'debug-topbar-after.png') })

// restaura
await win.evaluate((p) => window.api.profile.set(p), original)
await app.close()
