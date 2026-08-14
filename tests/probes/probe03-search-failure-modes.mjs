/**
 * SONDA 3 — Modos de fallo de la búsqueda (lo que ve el usuario cuando el backend falla).
 * a) Red caída (context.setOffline) → ¿qué muestra la UI? ¿se recupera?
 * b) Rechazo del IPC (monkey-patch en runtime, sin tocar src) → ¿feedback al usuario?
 * c) Carrera de respuestas fuera de orden (lenta pisa a rápida).
 * d) elementFromPoint sobre el input (¿algo lo tapa a nivel de hit-testing?).
 */
import { launch, waitForSignedIn, shots } from './_lib.mjs'
import { join } from 'path'

const { app, win } = await launch()
await win.waitForTimeout(2000)
console.log('AUTH:', JSON.stringify(await waitForSignedIn(win)))

await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
const input = win.locator('.topbar-search input')

// ---------- d) ¿algo tapa el input? ----------
const hit = await win.evaluate(() => {
  const el = document.querySelector('.topbar-search input')
  const r = el.getBoundingClientRect()
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  return {
    inputRect: { x: r.x, y: r.y, w: r.width, h: r.height },
    elementOnTop: top?.tagName + '.' + (top?.className ?? ''),
    isInput: top === el,
    appRegion: getComputedStyle(el).webkitAppRegion ?? 'n/d'
  }
})
console.log('hit-test input:', JSON.stringify(hit))

// ---------- a) sin red ----------
const ctx = app.context()
let offlineWorked = true
try {
  await ctx.setOffline(true)
} catch (e) {
  offlineWorked = false
  console.log('setOffline no soportado:', String(e).slice(0, 120))
}
if (offlineWorked) {
  await input.pressSequentially('daft punk', { delay: 40 })
  await win.waitForTimeout(6000)
  const state = await win.evaluate(() => ({
    rows: document.querySelectorAll('.track-row').length,
    cards: document.querySelectorAll('.card').length,
    spinner: document.querySelectorAll('.main-scroll .spinner').length,
    empty: [...document.querySelectorAll('.empty-state')].map((e) => e.textContent),
    pageText: document.querySelector('.page')?.innerText?.slice(0, 300)
  }))
  console.log('UI SIN RED tras 6s:', JSON.stringify(state, null, 2))
  await win.screenshot({ path: join(shots, '03-offline-search.png') })

  // recuperación
  await ctx.setOffline(false)
  await input.fill('')
  await input.pressSequentially('daft punk', { delay: 40 })
  const rec = await win
    .locator('.track-row')
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .then(() => true)
    .catch(() => false)
  console.log('recuperación tras volver la red:', rec)
}

// ---------- b) rechazo del IPC (patch runtime) ----------
await win.evaluate(() => {
  window.__realSearch = window.api.music.search
  window.api.music.search = () => Promise.reject(new Error('SIMULADO: fallo del handler'))
})
await input.fill('')
await input.pressSequentially('rosalía', { delay: 40 })
await win.waitForTimeout(2500)
const failState = await win.evaluate(() => ({
  rows: document.querySelectorAll('.track-row').length,
  spinner: document.querySelectorAll('.main-scroll .spinner').length,
  empty: [...document.querySelectorAll('.empty-state')].map((e) => e.textContent),
  pageText: document.querySelector('.page')?.innerText?.slice(0, 300)
}))
console.log('UI CON RECHAZO:', JSON.stringify(failState, null, 2))
await win.screenshot({ path: join(shots, '03-rejected-search.png') })
await win.evaluate(() => {
  window.api.music.search = window.__realSearch
})

// ---------- c) carrera fuera de orden ----------
// La 1ª petición tarda 4s, la 2ª es normal: si la lenta pisa a la rápida,
// veremos resultados de "daft punk" con "bad bunny" escrito en la caja.
await win.evaluate(() => {
  const real = window.api.music.search
  let n = 0
  window.api.music.search = (q, f) => {
    n++
    if (n === 1) {
      return new Promise((res) => setTimeout(() => real(q, f).then(res), 4000))
    }
    return real(q, f)
  }
})
await input.fill('')
await win.waitForTimeout(500)
await input.fill('daft punk') // petición 1 (lenta, 4s)
await win.waitForTimeout(600)
await input.fill('bad bunny') // petición 2 (rápida)
await win.waitForTimeout(2500)
const fast = await win.evaluate(() => document.querySelector('.track-row .title-text')?.textContent)
await win.waitForTimeout(3500) // deja aterrizar la lenta
const afterSlow = await win.evaluate(() => ({
  boxValue: document.querySelector('.topbar-search input')?.value,
  firstRow: document.querySelector('.track-row .title-text')?.textContent
}))
console.log(`carrera: 1º resultado rápido="${fast}" → tras aterrizar la lenta="${afterSlow.firstRow}" (caja="${afterSlow.boxValue}")`)
if (fast && afterSlow.firstRow && fast !== afterSlow.firstRow) {
  console.log('BUG CONFIRMADO: la respuesta lenta antigua pisa a la nueva')
  await win.screenshot({ path: join(shots, '03-race-stale-overwrite.png') })
}

await app.close()
console.log('SONDA 3 COMPLETA')
