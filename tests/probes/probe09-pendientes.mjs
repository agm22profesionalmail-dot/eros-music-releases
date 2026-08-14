/**
 * SONDA 9 — Flecos: temas (paneles), clic en tarjeta-canción del Home,
 * Iniciar radio, Me gusta (único toggle permitido), descarga + reproducción local,
 * spam next con crossfade=0 real, resolver-al-arrancar.
 */
import { launch, waitForSignedIn, shots } from './_lib.mjs'
import { join } from 'path'
import { statSync } from 'fs'

const { app, win, mainLog } = await launch()
await win.waitForTimeout(2500)
console.log('AUTH:', JSON.stringify((await waitForSignedIn(win)).status))

// resolver al arrancar (sin tocar nada): ¿descargas reanudándose?
await win.waitForTimeout(4000)
const bootResolver = mainLog.filter((l) => l.includes('[resolver]')).length
const dls = await win.evaluate(() => window.api.downloads.list())
console.log(`resolver-lines al arrancar: ${bootResolver}; descargas registradas: ${dls.length}`, JSON.stringify(dls.map((d) => d.track?.title)))

// ---------- TEMAS: fondo de paneles (--bg-base) ----------
await win.locator('.avatar-btn[title="Ajustes"]').click()
await win.waitForTimeout(800)
const panelBg = () => win.evaluate(() => ({
  attr: document.documentElement.dataset.theme,
  sidebar: getComputedStyle(document.querySelector('.sidebar')).backgroundColor,
  main: getComputedStyle(document.querySelector('.main-view')).backgroundColor
}))
const themeSnapshot = (await win.evaluate(() => window.api.settings.get())).theme
for (const t of ['Oscuro', 'Negro', 'Claro']) {
  await win.locator('.page .chip', { hasText: t }).first().click()
  await win.waitForTimeout(500)
  console.log(`tema «${t}» paneles →`, JSON.stringify(await panelBg()))
}
// restaurar tema original vía UI
const themeLabel = { dark: 'Oscuro', black: 'Negro', light: 'Claro' }[themeSnapshot] ?? 'Oscuro'
await win.locator('.page .chip', { hasText: themeLabel }).first().click()
await win.waitForTimeout(400)
console.log('tema restaurado a', themeLabel)

// ---------- HOME: clic en tarjeta de canción = ¿reproduce? ----------
await win.locator('.sidebar-nav-item', { hasText: 'Inicio' }).click()
await win.locator('.media-card').first().waitFor({ state: 'visible', timeout: 25000 })
await win.waitForTimeout(1000)
const songCardTitle = await win.locator('.media-card').first().locator('.title').textContent()
await win.locator('.media-card').first().click()
const cardPlays = await win
  .locator('.np-left .title')
  .waitFor({ state: 'visible', timeout: 30000 })
  .then(() => true)
  .catch(() => false)
console.log(`clic en tarjeta-canción «${songCardTitle}» reproduce:`, cardPlays, '→', await win.locator('.np-left .title').textContent().catch(() => null))

// ---------- Iniciar radio ----------
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.locator('.topbar-search input').fill('rosalía despechá')
await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 15000 })
await win.waitForTimeout(800)
const radioSeed = await win.locator('.track-row').nth(0).locator('.title-text').textContent()
await win.locator('.track-row').nth(0).click({ button: 'right' })
await win.locator('.context-menu button', { hasText: 'Iniciar radio' }).click()
await win.waitForTimeout(9000)
await win.locator('.np-ctrl[aria-label="Cola"]').click()
await win.waitForTimeout(700)
const radioQ = await win.evaluate(() => ({
  total: document.querySelectorAll('.queue-panel .library-row').length,
  first: document.querySelector('.queue-panel .library-row .title')?.textContent
}))
console.log(`Iniciar radio «${radioSeed}»: cola=${radioQ.total}, sonando «${await win.locator('.np-left .title').textContent().catch(() => null)}»`)
await win.screenshot({ path: join(shots, '09-radio.png') })

// ---------- Ir al artista (desde menú contextual) ----------
await win.locator('.track-row').nth(1).click({ button: 'right' })
await win.waitForTimeout(400)
const menuBtns = await win.evaluate(() => [...document.querySelectorAll('.context-menu button')].map((b) => b.textContent))
const goA = menuBtns.find((m) => /^Ir a (?!l álbum)/.test(m ?? ''))
if (goA) {
  await win.locator('.context-menu button', { hasText: goA }).click()
  await win.waitForTimeout(3500)
  console.log(`«${goA}» → cabecera: «${await win.evaluate(() => document.querySelector('.detail-header h1')?.textContent ?? null)}»`)
} else {
  console.log('menú sin «Ir a <artista>»:', JSON.stringify(menuBtns))
  await win.keyboard.press('Escape')
}

// ---------- ME GUSTA (único toggle permitido) ----------
const heartClass = () => win.evaluate(() => document.querySelector('.np-left .icon-btn')?.className ?? '')
const before = (await heartClass()).includes('accent')
await win.locator('.np-left .icon-btn').click()
await win.waitForTimeout(2500)
const afterLike = (await heartClass()).includes('accent')
await win.screenshot({ path: join(shots, '09-like.png') })
await win.locator('.np-left .icon-btn').click()
await win.waitForTimeout(2500)
const afterRevert = (await heartClass()).includes('accent')
console.log(`Me gusta: ${before} → ${afterLike} → ${afterRevert} (esperado false→true→false)`)
const likeErrors = mainLog.filter((l) => /rate|like/i.test(l) && /error/i.test(l))
console.log('errores de like en main:', likeErrors.length)

// ---------- DESCARGA ----------
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
  newDl = list.find((d) => !dls.some((b) => b.track?.videoId === d.track?.videoId)) ?? null
}
if (!newDl) {
  console.log('BUG: descarga no registrada en 90s')
} else {
  const size = statSync(newDl.filePath).size
  console.log(`descarga OK: ${newDl.filePath} (${(size / 1e6).toFixed(1)} MB)`)
  await win.locator('.sidebar-library-header button.left').click()
  await win.waitForTimeout(1500)
  await win.locator('.page .chip', { hasText: 'Descargas' }).first().click()
  await win.waitForTimeout(1500)
  const rows = await win.evaluate(() => [...document.querySelectorAll('.track-row .title-text')].map((t) => t.textContent))
  console.log('Biblioteca→Descargas:', JSON.stringify(rows))
  await win.screenshot({ path: join(shots, '09-downloads.png') })

  const resolverBefore = mainLog.filter((l) => l.includes('[resolver]')).length
  const prep = await win.evaluate(async (v) => {
    const t0 = performance.now()
    const p = await window.api.player.prepare(v)
    return { via: p.via, ms: Math.round(performance.now() - t0) }
  }, newDl.track.videoId)
  const resolverAfter = mainLog.filter((l) => l.includes('[resolver]')).length
  console.log(`prepare(descargada): via=${prep.via}, ${prep.ms}ms, resolver-lines nuevas=${resolverAfter - resolverBefore} (0 = usa local, >0 = fue a la red)`)

  const target = win.locator('.track-row', { hasText: (dlTitle ?? '').slice(0, 16) }).first()
  await target.dblclick()
  await win.waitForTimeout(6000)
  const playingDl = await win.locator('.np-left .title').textContent().catch(() => null)
  const t = await win.evaluate(() => { const a = [...document.querySelectorAll('audio')].find((x) => !x.paused); return a?.currentTime ?? -1 })
  console.log(`reproduciendo descargada: «${playingDl}» t=${t.toFixed(1)}`)
}

// ---------- SPAM NEXT con crossfade=0 real (arranque limpio del motor) ----------
console.log('--- spam next (crossfade 0):')
for (let i = 0; i < 6; i++) {
  await win.locator('.np-ctrl[aria-label="Siguiente"]').click()
  await win.waitForTimeout(400)
}
await win.waitForTimeout(6000)
const endState = await win.evaluate(() => {
  const a = [...document.querySelectorAll('audio')].find((x) => !x.paused)
  return { playing: Boolean(a), t: a ? +a.currentTime.toFixed(1) : -1 }
})
console.log('tras 6 next rápidos + 6s:', JSON.stringify(endState), '→', await win.locator('.np-left .title').textContent().catch(() => null))
if (!endState.playing) {
  await win.screenshot({ path: join(shots, '09-spamnext-stopped.png') })
  // ¿se recupera con play?
  await win.locator('.np-play').click()
  await win.waitForTimeout(3000)
  const rec = await win.evaluate(() => { const a = [...document.querySelectorAll('audio')].find((x) => !x.paused); return Boolean(a) })
  console.log('recupera con botón play:', rec)
}

const errCount = mainLog.filter((l) => l.includes('[main:err]') && !l.includes('YOUTUBEJS') && !l.includes('Debugger')).length
console.log('errores main (no-parser):', errCount)

await app.close()
console.log('SONDA 9 COMPLETA')
