/**
 * F43 · Búsqueda resiliente: música:search NUNCA debe propagar un TypeError
 * al renderer.
 *
 * Reproducción original: al escribir "Galantis" en el buscador aparecía
 *   "La búsqueda falló: Error invoking remote method 'music:search':
 *    TypeError: Cannot read properties of undefined (reading 'url')".
 *
 * Estrategia: escribe varias queries reales (incluida la que rompía) y una
 * garbage query. Después de cada `fill`, esperamos y comprobamos que la
 * banda `.error-banner` NO existe en la página.
 *
 * SILENCIO ABSOLUTO: ventana minimizada + audio silenciado.
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
  env: { ...process.env, EROS_E2E: '1' }
})

const win = await app.firstWindow()
// SILENCIO: minimiza inmediatamente para que la ventana no robe foco.
await win.evaluate(() => window.api?.win?.minimize?.()).catch(() => undefined)
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(1500)

// Silencia todo <audio> (existente y futuro) para no reventar los altavoces
// si un carrusel dispara un preview automático.
await win.evaluate(() => {
  const mute = () => document.querySelectorAll('audio').forEach((a) => (a.muted = true))
  mute()
  new MutationObserver(mute).observe(document.body, { childList: true, subtree: true })
})

// Navega a Buscar. En E2E la sidebar tiene los items con .sidebar-nav-item.
// El texto puede ser "Buscar" (es) o "Search" (en).
try {
  const buscar = win.locator('.sidebar-nav-item', { hasText: /Buscar|Search/ }).first()
  await buscar.click({ timeout: 5000 })
} catch (err) {
  console.log('  (no se pudo clicar Buscar en la sidebar:', String(err?.message ?? err), ')')
}
await win.waitForTimeout(600)

const authState = await win.evaluate(() => window.api.auth.getState())
if (authState.status !== 'signedIn') {
  console.log('\n(sesión no iniciada — el test verifica igualmente que no hay banda roja)')
}

// Queries: la que reventaba + varias reales + basura para ver que ni así
// aparece la banda de error.
const queries = ['Galantis', 'daft punk', 'aurora', 'xxx-improbable-query-123', '$$$']

console.log('\n[1] Cada búsqueda no debe generar .error-banner')

for (const q of queries) {
  const input = win.locator('.topbar-search input').first()
  await input.fill('')
  await win.waitForTimeout(100)
  await input.fill(q)
  // La búsqueda va con debounce/petición de red; damos margen.
  await win.waitForTimeout(2000)
  const banners = await win.locator('.error-banner').count()
  check(`query "${q}" no muestra banda de error`, banners === 0)
  if (banners > 0) {
    const txt = await win.locator('.error-banner').first().innerText().catch(() => '')
    console.log(`       texto de la banda: ${txt}`)
  }
}

// Prueba directa por IPC: si el handler estuviera roto, aquí sí lo veríamos
// como excepción — verificamos que devuelve la forma de SearchResults incluso
// cuando la red falla o el parser da problemas.
console.log('\n[2] IPC music:search devuelve forma válida sin lanzar')
for (const q of queries) {
  try {
    const res = await win.evaluate((query) => window.api.music.search(query, 'all'), q)
    const hasShape =
      res &&
      typeof res === 'object' &&
      Array.isArray(res.songs) &&
      Array.isArray(res.videos) &&
      Array.isArray(res.albums) &&
      Array.isArray(res.artists) &&
      Array.isArray(res.playlists)
    check(`IPC "${q}" devuelve SearchResults`, hasShape)
  } catch (err) {
    check(`IPC "${q}" no lanza`, false)
    console.log(`       error: ${String(err?.message ?? err)}`)
  }
}

await app.close()
console.log(failures === 0 ? '\nF43 · TODO OK' : `\nF43 · ${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
