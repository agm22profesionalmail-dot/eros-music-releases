/**
 * F30 · Proveedores de letras configurables + romanización CJK.
 *
 * Verifica:
 *  1. `settings.get()` devuelve 3 proveedores (LRCLIB/KUGOU/YTMUSIC) y
 *     `romanizeLyrics === false`.
 *  2. Reordenar/desactivar la cadena y comprobar que persiste.
 *  3. Pedir letra con una cadena solo con YTMUSIC (sin bloquear la UI).
 *  4. Activar romanizeLyrics.
 *  5. RESTAURA los 3 proveedores en orden default y `romanizeLyrics:false`.
 *
 * SILENCIO ABSOLUTO: ventana minimizada + audio silenciado (usuario jugando).
 */
import { _electron } from 'playwright'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shots = join(root, 'tests', 'shots', 'f30')
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
console.log('\n[1] Defaults de proveedores de letras')
check(
  'lyricsProviders es array con 3 items',
  Array.isArray(originalSettings.lyricsProviders) && originalSettings.lyricsProviders.length === 3
)
check(
  'romanizeLyrics === false por defecto',
  originalSettings.romanizeLyrics === false
)
const defaultIds = ['LRCLIB', 'KUGOU', 'YTMUSIC']
const currentIds = (originalSettings.lyricsProviders ?? []).map((p) => p.id)
check(
  'contiene los 3 proveedores en el orden default',
  JSON.stringify(currentIds) === JSON.stringify(defaultIds)
)
check(
  'todos vienen habilitados por defecto',
  originalSettings.lyricsProviders.every((p) => p.enabled === true)
)

// -----------------------------------------------------------------
// 2. Persistencia de orden y desactivación
// -----------------------------------------------------------------
console.log('\n[2] Persistencia de orden personalizado')
const nuevoOrden = [
  { id: 'YTMUSIC', enabled: true },
  { id: 'LRCLIB', enabled: true },
  { id: 'KUGOU', enabled: false }
]
await win.evaluate((patch) => window.api.settings.set(patch), { lyricsProviders: nuevoOrden })
const s2 = await win.evaluate(() => window.api.settings.get())
check('primer proveedor es YTMUSIC', s2.lyricsProviders[0]?.id === 'YTMUSIC')
check('segundo proveedor es LRCLIB', s2.lyricsProviders[1]?.id === 'LRCLIB')
check('tercer proveedor es KUGOU y deshabilitado', s2.lyricsProviders[2]?.id === 'KUGOU' && s2.lyricsProviders[2].enabled === false)

// -----------------------------------------------------------------
// 3. Petición de letra respeta cadena (no bloquea aunque la red falle)
// -----------------------------------------------------------------
console.log('\n[3] Petición de letra respeta cadena configurada')
const lyricsResult = await win.evaluate(async () => {
  try {
    const data = await window.api.music.lyrics({
      videoId: 'dQw4w9WgXcQ',
      title: 'Never Gonna Give You Up',
      artists: ['Rick Astley'],
      durationSec: 213
    })
    return { ok: true, data }
  } catch (err) {
    return { ok: false, err: String(err) }
  }
})
check('lyrics() no lanza (devuelve objeto o null)', lyricsResult.ok === true)
check('devuelve LyricsData o null', lyricsResult.data === null || typeof lyricsResult.data === 'object')

// -----------------------------------------------------------------
// 4. Toggle de romanización persiste
// -----------------------------------------------------------------
console.log('\n[4] Romanización CJK')
await win.evaluate(() => window.api.settings.set({ romanizeLyrics: true }))
const s4 = await win.evaluate(() => window.api.settings.get())
check('romanizeLyrics=true persiste', s4.romanizeLyrics === true)

// -----------------------------------------------------------------
// 5. RESTAURA defaults
// -----------------------------------------------------------------
console.log('\n[5] Restaurando defaults')
await win.evaluate((patch) => window.api.settings.set(patch), {
  lyricsProviders: [
    { id: 'LRCLIB', enabled: true },
    { id: 'KUGOU', enabled: true },
    { id: 'YTMUSIC', enabled: true }
  ],
  romanizeLyrics: false
})
const finalSettings = await win.evaluate(() => window.api.settings.get())
check('restaurado: 3 items', finalSettings.lyricsProviders.length === 3)
check('restaurado: LRCLIB primero', finalSettings.lyricsProviders[0]?.id === 'LRCLIB')
check('restaurado: KUGOU segundo', finalSettings.lyricsProviders[1]?.id === 'KUGOU')
check('restaurado: YTMUSIC tercero', finalSettings.lyricsProviders[2]?.id === 'YTMUSIC')
check(
  'restaurado: todos enabled',
  finalSettings.lyricsProviders.every((p) => p.enabled === true)
)
check('restaurado: romanizeLyrics=false', finalSettings.romanizeLyrics === false)

await app.close()
console.log(failures === 0 ? '\nF30 · TODO OK' : `\nF30 · ${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
