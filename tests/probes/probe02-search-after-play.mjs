/**
 * SONDA 2 — ¿Se rompe la búsqueda tras reproducir (rebuild de sesión con PoToken)?
 * + martilleo de queries raras buscando rechazos intermitentes.
 */
import { launch, waitForSignedIn, shots } from './_lib.mjs'
import { join } from 'path'

const { app, win } = await launch()
await win.waitForTimeout(2000)
console.log('AUTH:', JSON.stringify(await waitForSignedIn(win)))

const apiSearch = async (q, f = 'all') =>
  win.evaluate(
    async ([q, f]) => {
      const t0 = performance.now()
      try {
        const r = await window.api.music.search(q, f)
        return {
          ok: true,
          ms: Math.round(performance.now() - t0),
          n: r.songs.length + r.videos.length + r.albums.length + r.artists.length + r.playlists.length
        }
      } catch (e) {
        return { ok: false, ms: Math.round(performance.now() - t0), error: String(e?.message ?? e) }
      }
    },
    [q, f]
  )

// --- 1. búsqueda ANTES de reproducir
console.log('antes de reproducir:', JSON.stringify(await apiSearch('daft punk')))

// --- 2. reproducir una pista (UI real)
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.locator('.topbar-search input').fill('daft punk get lucky')
await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 15000 })
await win.waitForTimeout(800)
await win.locator('.track-row').first().hover()
await win.locator('.track-row').first().locator('.play-hover').click()
const loaded = await win
  .locator('.np-left .title')
  .waitFor({ state: 'visible', timeout: 25000 })
  .then(() => true)
  .catch(() => false)
console.log('pista cargada en barra:', loaded, '->', await win.locator('.np-left .title').textContent().catch(() => null))
await win.waitForTimeout(4000)
const t1 = await win.evaluate(() => Math.max(...[...document.querySelectorAll('audio')].map((a) => a.currentTime), 0))
console.log('audio t =', t1.toFixed(1))
await win.screenshot({ path: join(shots, '02-playing.png') })

// --- 3. búsquedas DESPUÉS de reproducir (sesión reconstruida con PoToken)
for (const q of ['bad bunny', 'rosalía', 'the weeknd']) {
  console.log(`después de reproducir "${q}":`, JSON.stringify(await apiSearch(q)))
}

// --- 3b. UI: buscar mientras suena
const input = win.locator('.topbar-search input')
await input.fill('')
await input.pressSequentially('bad bunny', { delay: 50 })
const uiOk = await win
  .locator('.track-row')
  .first()
  .waitFor({ state: 'visible', timeout: 15000 })
  .then(() => true)
  .catch(() => false)
console.log('UI buscar mientras suena:', uiOk, 'filas=', await win.locator('.track-row').count())
await win.screenshot({ path: join(shots, '02-search-while-playing.png') })

// --- 4. martilleo: queries raras y repetidas
const weird = [
  'a', '  ', 'ñ', '😀🎵', 'AC/DC', 'sigur rós ágætis byrjun', '"comillas"', 'C.Tangana',
  'x'.repeat(120), 'daft punk', 'daft punk', 'daft punk', 'motomami', 'quevedo quédate',
  '<script>alert(1)</script>', "pa' que", '50%', 'daft+punk&x=1'
]
let failures = 0
for (const q of weird) {
  const r = await apiSearch(q)
  if (!r.ok) {
    failures++
    console.log(`FALLO search("${q}"):`, JSON.stringify(r))
  } else if (r.n === 0) {
    console.log(`vacío search("${q}") (${r.ms}ms)`)
  }
}
console.log(`martilleo: ${weird.length} queries, ${failures} rechazos`)

// --- 5. ráfaga concurrente (10 a la vez, como tecleo sin debounce)
const burst = await win.evaluate(async () => {
  const qs = ['d', 'da', 'daf', 'daft', 'daft ', 'daft p', 'daft pu', 'daft pun', 'daft punk', 'daft punk ']
  const results = await Promise.allSettled(qs.map((q) => window.api.music.search(q, 'all')))
  return results.map((r, i) => ({
    q: qs[i],
    ok: r.status === 'fulfilled',
    err: r.status === 'rejected' ? String(r.reason?.message ?? r.reason).slice(0, 200) : undefined
  }))
})
console.log('ráfaga concurrente:', JSON.stringify(burst.filter((b) => !b.ok)), '— fallos de', burst.length)

await app.close()
console.log('SONDA 2 COMPLETA')
