/**
 * SONDA 10 — Descarga con captura completa de eventos de progreso y errores,
 * + prueba puntual de crossfade>0 con doble next (bug del setTimeout del motor).
 */
import { launch, waitForSignedIn, shots } from './_lib.mjs'
import { join } from 'path'
import { existsSync, statSync } from 'fs'

const { app, win, mainLog } = await launch()
await win.waitForTimeout(2500)
console.log('AUTH:', JSON.stringify((await waitForSignedIn(win)).status))

// escucha de eventos de descarga → los reenvía a console del renderer
await win.evaluate(() => {
  window.api.downloads.onProgress((p) => console.log('[DLEVT]', JSON.stringify(p)))
})
const dlEvents = []
win.on('console', (msg) => {
  if (msg.text().startsWith('[DLEVT]')) {
    dlEvents.push(msg.text())
    console.log(' ', msg.text())
  }
})

const before = await win.evaluate(() => window.api.downloads.list())

await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.locator('.topbar-search input').fill('daft punk around the world radio edit')
await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 15000 })
await win.waitForTimeout(800)
const dlTitle = await win.locator('.track-row').first().locator('.title-text').textContent()
await win.locator('.track-row').first().click({ button: 'right' })
await win.locator('.context-menu button', { hasText: 'Descargar' }).click()
console.log(`descargando «${dlTitle}»… (hasta 150s)`)

let result = null
for (let i = 0; i < 150 && !result; i++) {
  await win.waitForTimeout(1000)
  if (dlEvents.some((e) => e.includes('"error"') || e.includes('"done"'))) {
    result = dlEvents.at(-1)
  }
}
console.log('resultado eventos:', result ?? 'SIN evento done/error en 150s')
console.log('todos los eventos:', dlEvents.length)

const after = await win.evaluate(() => window.api.downloads.list())
const nuevo = after.find((d) => !before.some((b) => b.track?.videoId === d.track?.videoId))
if (nuevo) {
  console.log('registrada:', nuevo.filePath, existsSync(nuevo.filePath) ? `${(statSync(nuevo.filePath).size / 1e6).toFixed(1)} MB` : 'NO EXISTE EN DISCO')
  // reproducir la descargada y medir si el resolver va a la red
  const resolverBefore = mainLog.filter((l) => l.includes('[resolver]')).length
  const prep = await win.evaluate(async (v) => {
    const t0 = performance.now()
    const p = await window.api.player.prepare(v)
    return { via: p.via, ms: Math.round(performance.now() - t0) }
  }, nuevo.track.videoId)
  const resolverAfter = mainLog.filter((l) => l.includes('[resolver]')).length
  console.log(`prepare(descargada): via=${prep.via} ${prep.ms}ms — resolver nuevas=${resolverAfter - resolverBefore}`)
}

// errores main sin filtrar relacionados con descargas
const dlErrors = mainLog.filter((l) => /yt-dlp|ffmpeg|download|ENOENT|spawn/i.test(l))
console.log('líneas main relevantes:', JSON.stringify(dlErrors.slice(0, 12), null, 1))

// ---------- crossfade>0 + doble next (vía UI de Ajustes, luego se restaura) ----------
console.log('--- crossfade 4s + doble next:')
await win.locator('.avatar-btn[title="Ajustes"]').click()
await win.waitForTimeout(800)
await win.evaluate(() => {
  const rows = [...document.querySelectorAll('.page div')]
  const row = rows.find((r) => /^Crossfade/.test(r.querySelector('span')?.textContent ?? '') && r.querySelector('input[type="range"]'))
  const input = row.querySelector('input[type="range"]')
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(input, '4')
  input.dispatchEvent(new Event('input', { bubbles: true }))
})
await win.waitForTimeout(500)
console.log('crossfade puesto a:', await win.evaluate(() => [...document.querySelectorAll('.page span')].find((s) => /^Crossfade/.test(s.textContent ?? ''))?.textContent))

// reproducir álbum y dar dos next rápidos
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.locator('.topbar-search input').fill('daft punk discovery')
await win.locator('.page .chip', { hasText: 'Álbumes' }).first().click()
await win.locator('.media-card').first().waitFor({ state: 'visible', timeout: 15000 })
await win.locator('.media-card').first().click()
await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 15000 })
await win.locator('.track-row').nth(0).dblclick()
await win.locator('.np-left .title').waitFor({ state: 'visible', timeout: 30000 })
await win.waitForTimeout(4000)

await win.locator('.np-ctrl[aria-label="Siguiente"]').click()
await win.waitForTimeout(1500) // dentro de la ventana de crossfade de 4s
await win.locator('.np-ctrl[aria-label="Siguiente"]').click()
await win.waitForTimeout(7000) // deja disparar los dos timeouts

const xfState = await win.evaluate(() => {
  const audios = [...document.querySelectorAll('audio')]
  return {
    playing: audios.some((a) => !a.paused),
    decks: audios.map((a) => ({ paused: a.paused, t: +a.currentTime.toFixed(1), src: a.src ? 'sí' : 'no' }))
  }
})
console.log('tras doble-next con crossfade 4s:', JSON.stringify(xfState), 'barra:', await win.locator('.np-left .title').textContent().catch(() => null))
if (!xfState.playing) {
  console.log('BUG CONFIRMADO: el crossfade mata la reproducción con next rápidos')
  await win.screenshot({ path: join(shots, '10-crossfade-kill.png') })
}

// restaurar crossfade a 0 vía UI
await win.locator('.avatar-btn[title="Ajustes"]').click()
await win.waitForTimeout(800)
await win.evaluate(() => {
  const rows = [...document.querySelectorAll('.page div')]
  const row = rows.find((r) => /^Crossfade/.test(r.querySelector('span')?.textContent ?? '') && r.querySelector('input[type="range"]'))
  const input = row.querySelector('input[type="range"]')
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(input, '0')
  input.dispatchEvent(new Event('input', { bubbles: true }))
})
await win.waitForTimeout(500)
console.log('crossfade restaurado:', await win.evaluate(() => (window.api.settings.get())).then?.() ?? (await win.evaluate(() => window.api.settings.get())).crossfadeSec)

await app.close()
console.log('SONDA 10 COMPLETA')
