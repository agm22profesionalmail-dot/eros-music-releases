/**
 * SONDA 6 — Reproducción completa: dblclick, play/pausa, next/prev, seek,
 * volumen/mute, aleatorio, repetición, cola (panel + menú contextual),
 * transición automática (gapless) y autoplay/radio al agotar cola.
 */
import { launch, waitForSignedIn, shots } from './_lib.mjs'
import { join } from 'path'

const { app, win } = await launch()
await win.waitForTimeout(2500)
console.log('AUTH:', JSON.stringify((await waitForSignedIn(win)).status))

const audioState = () =>
  win.evaluate(() => {
    const audios = [...document.querySelectorAll('audio')]
    const a = audios.find((x) => !x.paused) ?? audios[0]
    return a
      ? { t: +a.currentTime.toFixed(1), dur: +(a.duration || 0).toFixed(1), paused: a.paused, vol: +a.volume.toFixed(2), rate: a.playbackRate, muted: a.muted, n: audios.length }
      : { none: true }
  })
const barTitle = () => win.locator('.np-left .title').textContent().catch(() => null)

// ---------- reproducir un álbum (cola multi-pista) ----------
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.locator('.topbar-search input').fill('daft punk discovery')
await win.locator('.page .chip', { hasText: 'Álbumes' }).first().click()
await win.locator('.media-card').first().waitFor({ state: 'visible', timeout: 15000 })
await win.locator('.media-card').first().click()
await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 15000 })

// DOBLE CLIC en pista 1
await win.locator('.track-row').nth(0).dblclick()
const started = await win
  .locator('.np-left .title')
  .waitFor({ state: 'visible', timeout: 30000 })
  .then(() => true)
  .catch(() => false)
await win.waitForTimeout(5000)
let st = await audioState()
console.log('dblclick reproduce:', started, await barTitle(), JSON.stringify(st))

// ---------- play/pausa ----------
await win.locator('.np-play').click()
await win.waitForTimeout(800)
const paused = (await audioState()).paused
await win.locator('.np-play').click()
await win.waitForTimeout(800)
const resumed = !(await audioState()).paused
console.log(`pausa: ${paused} / reanuda: ${resumed}`)

// ---------- siguiente / anterior ----------
const t1title = await barTitle()
await win.locator('.np-ctrl[aria-label="Siguiente"]').click()
await win.waitForTimeout(6000)
const t2title = await barTitle()
console.log(`siguiente: «${t1title}» → «${t2title}» (cambió=${t1title !== t2title})`, JSON.stringify(await audioState()))
// anterior con <3s → pista anterior; espera a que pasen >3s para probar reinicio
await win.waitForTimeout(4000)
await win.locator('.np-ctrl[aria-label="Anterior"]').click()
await win.waitForTimeout(1500)
const afterPrev = await audioState()
console.log(`anterior (>3s reproducidos) reinicia: t=${afterPrev.t} (esperado ~0), título sigue «${await barTitle()}»`)
await win.locator('.np-ctrl[aria-label="Anterior"]').click()
await win.waitForTimeout(5000)
console.log(`anterior x2 (<3s): vuelve a «${await barTitle()}» (esperado «${t1title}»)`)

// ---------- seek arrastrando la barra a la mitad ----------
const slider = win.locator('.np-progress .slider')
const box = await slider.boundingBox()
await win.mouse.move(box.x + 5, box.y + box.height / 2)
await win.mouse.down()
await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 })
await win.mouse.up()
await win.waitForTimeout(2500)
st = await audioState()
const midOk = st.dur > 0 && Math.abs(st.t - st.dur / 2) < st.dur * 0.12
console.log(`seek a mitad: t=${st.t}/${st.dur} (~50%? ${midOk}) paused=${st.paused}`)
await win.waitForTimeout(2000)
const st2 = await audioState()
console.log(`audio sigue tras seek: ${st2.t > st.t}`)
await win.screenshot({ path: join(shots, '06-seek.png') })

// ---------- volumen y mute ----------
const volSlider = win.locator('.np-right .volume .slider')
const vb = await volSlider.boundingBox()
await win.mouse.click(vb.x + vb.width * 0.3, vb.y + vb.height / 2)
await win.waitForTimeout(500)
console.log('volumen al 30%:', JSON.stringify(await audioState()))
await win.locator('.np-ctrl[aria-label="Silenciar"]').click()
await win.waitForTimeout(400)
const mutedSt = await audioState()
await win.locator('.np-ctrl[aria-label="Silenciar"]').click()
await win.waitForTimeout(400)
const unmutedSt = await audioState()
console.log(`mute: vol=${mutedSt.vol} → unmute: vol=${unmutedSt.vol}`)

// ---------- aleatorio ----------
await win.locator('.np-ctrl[aria-label="Aleatorio"]').click()
await win.waitForTimeout(400)
const shuffleActive = await win.locator('.np-ctrl[aria-label="Aleatorio"].active').count()
await win.locator('.np-ctrl[aria-label="Aleatorio"]').click()
console.log('aleatorio toggle visual:', shuffleActive === 1)

// ---------- repetición off→all→one→off ----------
for (let i = 0; i < 3; i++) {
  await win.locator('.np-ctrl[aria-label="Repetir"]').click()
  await win.waitForTimeout(250)
  const active = await win.locator('.np-ctrl[aria-label="Repetir"].active').count()
  console.log(`repetir ciclo ${i + 1}: activo=${active === 1}`)
}

// ---------- COLA: panel ----------
await win.locator('.np-ctrl[aria-label="Cola"]').click()
await win.waitForTimeout(600)
const queueSt = await win.evaluate(() => ({
  panel: Boolean(document.querySelector('.queue-panel')),
  playing: document.querySelector('.queue-panel .library-row.active .title')?.textContent ?? null,
  upcoming: [...document.querySelectorAll('.queue-panel .library-row:not(.active) .title')].slice(0, 5).map((t) => t.textContent)
}))
console.log('panel cola:', JSON.stringify(queueSt, null, 1))
await win.screenshot({ path: join(shots, '06-queue.png') })

// ---------- menú contextual: Siguiente en la cola / Añadir a la cola ----------
const row3 = win.locator('.track-row').nth(3)
const targetTitle = await row3.locator('.title-text').textContent()
await row3.click({ button: 'right' })
await win.waitForTimeout(400)
const menuItems = await win.evaluate(() => [...document.querySelectorAll('.context-menu button')].map((b) => b.textContent))
console.log('menú contextual pista:', JSON.stringify(menuItems))
await win.screenshot({ path: join(shots, '06-context-menu.png') })
await win.locator('.context-menu button', { hasText: 'Siguiente en la cola' }).click()
await win.waitForTimeout(600)
const nextInQueue = await win.evaluate(() => document.querySelectorAll('.queue-panel .library-row')[1]?.querySelector('.title')?.textContent)
console.log(`«Siguiente en la cola» con «${targetTitle}» → 2º en panel: «${nextInQueue}» (ok=${nextInQueue === targetTitle})`)

const row5 = win.locator('.track-row').nth(5)
const lastTitle = await row5.locator('.title-text').textContent()
await row5.click({ button: 'right' })
await win.locator('.context-menu button', { hasText: 'Añadir a la cola' }).click()
await win.waitForTimeout(600)
const queueTitles = await win.evaluate(() => [...document.querySelectorAll('.queue-panel .library-row .title')].map((t) => t.textContent))
console.log(`«Añadir a la cola» con «${lastTitle}» → último en panel: «${queueTitles.at(-1)}» (ok=${queueTitles.at(-1) === lastTitle})`)

// ---------- quitar de la cola con clic derecho ----------
const qRow = win.locator('.queue-panel .library-row:not(.active)').first()
const qTitle = await qRow.locator('.title').textContent()
await qRow.click({ button: 'right' })
await win.waitForTimeout(400)
const qMenu = await win.evaluate(() => [...document.querySelectorAll('.context-menu button')].map((b) => b.textContent))
console.log('menú contextual en cola:', JSON.stringify(qMenu))
if (qMenu.some((m) => /quitar/i.test(m))) {
  await win.locator('.context-menu button', { hasText: /Quitar/i }).first().click()
  await win.waitForTimeout(500)
  const stillThere = await win.evaluate((title) => [...document.querySelectorAll('.queue-panel .library-row .title')].some((t) => t.textContent === title), qTitle)
  console.log(`quitar «${qTitle}» de la cola: eliminado=${!stillThere}`)
} else {
  console.log('SIN opción de quitar en el menú de la cola (o sin menú)')
  await win.keyboard.press('Escape')
}

// ---------- transición automática (gapless): seek casi al final ----------
const curTitle = await barTitle()
await win.evaluate(() => {
  const a = [...document.querySelectorAll('audio')].find((x) => !x.paused)
  if (a && a.duration) a.currentTime = a.duration - 4
})
console.log('seek a fin-4s, esperando transición…')
let transitioned = false
for (let i = 0; i < 20; i++) {
  await win.waitForTimeout(1000)
  const t = await barTitle()
  if (t && t !== curTitle) {
    transitioned = true
    console.log(`transición automática tras fin de pista: «${curTitle}» → «${t}» (${i + 1}s)`)
    break
  }
}
if (!transitioned) console.log('BUG: la pista terminó y NO pasó a la siguiente en 20s')
const afterTrans = await audioState()
console.log('estado tras transición:', JSON.stringify(afterTrans))

// ---------- AUTOPLAY/RADIO: cola de 1 canción que se agota ----------
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.locator('.topbar-search input').fill('daft punk voyager')
await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 15000 })
await win.waitForTimeout(800)
await win.locator('.track-row').first().hover()
await win.locator('.track-row').first().locator('.play-hover').click()
await win.locator('.np-left .title').waitFor({ state: 'visible', timeout: 30000 })
await win.waitForTimeout(4000)
const radioSeed = await barTitle()
const queueLenBefore = await win.evaluate(() => document.querySelectorAll('.queue-panel .library-row').length)
await win.evaluate(() => {
  const a = [...document.querySelectorAll('audio')].find((x) => !x.paused)
  if (a && a.duration) a.currentTime = a.duration - 4
})
console.log(`radio: semilla «${radioSeed}», cola antes=${queueLenBefore}, esperando autoplay…`)
let radioOk = false
for (let i = 0; i < 30; i++) {
  await win.waitForTimeout(1000)
  const t = await barTitle()
  if (t && t !== radioSeed) {
    radioOk = true
    const qLen = await win.evaluate(() => document.querySelectorAll('.queue-panel .library-row').length)
    console.log(`AUTOPLAY OK tras ${i + 1}s: ahora suena «${t}», cola=${qLen} elementos`)
    break
  }
}
if (!radioOk) {
  const qLen = await win.evaluate(() => document.querySelectorAll('.queue-panel .library-row').length)
  const isPlaying = !(await audioState()).paused
  console.log(`BUG AUTOPLAY: no siguió tras agotar la cola (cola=${qLen}, playing=${isPlaying})`)
}
await win.screenshot({ path: join(shots, '06-autoplay.png') })

await app.close()
console.log('SONDA 6 COMPLETA')
