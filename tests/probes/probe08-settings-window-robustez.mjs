/**
 * SONDA 8 — Ajustes (tema/acento/EQ/crossfade/velocidad, con restauración),
 * ventana (min/max/restore/resize/cerrar) y robustez (spam next + nav rápida).
 * NO toca: cerrar sesión, cerrar a bandeja, carpeta de descargas (diálogo nativo).
 */
import { launch, waitForSignedIn, shots } from './_lib.mjs'
import { join } from 'path'

const { app, win, rendererLog, mainLog } = await launch()
await win.waitForTimeout(2500)
console.log('AUTH:', JSON.stringify((await waitForSignedIn(win)).status))

const snapshot = await win.evaluate(() => window.api.settings.get())
console.log('settings previos:', JSON.stringify(snapshot))

// ---------- reproducir algo primero ----------
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.locator('.topbar-search input').fill('daft punk discovery')
await win.locator('.page .chip', { hasText: 'Álbumes' }).first().click()
await win.locator('.media-card').first().waitFor({ state: 'visible', timeout: 15000 })
await win.locator('.media-card').first().click()
await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 15000 })
await win.locator('.track-row').nth(0).dblclick()
await win.locator('.np-left .title').waitFor({ state: 'visible', timeout: 30000 })
await win.waitForTimeout(3000)

// ---------- volumen/mute vía UI (la ganancia es WebAudio, el <audio> no cambia) ----------
const volPct = () => win.evaluate(() => document.querySelector('.np-right .volume .slider')?.style.getPropertyValue('--pct'))
console.log('vol pct inicial:', await volPct())
await win.locator('.np-ctrl[aria-label="Silenciar"]').click()
await win.waitForTimeout(300)
const pctMuted = await volPct()
await win.locator('.np-ctrl[aria-label="Silenciar"]').click()
await win.waitForTimeout(300)
console.log(`mute → pct=${pctMuted} (esperado 0%) → unmute pct=${await volPct()}`)

// ---------- AJUSTES ----------
await win.locator('.avatar-btn[title="Ajustes"]').click()
await win.waitForTimeout(1000)
await win.screenshot({ path: join(shots, '08-settings.png') })

// TEMA: probar los tres y verificar cambio real de fondo
const bg = () => win.evaluate(() => ({ attr: document.documentElement.dataset.theme ?? '(ninguno)', bg: getComputedStyle(document.body).backgroundColor, base: getComputedStyle(document.querySelector('.shell')).backgroundColor }))
const themes = await win.evaluate(() => [...document.querySelectorAll('.page .chip')].map((c) => c.textContent).filter((t) => /oscuro|negro|claro/i.test(t ?? '')))
console.log('chips de tema:', JSON.stringify(themes))
for (const t of themes) {
  await win.locator('.page .chip', { hasText: t }).first().click()
  await win.waitForTimeout(600)
  console.log(`tema «${t}» →`, JSON.stringify(await bg()))
  await win.screenshot({ path: join(shots, `08-tema-${t.normalize('NFD').replace(/[^a-zA-Z]/g, '')}.png` ) })
}

// ACENTO
const accents = await win.evaluate(() => [...document.querySelectorAll('.page .chip')].map((c) => c.textContent))
console.log('todos los chips en ajustes:', JSON.stringify(accents.slice(0, 25)))

// VELOCIDAD 1.5x: buscar el range de velocidad (está en la Row cuyo label empieza por "Velocidad")
const setRange = async (labelRe, value) =>
  win.evaluate(
    ([labelRe, value]) => {
      const rows = [...document.querySelectorAll('.page > div, .page div')]
      const row = rows.find((r) => new RegExp(labelRe).test(r.querySelector('span')?.textContent ?? '') && r.querySelector('input[type="range"]'))
      const input = row?.querySelector('input[type="range"]')
      if (!input) return { ok: false }
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(input, String(value))
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return { ok: true, label: row.querySelector('span')?.textContent }
    },
    [labelRe, value]
  )
console.log('set velocidad 1.5:', JSON.stringify(await setRange('^Velocidad', 1.5)))
await win.waitForTimeout(1200)
const rateNow = await win.evaluate(() => [...document.querySelectorAll('audio')].map((a) => a.playbackRate))
const rateLabel = await win.evaluate(() => [...document.querySelectorAll('.page span')].find((s) => /^Velocidad/.test(s.textContent ?? ''))?.textContent)
console.log(`playbackRate en <audio>: ${JSON.stringify(rateNow)} — label: «${rateLabel}» (esperado 1.5)`)

// CROSSFADE a 4 s
console.log('set crossfade 4:', JSON.stringify(await setRange('^Crossfade', 4)))
await win.waitForTimeout(600)
console.log('label crossfade:', await win.evaluate(() => [...document.querySelectorAll('.page span')].find((s) => /^Crossfade/.test(s.textContent ?? ''))?.textContent))

// EQ: mover banda 0 a +6 dB con música sonando
const eqSet = await win.evaluate(() => {
  const inputs = [...document.querySelectorAll('.page input[type="range"]')].filter((i) => i.style.writingMode === 'vertical-lr')
  if (!inputs.length) return { ok: false }
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(inputs[0], '6')
  inputs[0].dispatchEvent(new Event('input', { bubbles: true }))
  return { ok: true, bands: inputs.length }
})
await win.waitForTimeout(800)
console.log('EQ banda 31Hz a +6dB:', JSON.stringify(eqSet), '— errores nuevos:', rendererLog.filter((l) => l.includes('error')).length)
// preset chip (si existe "Plano" u otro) — solo listar
await win.screenshot({ path: join(shots, '08-eq.png') })

// ¿el audio sigue vivo tras EQ/velocidad?
const alive1 = await win.evaluate(() => { const a = [...document.querySelectorAll('audio')].find((x) => !x.paused); return a ? a.currentTime : -1 })
await win.waitForTimeout(2000)
const alive2 = await win.evaluate(() => { const a = [...document.querySelectorAll('audio')].find((x) => !x.paused); return a ? a.currentTime : -1 })
console.log(`audio avanza con EQ+1.5x: ${alive1.toFixed(1)} → ${alive2.toFixed(1)} (delta≈${(alive2 - alive1).toFixed(1)}, con 1.5x debería ser ~3)`)

// RESTAURAR ajustes originales
await win.evaluate((snap) => window.api.settings.set(snap), snapshot)
await win.waitForTimeout(800)
const restored = await win.evaluate(() => window.api.settings.get())
console.log('ajustes restaurados:', JSON.stringify(restored) === JSON.stringify(snapshot) ? 'OK' : `DIFIEREN: ${JSON.stringify(restored)}`)
// nota: la velocidad/EQ del motor se re-aplican desde settings al cambiar; verificar
await win.waitForTimeout(500)
console.log('playbackRate tras restaurar:', await win.evaluate(() => [...document.querySelectorAll('audio')].map((a) => a.playbackRate)))

// ---------- VENTANA ----------
const winState = () => app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0]
  return { min: w.isMinimized(), max: w.isMaximized(), size: w.getSize(), visible: w.isVisible() }
})
console.log('ventana inicial:', JSON.stringify(await winState()))
await win.locator('.titlebar-btn[aria-label="Minimizar"]').click()
await win.waitForTimeout(800)
console.log('tras Minimizar:', JSON.stringify(await winState()))
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore())
await win.waitForTimeout(600)
await win.locator('.titlebar-btn[aria-label="Maximizar"]').click()
await win.waitForTimeout(600)
const maxSt = await winState()
await win.locator('.titlebar-btn[aria-label="Maximizar"]').click()
await win.waitForTimeout(600)
const restSt = await winState()
console.log(`maximizar: ${maxSt.max} → restaurar: ${!restSt.max} (tamaño ${restSt.size})`)

// resize a 900x600 (mínimo declarado)
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 600))
await win.waitForTimeout(800)
const layout = await win.evaluate(() => ({
  bodyOverflowX: document.body.scrollWidth > document.body.clientWidth,
  shellOverflow: document.querySelector('.shell').scrollWidth > document.querySelector('.shell').clientWidth,
  sidebarVisible: Boolean(document.querySelector('.sidebar')?.offsetWidth),
  sidebarW: document.querySelector('.sidebar')?.offsetWidth,
  npVisible: Boolean(document.querySelector('.nowplaying')?.offsetHeight),
  mainW: document.querySelector('.main-view')?.offsetWidth
}))
console.log('layout a 900x600:', JSON.stringify(layout))
await win.screenshot({ path: join(shots, '08-900x600.png') })
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 832))

// ---------- ROBUSTEZ ----------
// spam al botón siguiente x5 midiendo dónde ARRANCA cada pista (bug t=86 detectado antes)
console.log('--- spam siguiente x5:')
for (let i = 0; i < 5; i++) {
  await win.locator('.np-ctrl[aria-label="Siguiente"]').click()
  await win.waitForTimeout(2500)
  const s = await win.evaluate(() => {
    const a = [...document.querySelectorAll('audio')].find((x) => !x.paused) ?? document.querySelector('audio')
    return { t: +(a?.currentTime ?? -1).toFixed(1), dur: +(a?.duration || 0).toFixed(1) }
  })
  const title = await win.locator('.np-left .title').textContent().catch(() => null)
  const flag = s.t > 8 ? '  ← ¡ARRANCA A MITAD!' : ''
  console.log(`  next ${i + 1}: «${title}» t=${s.t}/${s.dur}${flag}`)
}

// nav rápida entre páginas mientras suena
console.log('--- navegación rápida:')
const navSeq = ['Inicio', 'Buscar', 'Inicio', 'Buscar', 'Inicio']
for (const p of navSeq) {
  await win.locator('.sidebar-nav-item', { hasText: p }).click()
  await win.waitForTimeout(250)
}
await win.locator('.sidebar-library-header button.left').click()
await win.waitForTimeout(250)
await win.locator('.sidebar-nav-item', { hasText: 'Inicio' }).click()
await win.waitForTimeout(2000)
const postNav = await win.evaluate(() => ({
  blank: !document.querySelector('.page')?.innerText?.trim(),
  playing: (() => { const a = [...document.querySelectorAll('audio')].find((x) => !x.paused); return Boolean(a) })(),
  shelves: document.querySelectorAll('.main-scroll h2').length
}))
console.log('tras nav rápida:', JSON.stringify(postNav))

// buscar mientras reproduce con tecleo agresivo
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
const input = win.locator('.topbar-search input')
await input.pressSequentially('quevedo bzrp', { delay: 8 })
await win.waitForTimeout(200)
await input.fill('')
await input.pressSequentially('bizarrap', { delay: 15 })
const searchAlive = await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
console.log('búsqueda agresiva mientras suena:', searchAlive)

// errores acumulados de toda la sesión
const errors = rendererLog.filter((l) => l.includes('pageerror') || l.includes('renderer:error'))
console.log('errores del renderer en toda la sonda:', errors.length)
errors.slice(0, 10).forEach((e) => console.log(' ', e.slice(0, 180)))

// ---------- CERRAR con el botón custom (closeToTray debe estar off) ----------
const closeToTray = (await win.evaluate(() => window.api.settings.get())).closeToTray
console.log('closeToTray:', closeToTray)
if (!closeToTray) {
  await win.locator('.titlebar-btn[aria-label="Cerrar"]').click()
  await new Promise((r) => setTimeout(r, 2500))
  console.log('botón Cerrar pulsado — ¿proceso terminó?')
  try {
    await win.evaluate(() => 1)
    console.log('BUG: la ventana sigue viva tras Cerrar')
    await app.close()
  } catch {
    console.log('cierre OK (ventana destruida)')
  }
} else {
  await app.close()
}
console.log('SONDA 8 COMPLETA')
