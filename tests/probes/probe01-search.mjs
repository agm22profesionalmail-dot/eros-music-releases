/**
 * SONDA 1 — Bug prioritario: "la barra de búsqueda no funciona".
 * 1) Verifica sesión iniciada.
 * 2) Llama a window.api.music.search DIRECTAMENTE (aísla main de la UI) y
 *    captura la razón exacta del rechazo si lo hay.
 * 3) Flujo UI real: clic en Buscar, tecleo real, espera de resultados.
 * 4) Chips de filtro, acentos/ñ, cadena vacía, tecleo rápido.
 */
import { launch, waitForSignedIn, shots } from './_lib.mjs'
import { join } from 'path'

const { app, win } = await launch({ label: 'search' })
await win.waitForTimeout(2000)

const auth = await waitForSignedIn(win)
console.log('AUTH:', JSON.stringify(auth))

// ---------- 2) API directa ----------
for (const [q, f] of [
  ['daft punk', 'all'],
  ['daft punk', 'song'],
  ['rosalía motomami', 'all']
]) {
  const r = await win.evaluate(
    async ([q, f]) => {
      const t0 = performance.now()
      try {
        const res = await window.api.music.search(q, f)
        return {
          ok: true,
          ms: Math.round(performance.now() - t0),
          counts: {
            songs: res.songs.length,
            videos: res.videos.length,
            albums: res.albums.length,
            artists: res.artists.length,
            playlists: res.playlists.length,
            top: res.topResult?.title ?? null
          },
          first: res.songs[0] ?? null
        }
      } catch (err) {
        return { ok: false, ms: Math.round(performance.now() - t0), error: String(err?.message ?? err), stack: String(err?.stack ?? '').slice(0, 800) }
      }
    },
    [q, f]
  )
  console.log(`API search("${q}", ${f}) ->`, JSON.stringify(r, null, 2))
}

// suggestions también (por si la UI las usa en el futuro)
const sug = await win.evaluate(async () => {
  try {
    return { ok: true, out: await window.api.music.suggestions('daft pu') }
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e) }
  }
})
console.log('API suggestions ->', JSON.stringify(sug))

// ---------- 3) Flujo UI ----------
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.waitForTimeout(300)
const input = win.locator('.topbar-search input')
console.log('input visible:', await input.isVisible())

// tecleo real, velocidad humana
await input.pressSequentially('daft punk', { delay: 60 })
const gotRows = await win
  .locator('.track-row')
  .first()
  .waitFor({ state: 'visible', timeout: 15000 })
  .then(() => true)
  .catch(() => false)
const rows = await win.locator('.track-row').count()
const cards = await win.locator('.media-card, .card').count()
console.log(`UI "daft punk": filas=${rows} tarjetas=${cards} aparecieron=${gotRows}`)
await win.screenshot({ path: join(shots, '01-search-daftpunk.png') })

// spinner atascado?
console.log('spinner visible tras espera:', await win.locator('.main-scroll .spinner').count())

// ---------- 4) chips de filtro ----------
for (const chip of ['Canciones', 'Vídeos', 'Álbumes', 'Artistas', 'Playlists', 'Todo']) {
  await win.locator('.page .chip', { hasText: chip }).first().click()
  await win.waitForTimeout(2500)
  const nRows = await win.locator('.track-row').count()
  const nCards = await win.locator('.card-grid .card, .media-card').count()
  const spin = await win.locator('.main-scroll .spinner').count()
  console.log(`chip ${chip}: filas=${nRows} tarjetas=${nCards} spinner=${spin}`)
  await win.screenshot({ path: join(shots, `01-chip-${chip.normalize('NFD').replace(/[^a-zA-Z]/g, '')}.png`) })
}

// ---------- acentos / ñ ----------
await input.fill('')
await input.pressSequentially('rosalía motomami', { delay: 40 })
const okAcc = await win
  .locator('.track-row, .card')
  .first()
  .waitFor({ state: 'visible', timeout: 15000 })
  .then(() => true)
  .catch(() => false)
console.log(`UI "rosalía motomami": aparecen=${okAcc} filas=${await win.locator('.track-row').count()}`)
await win.screenshot({ path: join(shots, '01-search-rosalia.png') })

await input.fill('la oreja de van gogh el niño')
await win.waitForTimeout(3500)
console.log(`UI "…ñ…": filas=${await win.locator('.track-row').count()}`)

// ---------- cadena vacía y borrado rápido ----------
await input.fill('')
await win.waitForTimeout(800)
const emptyState = await win.locator('.empty-state').first().textContent().catch(() => null)
console.log('estado vacío tras borrar:', JSON.stringify(emptyState))

// tecleo muy rápido + borrado inmediato (carrera debounce)
await input.pressSequentially('bad bunny', { delay: 5 })
await win.waitForTimeout(120)
await input.fill('')
await win.waitForTimeout(2500)
const rowsAfterClear = await win.locator('.track-row').count()
const emptyAfterClear = await win.locator('.empty-state').count()
console.log(`carrera borrar-rápido: filas=${rowsAfterClear} emptyState=${emptyAfterClear} (esperado: 0 filas, 1 empty)`)
await win.screenshot({ path: join(shots, '01-race-clear.png') })

// tecleo rápido completo
await input.pressSequentially('bad bunny tití me preguntó', { delay: 10 })
const okFast = await win
  .locator('.track-row')
  .first()
  .waitFor({ state: 'visible', timeout: 15000 })
  .then(() => true)
  .catch(() => false)
console.log(`tecleo rápido "bad bunny tití me preguntó": resultados=${okFast} filas=${await win.locator('.track-row').count()}`)
await win.screenshot({ path: join(shots, '01-search-fast.png') })

await app.close()
console.log('SONDA 1 COMPLETA')
