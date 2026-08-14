/**
 * SONDA 5 — Diagnóstico biblioteca (caché vs red) + Home con selectores buenos
 * + detalle playlist/álbum/artista + atrás/adelante + página Tu biblioteca.
 */
import { launch, waitForSignedIn, shots } from './_lib.mjs'
import { join } from 'path'

const { app, win } = await launch()
await win.waitForTimeout(2500)
console.log('AUTH:', JSON.stringify((await waitForSignedIn(win)).status))

// ---------- BIBLIOTECA: API directa ----------
const libCached = await win.evaluate(async () => {
  const r = await window.api.music.library()
  return {
    fromCache: r.fromCache,
    updatedAt: new Date(r.updatedAt).toISOString(),
    playlists: r.playlists.length,
    albums: r.albums.length,
    artists: r.artists.length,
    songs: r.songs.length,
    firstPl: r.playlists[0]?.title ?? null
  }
})
console.log('library() cacheada:', JSON.stringify(libCached))

const libFresh = await win.evaluate(async () => {
  try {
    const r = await window.api.library.refresh()
    return {
      ok: true,
      playlists: r.playlists.length,
      albums: r.albums.length,
      artists: r.artists.length,
      songs: r.songs.length,
      names: r.playlists.slice(0, 10).map((p) => p.title)
    }
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e) }
  }
})
console.log('library.refresh() de red:', JSON.stringify(libFresh, null, 1))

// ¿el sidebar refleja el refresco? (el store del renderer no se entera del refresh de fondo)
await win.waitForTimeout(1500)
const sidebarNow = await win.evaluate(() => ({
  rows: document.querySelectorAll('.sidebar-library-list .library-row').length,
  titles: [...document.querySelectorAll('.sidebar-library-list .library-row .title')].map((t) => t.textContent).slice(0, 8)
}))
console.log('sidebar tras refresh():', JSON.stringify(sidebarNow))
await win.screenshot({ path: join(shots, '05-sidebar.png') })

// ---------- HOME con .media-card ----------
await win.locator('.sidebar-nav-item', { hasText: 'Inicio' }).click()
await win.waitForTimeout(3000)
const home = await win.evaluate(() => ({
  shelves: [...document.querySelectorAll('.main-scroll h2')].map((h) => h.textContent).slice(0, 12),
  mediaCards: document.querySelectorAll('.media-card').length,
  perShelf: [...document.querySelectorAll('.shelf, .card-grid')].map((s) => s.querySelectorAll('.media-card').length)
}))
console.log('HOME:', JSON.stringify(home, null, 1))
await win.screenshot({ path: join(shots, '05-home.png') })

// hover-play en la primera tarjeta
const firstCard = win.locator('.media-card').first()
const cardTitle = await firstCard.locator('.title').first().textContent().catch(() => '?')
await firstCard.hover()
await win.waitForTimeout(300)
const hoverBtn = firstCard.locator('.hover-play')
const hoverVisible = await hoverBtn.isVisible().catch(() => false)
console.log(`hover-play visible («${cardTitle}»):`, hoverVisible)
if (hoverVisible) {
  await hoverBtn.click()
  const ok = await win
    .locator('.np-left .title')
    .waitFor({ state: 'visible', timeout: 30000 })
    .then(() => true)
    .catch(() => false)
  console.log('hover-play reproduce:', ok, '->', await win.locator('.np-left .title').textContent().catch(() => null))
  await win.screenshot({ path: join(shots, '05-hoverplay.png') })
}

// ---------- navegar con tarjeta del home ----------
await win.locator('.sidebar-nav-item', { hasText: 'Inicio' }).click()
await win.waitForTimeout(1500)
// una tarjeta no-canción (álbum/playlist) para navegar: las canciones no navegan
const navCard = await win.evaluate(() => {
  const cards = [...document.querySelectorAll('.media-card')]
  const c = cards.find((el) => !el.classList.contains('artist'))
  c?.scrollIntoView()
  return c?.querySelector('.title')?.textContent ?? null
})
await win.locator('.media-card').first().click()
await win.waitForTimeout(2500)
const detail1 = await win.evaluate(() => ({
  url: location.hash || '(sin hash)',
  h1: document.querySelector('.page h1')?.textContent?.slice(0, 60) ?? null,
  rows: document.querySelectorAll('.track-row').length,
  text: document.querySelector('.page')?.innerText?.slice(0, 100)?.replace(/\n/g, ' | ')
}))
console.log(`clic tarjeta home «${navCard}» →`, JSON.stringify(detail1))
await win.screenshot({ path: join(shots, '05-card-nav.png') })

// ---------- playlist propia ----------
const plCount = await win.locator('.sidebar-library-list .library-row').count()
if (plCount > 0) {
  await win.locator('.sidebar-filters .chip', { hasText: 'Playlists' }).first().click()
  await win.waitForTimeout(300)
  const plName = await win.locator('.sidebar-library-list .library-row .title').first().textContent().catch(() => null)
  await win.locator('.sidebar-library-list .library-row').first().click()
  await win.waitForTimeout(3500)
  const pl = await win.evaluate(() => ({
    h1: document.querySelector('.page h1')?.textContent?.slice(0, 60) ?? null,
    rows: document.querySelectorAll('.track-row').length,
    text: document.querySelector('.page')?.innerText?.slice(0, 130)?.replace(/\n/g, ' | ')
  }))
  console.log(`playlist propia «${plName}»:`, JSON.stringify(pl))
  await win.screenshot({ path: join(shots, '05-own-playlist.png') })
} else {
  console.log('SIN playlists en sidebar — no puedo probar detalle de playlist propia')
}

// ---------- artista y álbum ----------
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.locator('.topbar-search input').fill('daft punk')
await win.locator('.page .chip', { hasText: 'Artistas' }).first().click()
await win.locator('.media-card').first().waitFor({ state: 'visible', timeout: 15000 })
await win.locator('.media-card').first().click()
await win.waitForTimeout(3500)
const artist = await win.evaluate(() => ({
  h1: document.querySelector('.page h1')?.textContent?.slice(0, 50) ?? null,
  shelves: [...document.querySelectorAll('.page h2')].map((h) => h.textContent).slice(0, 8),
  rows: document.querySelectorAll('.track-row').length,
  cards: document.querySelectorAll('.media-card').length,
  playBtn: [...document.querySelectorAll('.page button')].some((b) => /reproducir/i.test(b.textContent ?? '') || b.className.includes('play'))
}))
console.log('ARTISTA:', JSON.stringify(artist, null, 1))
await win.screenshot({ path: join(shots, '05-artist.png') })

// botón reproducir del artista si existe
const artistPlay = win.locator('.page .play-big, .page button.btn-primary').first()
if (await artistPlay.isVisible().catch(() => false)) {
  await artistPlay.click()
  await win.waitForTimeout(7000)
  console.log('play artista →', await win.locator('.np-left .title').textContent().catch(() => null))
}

await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.locator('.topbar-search input').fill('random access memories daft punk')
await win.locator('.page .chip', { hasText: 'Álbumes' }).first().click()
await win.locator('.media-card').first().waitFor({ state: 'visible', timeout: 15000 })
await win.locator('.media-card').first().click()
await win.waitForTimeout(3500)
const album = await win.evaluate(() => ({
  h1: document.querySelector('.page h1')?.textContent?.slice(0, 60) ?? null,
  rows: document.querySelectorAll('.track-row').length
}))
console.log('ÁLBUM:', JSON.stringify(album))
await win.screenshot({ path: join(shots, '05-album.png') })

// ---------- atrás / adelante ----------
const state = () => win.evaluate(() => document.querySelector('.page h1')?.textContent ?? document.querySelector('.page')?.innerText?.slice(0, 40)?.replace(/\n/g, '|'))
await win.locator('.nav-circle[aria-label="Atrás"]').click()
await win.waitForTimeout(1500)
console.log('atrás →', await state())
await win.locator('.nav-circle[aria-label="Atrás"]').click()
await win.waitForTimeout(1500)
console.log('atrás →', await state())
await win.locator('.nav-circle[aria-label="Adelante"]').click()
await win.waitForTimeout(1500)
console.log('adelante →', await state())

// ---------- página Tu biblioteca ----------
await win.locator('.sidebar-library-header button.left').click()
await win.waitForTimeout(2500)
const libPage = await win.evaluate(() => ({
  h1: document.querySelector('.page h1')?.textContent ?? null,
  chips: [...document.querySelectorAll('.page .chip')].map((c) => c.textContent)
}))
console.log('Tu biblioteca:', JSON.stringify(libPage))
for (const tab of ['Playlists', 'Álbumes', 'Artistas', 'Canciones', 'Historial', 'Descargas']) {
  const chip = win.locator('.page .chip', { hasText: tab }).first()
  if (!(await chip.isVisible().catch(() => false))) {
    console.log(`  pestaña ${tab}: NO EXISTE`)
    continue
  }
  await chip.click()
  await win.waitForTimeout(2500)
  const st = await win.evaluate(() => ({
    rows: document.querySelectorAll('.track-row').length,
    cards: document.querySelectorAll('.media-card').length,
    empty: document.querySelector('.page .empty-state')?.textContent?.slice(0, 60) ?? null
  }))
  console.log(`  pestaña ${tab}:`, JSON.stringify(st))
  await win.screenshot({ path: join(shots, `05-lib-${tab.normalize('NFD').replace(/[^a-zA-Z]/g, '')}.png` ) })
}

await app.close()
console.log('SONDA 5 COMPLETA')
