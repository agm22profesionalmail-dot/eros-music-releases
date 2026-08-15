/**
 * F22c · Reactividad live — Playwright.
 *
 * Verifica:
 *   1) `window.api.library.onChanged` existe y devuelve una función de
 *      desuscripción (evento IPC `library:changed` cableado).
 *   2) El avatar de la topbar se re-renderiza cuando cambia `photoDataUrl`
 *      del perfil (fix del `<img key>`): guardamos un data URL de prueba,
 *      esperamos 1 s, y comprobamos que el `<img>` empieza por `data:image/png`.
 *
 * SILENCIO ABSOLUTO: minimizamos la ventana inmediatamente tras `firstWindow`
 * y silenciamos cualquier `<audio>` que aparezca — el usuario está jugando.
 *
 * No dispara `playlistCreate` real (no queremos tocar la cuenta): basta con
 * comprobar que el listener está registrado y que el guardado de foto de
 * perfil actualiza la topbar en vivo (mismo mecanismo del store).
 */
import { _electron } from 'playwright'
import { mkdirSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import os from 'os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shots = join(root, 'tests', 'shots', 'f22c')
mkdirSync(shots, { recursive: true })

let failures = 0
const check = (name, cond) => {
  console.log(cond ? `  OK  ${name}` : `  FAIL ${name}`)
  if (!cond) failures++
}

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

const tmpUserData = join(os.tmpdir(), `metrolist-e2e-userdata-f22c-${Date.now()}`)

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

// ---------- Test 1: listener del evento library:changed ----------
const libListenerOk = await win.evaluate(() => {
  if (!window.api?.library?.onChanged) return { ok: false, reason: 'no api' }
  const off = window.api.library.onChanged(() => {})
  const ok = typeof off === 'function'
  try {
    off()
  } catch {
    /* ignora */
  }
  return { ok, reason: ok ? '' : 'onChanged no devuelve función' }
})
check(
  'library.onChanged expuesto y devuelve cleanup',
  libListenerOk.ok
)
if (!libListenerOk.ok) console.log('  motivo:', libListenerOk.reason)

// ---------- Test 2: avatar reactivo ----------
const authState = await win.evaluate(() => window.api.auth.getState())
const signedIn = authState.status === 'signedIn'
console.log(`[session] status=${authState.status}`)

if (!signedIn) {
  console.log('[skip] avatar-reactivo requiere sesión iniciada')
} else {
  // 1x1 PNG rojo (base64)
  const fakePng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='

  const originalProfile = await win.evaluate(() => window.api.profile.get())
  console.log('  perfil original enabled=%s, photo=%s',
    originalProfile.enabled,
    originalProfile.photoDataUrl ? `${originalProfile.photoDataUrl.slice(0, 24)}…` : '(vacía)'
  )

  // Aplica perfil de prueba
  await win.evaluate((data) => {
    return window.api.profile.set({ enabled: true, photoDataUrl: data })
  }, fakePng)
  await win.waitForTimeout(1000)

  // Localiza el <img> DENTRO del segundo .avatar-btn (el del perfil).
  // Nota: el primero es "Ajustes" y no tiene <img>.
  const avatarSrc = await win.evaluate(() => {
    const btns = document.querySelectorAll('.avatar-btn')
    for (const b of btns) {
      const img = b.querySelector('img')
      if (img && img.src.startsWith('data:image/png')) return img.src
    }
    // Fallback: cualquiera con img
    for (const b of btns) {
      const img = b.querySelector('img')
      if (img) return img.src
    }
    return ''
  })
  check(
    'topbar .avatar-btn <img> src empieza por data:image/png tras actualizar perfil',
    avatarSrc.startsWith('data:image/png')
  )
  if (!avatarSrc.startsWith('data:image/png')) {
    console.log('  src actual:', avatarSrc.slice(0, 80) || '(vacío)')
  }
  await win.screenshot({ path: join(shots, '1-avatar-live.png') }).catch(() => undefined)

  // Restaura
  await win.evaluate(
    ({ enabled, photoDataUrl }) =>
      window.api.profile.set({ enabled, photoDataUrl: photoDataUrl ?? '' }),
    { enabled: originalProfile.enabled, photoDataUrl: originalProfile.photoDataUrl }
  )
  await win.waitForTimeout(300)
  console.log('  perfil restaurado')
}

await app.close()
if (mode === 'boot') {
  try {
    rmSync(tmpUserData, { recursive: true, force: true })
  } catch {}
}

console.log(failures === 0 ? '\nF22c · TODO OK' : `\nF22c · ${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
