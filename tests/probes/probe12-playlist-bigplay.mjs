/**
 * SONDA 12 — Página de playlist (desde búsqueda, la biblioteca está vacía por bug)
 * y botón grande de reproducir en artista/álbum/playlist.
 */
import { launch, waitForSignedIn, shots } from './_lib.mjs'
import { join } from 'path'

const { app, win } = await launch()
await win.waitForTimeout(2500)
await waitForSignedIn(win)

// playlist desde búsqueda
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.locator('.topbar-search input').fill('daft punk essentials')
await win.locator('.page .chip', { hasText: 'Playlists' }).first().click()
await win.locator('.media-card').first().waitFor({ state: 'visible', timeout: 15000 })
const plTitle = await win.locator('.media-card .title').first().textContent()
await win.locator('.media-card').first().click()
await win.waitForTimeout(4000)
const pl = await win.evaluate(() => ({
  header: document.querySelector('.detail-header h1')?.textContent?.slice(0, 50) ?? null,
  kind: document.querySelector('.detail-header .kind')?.textContent ?? null,
  rows: document.querySelectorAll('.track-row').length,
  bigPlay: Boolean(document.querySelector('.detail-actions .big-play'))
}))
console.log(`playlist «${plTitle}» →`, JSON.stringify(pl))
await win.screenshot({ path: join(shots, '12-playlist.png') })

// botón grande reproducir
if (pl.bigPlay) {
  await win.locator('.detail-actions .big-play').click()
  const ok = await win
    .locator('.np-left .title')
    .waitFor({ state: 'visible', timeout: 30000 })
    .then(() => true)
    .catch(() => false)
  await win.waitForTimeout(4000)
  const t = await win.evaluate(() => { const a = [...document.querySelectorAll('audio')].find((x) => !x.paused); return a ? +a.currentTime.toFixed(1) : -1 })
  console.log(`big-play playlist: reproduce=${ok} «${await win.locator('.np-left .title').textContent().catch(() => null)}» t=${t}`)
}

// artista: big-play
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.locator('.topbar-search input').fill('rosalía')
await win.locator('.page .chip', { hasText: 'Artistas' }).first().click()
await win.locator('.media-card').first().waitFor({ state: 'visible', timeout: 15000 })
await win.locator('.media-card').first().click()
await win.waitForTimeout(3500)
const art = await win.evaluate(() => ({
  header: document.querySelector('.detail-header h1')?.textContent ?? null,
  bigPlay: Boolean(document.querySelector('.detail-actions .big-play'))
}))
console.log('artista:', JSON.stringify(art))
if (art.bigPlay) {
  await win.locator('.detail-actions .big-play').click()
  await win.waitForTimeout(7000)
  const t = await win.evaluate(() => { const a = [...document.querySelectorAll('audio')].find((x) => !x.paused); return a ? +a.currentTime.toFixed(1) : -1 })
  console.log(`big-play artista: «${await win.locator('.np-left .title').textContent().catch(() => null)}» t=${t}`)
  await win.screenshot({ path: join(shots, '12-artist-play.png') })
}

await app.close()
console.log('SONDA 12 COMPLETA')
