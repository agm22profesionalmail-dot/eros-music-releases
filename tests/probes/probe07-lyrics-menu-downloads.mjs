/**
 * SONDA 7 — Letras (sincronizada + instrumental + desfase), menú contextual
 * completo (con el ÚNICO toggle de Me gusta permitido), radio, ir a artista/álbum,
 * y descarga de UNA canción con verificación de reproducción local.
 */
import { launch, waitForSignedIn, shots } from './_lib.mjs'
import { join } from 'path'
import { statSync } from 'fs'

const { app, win } = await launch()
await win.waitForTimeout(2500)
console.log('AUTH:', JSON.stringify((await waitForSignedIn(win)).status))

// ---------- reproducir canción popular ----------
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.locator('.topbar-search input').fill('daft punk get lucky')
await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 15000 })
await win.waitForTimeout(800)
await win.locator('.track-row').first().hover()
await win.locator('.track-row').first().locator('.play-hover').click()
await win.locator('.np-left .title').waitFor({ state: 'visible', timeout: 30000 })
console.log('sonando:', await win.locator('.np-left .title').textContent())
await win.waitForTimeout(3000)

// ---------- LETRAS sincronizadas ----------
await win.locator('.np-right .np-ctrl[aria-label="Letra"]').click()
await win.waitForTimeout(5000)
const lyr1 = await win.evaluate(() => {
  const btns = [...document.querySelectorAll('.page button')].filter((b) => !b.className.includes('chip'))
  const active = btns.findIndex((b) => b.className.includes('active') || getComputedStyle(b).color !== getComputedStyle(btns[0] ?? b).color)
  return { lines: btns.length, text: document.querySelector('.page')?.innerText?.slice(0, 120)?.replace(/\n/g, ' | ') }
})
console.log('letras:', JSON.stringify(lyr1))
await win.screenshot({ path: join(shots, '07-lyrics.png') })

// ¿avanza la línea activa? — comparamos la línea resaltada en dos momentos
const activeLine = () =>
  win.evaluate(() => {
    const btns = [...document.querySelectorAll('.page button')].filter((b) => !b.className.includes('chip'))
    // la línea activa suele tener clase o estilo distinto; usamos scroll position como aproximación
    const marked = btns.findIndex((b) => b.classList.contains('active') || b.getAttribute('aria-current') === 'true')
    return { marked, scrollTop: document.querySelector('.main-scroll')?.scrollTop ?? 0 }
  })
const a1 = await activeLine()
await win.waitForTimeout(8000)
const a2 = await activeLine()
console.log(`línea activa avanza: ${JSON.stringify(a1)} → ${JSON.stringify(a2)}`)

// desfase ±0,5
const offsetText = () => win.evaluate(() => [...document.querySelectorAll('.page span')].find((s) => s.textContent?.includes('Desfase'))?.textContent ?? null)
console.log('desfase inicial:', await offsetText())
const minus = win.locator('.page .chip').filter({ hasText: /−|-0|-\s*0[.,]5|^-$/ }).first()
// los botones son chips con − y + probablemente; probamos por posición
const chips = await win.evaluate(() => [...document.querySelectorAll('.page .chip')].map((c) => c.textContent))
console.log('chips en página letras:', JSON.stringify(chips))
// clic en el chip que contenga '-' o '−'
const chipMinus = win.locator('.page .chip', { hasText: /[-−]/ }).first()
if (await chipMinus.isVisible().catch(() => false)) {
  await chipMinus.click()
  console.log('tras chip −:', await offsetText())
  const chipPlus = win.locator('.page .chip', { hasText: /\+/ }).first()
  await chipPlus.click()
  await chipPlus.click()
  console.log('tras chip + x2:', await offsetText())
  const reset = win.locator('.page .chip', { hasText: /0|Restablecer|reset/i }).first()
  if (await reset.isVisible().catch(() => false)) {
    await reset.click()
    console.log('tras reset:', await offsetText())
  }
}

// ---------- instrumental ----------
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.locator('.topbar-search input').fill('daft punk voyager')
await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 15000 })
await win.waitForTimeout(600)
await win.locator('.track-row').first().hover()
await win.locator('.track-row').first().locator('.play-hover').click()
await win.waitForTimeout(6000)
await win.locator('.np-right .np-ctrl[aria-label="Letra"]').click()
await win.waitForTimeout(6000)
const instr = await win.evaluate(() => ({
  empty: document.querySelector('.page .empty-state')?.textContent ?? null,
  spinner: document.querySelectorAll('.page .spinner').length,
  text: document.querySelector('.page')?.innerText?.slice(0, 150)?.replace(/\n/g, ' | ')
}))
console.log('letra instrumental (Voyager):', JSON.stringify(instr))
await win.screenshot({ path: join(shots, '07-lyrics-instrumental.png') })

// ---------- MENÚ CONTEXTUAL completo ----------
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.locator('.topbar-search input').fill('rosalía despechá')
await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 15000 })
await win.waitForTimeout(800)

// submenu "Añadir a playlist" (SOLO listar, no clicar)
await win.locator('.track-row').nth(1).click({ button: 'right' })
await win.waitForTimeout(400)
await win.locator('.context-menu button', { hasText: 'Añadir a playlist' }).hover()
await win.waitForTimeout(700)
const submenu = await win.evaluate(() => {
  const menus = [...document.querySelectorAll('.context-menu')]
  const sub = menus[menus.length - 1]
  return menus.length > 1 ? [...sub.querySelectorAll('button')].map((b) => b.textContent) : null
})
console.log('submenú Añadir a playlist:', JSON.stringify(submenu))
await win.screenshot({ path: join(shots, '07-submenu-playlist.png') })
await win.keyboard.press('Escape')
await win.waitForTimeout(300)

// Ir al álbum
await win.locator('.track-row').nth(1).click({ button: 'right' })
await win.waitForTimeout(300)
const hasGoAlbum = await win.locator('.context-menu button', { hasText: 'Ir al álbum' }).isVisible().catch(() => false)
if (hasGoAlbum) {
  await win.locator('.context-menu button', { hasText: 'Ir al álbum' }).click()
  await win.waitForTimeout(3000)
  console.log('Ir al álbum →', await win.evaluate(() => document.querySelector('.detail-header h1')?.textContent ?? '(sin cabecera)'))
} else {
  console.log('Ir al álbum: no visible en este item')
  await win.keyboard.press('Escape')
}

// Ir al artista
await win.locator('.nav-circle[aria-label="Atrás"]').click()
await win.waitForTimeout(1500)
await win.locator('.track-row').nth(1).click({ button: 'right' })
await win.waitForTimeout(300)
const goArtist = win.locator('.context-menu button', { hasText: /Ir a / }).first()
if (await goArtist.isVisible().catch(() => false)) {
  const label = await goArtist.textContent()
  await goArtist.click()
  await win.waitForTimeout(3000)
  console.log(`«${label}» →`, await win.evaluate(() => document.querySelector('.detail-header h1')?.textContent ?? '(sin cabecera)'))
} else {
  console.log('Ir a artista: NO aparece')
  await win.keyboard.press('Escape')
}

// Iniciar radio
await win.locator('.nav-circle[aria-label="Atrás"]').click()
await win.waitForTimeout(1200)
await win.locator('.track-row').nth(2).click({ button: 'right' })
const radioTitle = await win.locator('.track-row').nth(2).locator('.title-text').textContent()
await win.locator('.context-menu button', { hasText: 'Iniciar radio' }).click()
await win.waitForTimeout(8000)
await win.locator('.np-ctrl[aria-label="Cola"]').click()
await win.waitForTimeout(600)
const radioQueue = await win.evaluate(() => document.querySelectorAll('.queue-panel .library-row').length)
console.log(`Iniciar radio con «${radioTitle}»: cola=${radioQueue} elementos, sonando «${await win.locator('.np-left .title').textContent()}»`)
await win.locator('.np-ctrl[aria-label="Cola"]').click()

// ---------- ME GUSTA: toggle único permitido (corazón barra inferior) ----------
const heart = win.locator('.np-left .icon-btn')
const likedBefore = await win.evaluate(() => document.querySelector('.np-left .icon-btn')?.className.includes('accent'))
await heart.click()
await win.waitForTimeout(2500)
const likedAfter = await win.evaluate(() => document.querySelector('.np-left .icon-btn')?.className.includes('accent'))
await win.screenshot({ path: join(shots, '07-like-on.png') })
await heart.click() // revertir inmediatamente
await win.waitForTimeout(2500)
const likedFinal = await win.evaluate(() => document.querySelector('.np-left .icon-btn')?.className.includes('accent'))
console.log(`Me gusta toggle: antes=${likedBefore} → tras like=${likedAfter} → tras revertir=${likedFinal} (esperado false/true/false)`)

// ---------- DESCARGA de una canción ----------
const dlBefore = await win.evaluate(() => window.api.downloads.list())
console.log('descargas existentes:', dlBefore.length, dlBefore.map((d) => d.track?.title))

await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.locator('.topbar-search input').fill('daft punk around the world radio edit')
await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 15000 })
await win.waitForTimeout(800)
const dlTitle = await win.locator('.track-row').first().locator('.title-text').textContent()
await win.locator('.track-row').first().click({ button: 'right' })
await win.locator('.context-menu button', { hasText: 'Descargar' }).click()
console.log(`descargando «${dlTitle}»…`)
let newDl = null
for (let i = 0; i < 90 && !newDl; i++) {
  await win.waitForTimeout(1000)
  const list = await win.evaluate(() => window.api.downloads.list())
  newDl = list.find((d) => !dlBefore.some((b) => b.track?.videoId === d.track?.videoId)) ?? null
}
if (newDl) {
  const size = statSync(newDl.filePath).size
  console.log(`descarga OK: ${newDl.filePath} (${(size / 1e6).toFixed(1)} MB)`)
  // aparece en Biblioteca → Descargas
  await win.locator('.sidebar-library-header button.left').click()
  await win.waitForTimeout(1500)
  await win.locator('.page .chip', { hasText: 'Descargas' }).first().click()
  await win.waitForTimeout(1500)
  const dlRows = await win.evaluate(() => [...document.querySelectorAll('.track-row .title-text')].map((t) => t.textContent))
  console.log('Biblioteca→Descargas:', JSON.stringify(dlRows))
  await win.screenshot({ path: join(shots, '07-downloads.png') })
  // reproducir la descargada: ¿el prepare sigue yendo a la red?
  const vid = newDl.track.videoId
  const prep = await win.evaluate(async (v) => {
    const t0 = performance.now()
    const p = await window.api.player.prepare(v)
    return { via: p.via, ms: Math.round(performance.now() - t0) }
  }, vid)
  console.log(`prepare(descargada) → via=${prep.via} en ${prep.ms}ms (si via es red y tarda, no usa el fichero local para resolver)`)
  const row = win.locator('.track-row', { hasText: dlTitle.slice(0, 18) }).first()
  await row.dblclick()
  await win.waitForTimeout(5000)
  console.log('reproduciendo descargada:', await win.locator('.np-left .title').textContent())
} else {
  console.log('BUG: la descarga no se registró en 90s')
}

await app.close()
console.log('SONDA 7 COMPLETA')
