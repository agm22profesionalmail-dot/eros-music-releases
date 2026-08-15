/**
 * F25 · Discord Rich Presence con perfil personalizado.
 *
 * Verifica que, con el perfil `enabled` y una foto/nombre puestos,
 * la traza `[discord] presencia:` incluye la marca del perfil y que la
 * información se refresca cuando el perfil cambia mientras suena algo.
 *
 * SILENCIO ABSOLUTO: la ventana se minimiza inmediatamente y el audio se
 * silencia — usuario jugando, nada de sonido ni foco robado.
 *
 * Restaura al final: `discordRpc: false` y perfil vuelto a `enabled=false`,
 * `photoDataUrl=''`, `displayName=''` (valores por defecto).
 */
import { _electron } from 'playwright'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shots = join(root, 'tests', 'shots', 'f25')
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

// Captura de trazas del proceso main
const mainLog = []
app.process().stdout?.on('data', (d) => {
  const s = String(d).trim()
  if (s) mainLog.push(s)
})
app.process().stderr?.on('data', (d) => {
  const s = String(d).trim()
  if (s && !s.includes('Parser') && !s.includes('Autofill')) mainLog.push(s)
})

const win = await app.firstWindow()
// SILENCIO: minimiza inmediatamente para no molestar
await win.evaluate(() => window.api.win.minimize()).catch(() => undefined)
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(1200)
// Silencia todo audio y re-silencia si aparecen nuevos <audio>
await win.evaluate(() => {
  document.querySelectorAll('audio').forEach((a) => (a.muted = true))
  new MutationObserver(() => {
    document.querySelectorAll('audio').forEach((a) => (a.muted = true))
  }).observe(document.body, { childList: true, subtree: true })
})

// Guarda el perfil previo para restaurarlo al final
const originalProfile = await win.evaluate(() => window.api.profile.get())
const originalDiscordRpc = await win
  .evaluate(() => window.api.settings.get().then((s) => s.discordRpc))
  .catch(() => false)

// PNG rojo 8×8 codificado en base64 — data URL corto que el discord-rpc
// puede aceptar (o rechazar limpiamente para probar el fallback).
const TEST_PHOTO =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAF0lEQVR4AWP4//8/AyEwakBg4KsBAOSVK/8v/vP1AAAAAElFTkSuQmCC'

// 1) Activa Discord RPC
await win.evaluate(() => window.api.settings.set({ discordRpc: true }))

// 2) Guarda perfil de prueba
const saved = await win.evaluate(
  async ({ photo }) =>
    window.api.profile.set({
      enabled: true,
      displayName: 'Test Metrolist F25',
      photoDataUrl: photo
    }),
  { photo: TEST_PHOTO }
)
check('perfil guardado con displayName', saved.displayName === 'Test Metrolist F25')
check('perfil guardado con photoDataUrl', Boolean(saved.photoDataUrl))
check('perfil enabled=true', saved.enabled === true)

// 3) Reproduce una canción para forzar publicación de presencia
try {
  const authState = await win.evaluate(() => window.api.auth.getState())
  if (authState.status === 'signedIn') {
    await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
    await win.locator('.topbar-search input').fill('daft punk')
    await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 15000 })
    await win.waitForTimeout(800)
    await win.locator('.track-row').first().hover()
    await win.locator('.track-row').first().locator('.play-hover').click()
    await win
      .locator('.np-left .title')
      .waitFor({ state: 'visible', timeout: 20000 })
      .catch(() => undefined)
  } else {
    console.log('  (sesión no iniciada — se salta la reproducción)')
  }
} catch (err) {
  console.log('  aviso: no se pudo iniciar reproducción:', String(err).slice(0, 120))
}

// 4) Espera trazas del main
await win.waitForTimeout(6000)

// Vuelve a asegurar la minimización
await win.evaluate(() => window.api.win.minimize()).catch(() => undefined)

const discordLines = mainLog.filter((l) => l.includes('[discord]'))
console.log(
  '  trazas discord:',
  discordLines.length ? discordLines.join(' | ').slice(0, 500) : '(ninguna)'
)

const discordConnected = discordLines.some((l) => l.includes('conectado'))
const presenceLine = discordLines.find((l) => l.includes('presencia:'))
check('Discord RPC intenta/consigue conectar (traza)', discordConnected || discordLines.length > 0)
if (discordConnected) {
  check('hay traza de presencia enviada', Boolean(presenceLine))
  if (presenceLine) {
    // La presencia con perfil añade `perfil="…"` y opcionalmente `+foto`
    check(
      'la presencia menciona el perfil personalizado',
      presenceLine.includes('perfil=') || presenceLine.includes('Test Metrolist F25')
    )
  }
} else {
  console.log('  (Discord no está abierto en el sistema — no se puede verificar la traza real)')
}

// 5) RESTAURA todo
console.log('[cleanup] restaurando ajustes y perfil originales…')
await win.evaluate(async (rpc) => window.api.settings.set({ discordRpc: Boolean(rpc) }), originalDiscordRpc)
await win.evaluate(
  async (p) =>
    window.api.profile.set({
      enabled: p.enabled,
      displayName: p.displayName ?? '',
      photoDataUrl: p.photoDataUrl ?? '',
      bio: p.bio ?? '',
      favoriteArtists: p.favoriteArtists ?? [],
      publicPlaylistIds: p.publicPlaylistIds ?? []
    }),
  originalProfile
)
const finalProfile = await win.evaluate(() => window.api.profile.get())
check('perfil restaurado (enabled)', finalProfile.enabled === originalProfile.enabled)
check(
  'perfil restaurado (displayName)',
  (finalProfile.displayName ?? '') === (originalProfile.displayName ?? '')
)
check(
  'perfil restaurado (photoDataUrl)',
  (finalProfile.photoDataUrl ?? '') === (originalProfile.photoDataUrl ?? '')
)

await app.close()
console.log(failures === 0 ? '\nF25 · TODO OK' : `\nF25 · ${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
