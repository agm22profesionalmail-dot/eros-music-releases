/**
 * SONDA 11 — Letra sincronizada: ¿la línea activa avanza y hace autoscroll?
 * ¿Clicar una línea busca ese punto del audio?
 */
import { launch, waitForSignedIn, shots } from './_lib.mjs'
import { join } from 'path'

const { app, win } = await launch()
await win.waitForTimeout(2500)
await waitForSignedIn(win)

await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.locator('.topbar-search input').fill('daft punk get lucky')
await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 15000 })
await win.waitForTimeout(800)
await win.locator('.track-row').first().hover()
await win.locator('.track-row').first().locator('.play-hover').click()
await win.locator('.np-left .title').waitFor({ state: 'visible', timeout: 30000 })
await win.waitForTimeout(3000)

// seek a 65s (ya con letra cantada)
await win.evaluate(() => {
  const a = [...document.querySelectorAll('audio')].find((x) => !x.paused)
  if (a) a.currentTime = 65
})
await win.locator('.np-right .np-ctrl[aria-label="Letra"]').click()
await win.waitForTimeout(4000)

const lineState = () =>
  win.evaluate(() => {
    const btns = [...document.querySelectorAll('.page button')].filter((b) => !b.classList.contains('chip'))
    if (!btns.length) return null
    const colors = btns.map((b) => getComputedStyle(b).color)
    const freq = {}
    colors.forEach((c) => (freq[c] = (freq[c] ?? 0) + 1))
    const rare = Object.entries(freq).sort((a, b) => a[1] - b[1])[0]?.[0]
    const idx = colors.findIndex((c) => c === rare && freq[rare] < btns.length / 2)
    return { total: btns.length, activeIdx: idx, scrollTop: Math.round(document.querySelector('.main-scroll')?.scrollTop ?? 0), text: idx >= 0 ? btns[idx].textContent?.slice(0, 40) : null }
  })

const s1 = await lineState()
console.log('estado 1 (t≈69s):', JSON.stringify(s1))
await win.waitForTimeout(12000)
const s2 = await lineState()
console.log('estado 2 (t≈81s):', JSON.stringify(s2))
console.log(`línea activa avanza: ${s2?.activeIdx > s1?.activeIdx}, autoscroll: ${s2?.scrollTop !== s1?.scrollTop || s1?.scrollTop > 0}`)
await win.screenshot({ path: join(shots, '11-lyrics-sync.png') })

// clic en una línea concreta → seek
const target = 30
const lineSeek = await win.evaluate((n) => {
  const btns = [...document.querySelectorAll('.page button')].filter((b) => !b.classList.contains('chip'))
  btns[n]?.click()
  return btns[n]?.textContent?.slice(0, 40)
}, target)
await win.waitForTimeout(1500)
const tAfter = await win.evaluate(() => {
  const a = [...document.querySelectorAll('audio')].find((x) => !x.paused)
  return a ? +a.currentTime.toFixed(1) : -1
})
console.log(`clic línea ${target} («${lineSeek}») → audio t=${tAfter}`)
const s3 = await lineState()
console.log('línea activa tras clic:', JSON.stringify(s3))

await app.close()
console.log('SONDA 11 COMPLETA')
