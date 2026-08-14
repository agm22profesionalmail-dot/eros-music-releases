/**
 * SONDA 4 — Home (estanterías personalizadas), Sidebar/Biblioteca,
 * páginas de detalle (playlist propia, álbum, artista) y atrás/adelante.
 */
import { launch, waitForSignedIn, shots } from './_lib.mjs'
import { join } from 'path'

const { app, win } = await launch()
await win.waitForTimeout(2500)
console.log('AUTH:', JSON.stringify(await waitForSignedIn(win)))

// ---------- HOME ----------
await win.locator('.sidebar-nav-item', { hasText: 'Inicio' }).click()
await win.waitForTimeout(400)
const shelvesOk = await win
  .locator('.shelf, h2')
  .first()
  .waitFor({ state: 'visible', timeout: 25000 })
  .then(() => true)
  .catch(() => false)
await win.waitForTimeout(1500)
const home = await win.evaluate(() => ({
  shelves: [...document.querySelectorAll('.main-scroll h2')].map((h) => h.textContent).slice(0, 12),
  cards: document.querySelectorAll('.card').length,
  spinners: document.querySelectorAll('.main-scroll .spinner').length,
  skeletons: document.querySelectorAll('.main-scroll .skeleton').length
}))
console.log('HOME:', shelvesOk, JSON.stringify(home, null, 1))
await win.screenshot({ path: join(shots, '04-home.png') })

// ---------- SIDEBAR / BIBLIOTECA ----------
const sidebar = await win.evaluate(() => ({
  rows: [...document.querySelectorAll('.sidebar-library-list .library-row .title')].map((t) => t.textContent).slice(0, 15),
  total: document.querySelectorAll('.sidebar-library-list .library-row').length,
  skeletons: document.querySelectorAll('.sidebar-library-list .skeleton').length
}))
console.log('SIDEBAR:', JSON.stringify(sidebar, null, 1))

// filtros del sidebar
for (const f of ['Playlists', 'Álbumes', 'Artistas', 'Todo']) {
  await win.locator('.sidebar-filters .chip', { hasText: f }).first().click()
  await win.waitForTimeout(300)
  const n = await win.locator('.sidebar-library-list .library-row').count()
  console.log(`  filtro sidebar ${f}: ${n} filas`)
}

// ---------- HOVER-PLAY de una tarjeta del Home ----------
const firstCard = win.locator('.card').first()
const cardTitle = await firstCard.locator('.card-title, .title').first().textContent().catch(() => '?')
await firstCard.hover()
await win.waitForTimeout(400)
const playBtn = firstCard.locator('.card-play, .play-hover, button[aria-label*="eproducir"]').first()
const hasPlayBtn = await playBtn.isVisible().catch(() => false)
console.log(`hover-play visible en tarjeta «${cardTitle}»:`, hasPlayBtn)
if (hasPlayBtn) {
  await playBtn.click()
  const played = await win
    .locator('.np-left .title')
    .waitFor({ state: 'visible', timeout: 25000 })
    .then(() => true)
    .catch(() => false)
  console.log('hover-play reproduce:', played, '->', await win.locator('.np-left .title').textContent().catch(() => null))
  await win.screenshot({ path: join(shots, '04-hoverplay.png') })
}

// ---------- NAVEGACIÓN de tarjetas del Home ----------
await win.locator('.sidebar-nav-item', { hasText: 'Inicio' }).click()
await win.waitForTimeout(1200)
const clicked = await win.evaluate(() => {
  const card = document.querySelector('.card')
  const t = card?.querySelector('.card-title, .title')?.textContent
  return t
})
await win.locator('.card').first().click()
await win.waitForTimeout(2500)
const detail1 = await win.evaluate(() => ({
  h1: document.querySelector('.main-scroll h1, .detail-title, .page h1')?.textContent?.slice(0, 60) ?? null,
  rows: document.querySelectorAll('.track-row').length,
  pageStart: document.querySelector('.page')?.innerText?.slice(0, 120)
}))
console.log(`clic tarjeta home «${clicked}» →`, JSON.stringify(detail1))
await win.screenshot({ path: join(shots, '04-card-detail.png') })

// ---------- PLAYLIST PROPIA del sidebar ----------
await win.locator('.sidebar-filters .chip', { hasText: 'Playlists' }).first().click()
await win.waitForTimeout(300)
const plName = await win.locator('.sidebar-library-list .library-row .title').first().textContent().catch(() => null)
await win.locator('.sidebar-library-list .library-row').first().click()
await win.waitForTimeout(3000)
const plDetail = await win.evaluate(() => ({
  title: document.querySelector('.main-scroll h1, .page h1')?.textContent?.slice(0, 60) ?? null,
  rows: document.querySelectorAll('.track-row').length,
  hasPlayBtn: Boolean(document.querySelector('.btn-primary, .play-big, button[aria-label="Reproducir"]')),
  text: document.querySelector('.page')?.innerText?.slice(0, 160)
}))
console.log(`playlist propia «${plName}» →`, JSON.stringify(plDetail, null, 1))
await win.screenshot({ path: join(shots, '04-own-playlist.png') })

// ---------- ARTISTA (desde búsqueda para tener id fiable) ----------
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.locator('.topbar-search input').fill('daft punk')
await win.locator('.page .chip', { hasText: 'Artistas' }).first().click()
await win.locator('.card').first().waitFor({ state: 'visible', timeout: 15000 })
await win.locator('.card').first().click()
await win.waitForTimeout(3000)
const artistDetail = await win.evaluate(() => ({
  name: document.querySelector('.main-scroll h1, .page h1')?.textContent?.slice(0, 60) ?? null,
  shelves: [...document.querySelectorAll('.main-scroll h2')].map((h) => h.textContent).slice(0, 8),
  rows: document.querySelectorAll('.track-row').length,
  cards: document.querySelectorAll('.card').length
}))
console.log('ARTISTA:', JSON.stringify(artistDetail, null, 1))
await win.screenshot({ path: join(shots, '04-artist.png') })

// botón grande de reproducir del artista
const bigPlay = win.locator('.page button.btn-primary, .play-big, .page button[aria-label="Reproducir"]').first()
if (await bigPlay.isVisible().catch(() => false)) {
  await bigPlay.click()
  await win.waitForTimeout(6000)
  console.log('play artista →', await win.locator('.np-left .title').textContent().catch(() => null))
}

// ---------- ÁLBUM ----------
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.locator('.topbar-search input').fill('random access memories')
await win.locator('.page .chip', { hasText: 'Álbumes' }).first().click()
await win.locator('.card').first().waitFor({ state: 'visible', timeout: 15000 })
await win.locator('.card').first().click()
await win.waitForTimeout(3000)
const albumDetail = await win.evaluate(() => ({
  title: document.querySelector('.main-scroll h1, .page h1')?.textContent?.slice(0, 60) ?? null,
  rows: document.querySelectorAll('.track-row').length,
  text: document.querySelector('.page')?.innerText?.slice(0, 140)
}))
console.log('ÁLBUM:', JSON.stringify(albumDetail, null, 1))
await win.screenshot({ path: join(shots, '04-album.png') })

// ---------- ATRÁS / ADELANTE ----------
const nav = async (label) => {
  await win.locator(`.nav-circle[aria-label="${label}"]`).click()
  await win.waitForTimeout(1200)
  return win.evaluate(() => document.querySelector('.page')?.innerText?.slice(0, 60)?.replace(/\n/g, ' | '))
}
console.log('atrás →', await nav('Atrás'))
console.log('atrás →', await nav('Atrás'))
console.log('adelante →', await nav('Adelante'))
const backDisabled = await win.locator('.nav-circle[aria-label="Atrás"]').isDisabled()
console.log('estado botones: atrás disabled =', backDisabled)

// ---------- BIBLIOTECA completa (página) ----------
await win.locator('.sidebar-library-header button.left').click()
await win.waitForTimeout(2000)
const tabs = await win.evaluate(() => [...document.querySelectorAll('.page .chip, .page [role="tab"], .page button')].map((b) => b.textContent).slice(0, 14))
console.log('pestañas de Tu biblioteca:', JSON.stringify(tabs))
for (const tab of ['Playlists', 'Álbumes', 'Artistas', 'Canciones', 'Historial', 'Descargas']) {
  const chip = win.locator('.page .chip, .page button', { hasText: tab }).first()
  if (!(await chip.isVisible().catch(() => false))) {
    console.log(`  pestaña ${tab}: NO EXISTE`)
    continue
  }
  await chip.click()
  await win.waitForTimeout(2500)
  const st = await win.evaluate(() => ({
    rows: document.querySelectorAll('.track-row').length,
    cards: document.querySelectorAll('.card').length,
    libRows: document.querySelectorAll('.page .library-row').length,
    empty: document.querySelector('.page .empty-state')?.textContent ?? null
  }))
  console.log(`  pestaña ${tab}:`, JSON.stringify(st))
  await win.screenshot({ path: join(shots, `04-lib-${tab.normalize('NFD').replace(/[^a-zA-Z]/g, '')}.png` ) })
}

await app.close()
console.log('SONDA 4 COMPLETA')
