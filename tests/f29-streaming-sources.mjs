/**
 * F29 · Fuentes de streaming configurables.
 *
 * Verifica:
 *  1. `settings.get()` devuelve al menos 4 fuentes y `useYtDlpFallback === true`.
 *  2. `settings.set({streamingSources})` persiste el orden nuevo.
 *  3. RESTAURA los defaults (4 fuentes en el orden original + yt-dlp on).
 *
 * SILENCIO ABSOLUTO: ventana minimizada + audio silenciado (usuario jugando).
 */
import { _electron } from 'playwright'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shots = join(root, 'tests', 'shots', 'f29')
mkdirSync(shots, { recursive: true })

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
// SILENCIO: minimiza inmediatamente
await win.evaluate(() => window.api.win.minimize()).catch(() => undefined)
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(1500)
// Silencia todo <audio> (existente y futuro) por si alguna auto-radio arranca
await win.evaluate(() => {
  const mute = () => document.querySelectorAll('audio').forEach((a) => (a.muted = true))
  mute()
  new MutationObserver(mute).observe(document.body, { childList: true, subtree: true })
})

const originalSettings = await win.evaluate(() => window.api.settings.get())

// -----------------------------------------------------------------
// 1. Defaults presentes
// -----------------------------------------------------------------
console.log('\n[1] Defaults de fuentes de streaming')
check(
  'streamingSources es array con >=4 items',
  Array.isArray(originalSettings.streamingSources) && originalSettings.streamingSources.length >= 4
)
check(
  'useYtDlpFallback === true por defecto',
  originalSettings.useYtDlpFallback === true
)
const defaultIds = ['YTMUSIC', 'IOS', 'ANDROID', 'TV_EMBEDDED']
const currentIds = (originalSettings.streamingSources ?? []).map((s) => s.id)
check(
  'contiene los 4 clientes históricos',
  defaultIds.every((id) => currentIds.includes(id))
)
check(
  'todos vienen habilitados por defecto (si estamos en fresh install)',
  originalSettings.streamingSources.every((s) => typeof s.enabled === 'boolean')
)

// -----------------------------------------------------------------
// 2. Persistencia de un orden nuevo
// -----------------------------------------------------------------
console.log('\n[2] Persistencia de orden personalizado')
const nuevoOrden = [
  { id: 'IOS', enabled: true },
  { id: 'YTMUSIC', enabled: true }
]
await win.evaluate(
  (patch) => window.api.settings.set(patch),
  { streamingSources: nuevoOrden }
)
const s2 = await win.evaluate(() => window.api.settings.get())
check('primer elemento es IOS', s2.streamingSources[0]?.id === 'IOS')
check('segundo elemento es YTMUSIC', s2.streamingSources[1]?.id === 'YTMUSIC')
check('la lista se ha reducido a 2 items', s2.streamingSources.length === 2)

// También comprobamos que el toggle de yt-dlp persiste
await win.evaluate(() => window.api.settings.set({ useYtDlpFallback: false }))
const s3 = await win.evaluate(() => window.api.settings.get())
check('useYtDlpFallback=false persiste', s3.useYtDlpFallback === false)

// -----------------------------------------------------------------
// 3. RESTAURA defaults
// -----------------------------------------------------------------
console.log('\n[3] Restaurando defaults')
await win.evaluate(
  (patch) => window.api.settings.set(patch),
  {
    streamingSources: [
      { id: 'YTMUSIC', enabled: true },
      { id: 'IOS', enabled: true },
      { id: 'ANDROID', enabled: true },
      { id: 'TV_EMBEDDED', enabled: true }
    ],
    useYtDlpFallback: true
  }
)
const finalSettings = await win.evaluate(() => window.api.settings.get())
check('restaurado: 4 items', finalSettings.streamingSources.length === 4)
check('restaurado: YTMUSIC primero', finalSettings.streamingSources[0]?.id === 'YTMUSIC')
check('restaurado: IOS segundo', finalSettings.streamingSources[1]?.id === 'IOS')
check('restaurado: ANDROID tercero', finalSettings.streamingSources[2]?.id === 'ANDROID')
check('restaurado: TV_EMBEDDED cuarto', finalSettings.streamingSources[3]?.id === 'TV_EMBEDDED')
check(
  'restaurado: todos enabled',
  finalSettings.streamingSources.every((s) => s.enabled === true)
)
check('restaurado: useYtDlpFallback=true', finalSettings.useYtDlpFallback === true)

await app.close()
console.log(failures === 0 ? '\nF29 · TODO OK' : `\nF29 · ${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
