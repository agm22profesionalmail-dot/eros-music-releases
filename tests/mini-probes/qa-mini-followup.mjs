/**
 * Retesteos puntuales de T2b (botón pausa) y T4 (seek 30/60/90%).
 * La primera pasada las marcó como BUG por errores del test, no del mini.
 */
import { launch, waitForSignedIn, playFirstSearchResult, openMini, reportRow, shots } from './_lib.mjs'
import { writeFileSync } from 'fs'
import { join } from 'path'

const rows = []

async function main() {
  const { app, win } = await launch({ label: 'mini-qa-follow' })
  await waitForSignedIn(win, 20000)
  await playFirstSearchResult(win, 'daft punk get lucky')

  // Aseguramos reproducción activa
  await win.evaluate(() => {
    const a = [...document.querySelectorAll('audio')]
    a.forEach((x) => x.play?.())
  })
  await win.waitForTimeout(1200)

  const mini = await openMini(app, win)
  if (!mini) {
    console.log('no mini')
    process.exit(2)
  }

  // ---- T2b (retest) — detección por `d` del path ----
  {
    // PauseIcon d contiene "M5.7 3", PlayIcon d empieza por "m7.05 3.606"
    const info = await mini.evaluate(() => {
      const btn = document.querySelector('.np-play')
      const path = btn?.querySelector('svg path')
      const d = path?.getAttribute('d') ?? ''
      return { d: d.slice(0, 40), isPause: d.startsWith('M5.7'), isPlay: d.startsWith('m7.05') }
    })
    const isPlayingAudio = await win.evaluate(() => {
      const a = [...document.querySelectorAll('audio')]
      return a.some((x) => !x.paused)
    })
    console.log('  icon d:', info)
    console.log('  audio playing:', isPlayingAudio)
    reportRow(rows, '2b', 'Mini reproduciendo muestra icono de PAUSA',
      info.isPause && isPlayingAudio ? 'OK' : 'BUG',
      `pauseIcon=${info.isPause} playing=${isPlayingAudio} d="${info.d}"`)
    await mini.screenshot({ path: join(shots, '02b-retest-open-playing.png') })
  }

  // ---- T4 (retest) — seek al 30/60/90% con click dispatch en-page ----
  {
    const dur = await win.evaluate(() => {
      const a = [...document.querySelectorAll('audio')]
      return Math.max(...a.map((x) => x.duration || 0), 0)
    })
    console.log('  duración:', dur.toFixed(1), 's')

    // localiza la barra por su onPointerDown asignado (ref con height 12)
    const barBox = await mini.evaluate(() => {
      const bars = [...document.querySelectorAll('div')].filter((d) => {
        const s = d.getAttribute('style') ?? ''
        return /flex:\s*1/.test(s) && /height:\s*12/.test(s) && /cursor:\s*pointer/.test(s)
      })
      const b = bars[0]
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height, cnt: bars.length }
    })
    console.log('  barra localizada:', barBox)

    const readT = () => win.evaluate(() => {
      const a = [...document.querySelectorAll('audio')]
      return Math.max(...a.map((x) => x.currentTime), 0)
    })

    let seekOK = 0
    const results = []
    for (const ratio of [0.3, 0.6, 0.9]) {
      const before = await readT()
      if (barBox) {
        // dispatch un pointerdown real en las coords indicadas
        await mini.mouse.click(barBox.x + barBox.w * ratio, barBox.y + barBox.h / 2)
        await win.waitForTimeout(1400)
      }
      const after = await readT()
      const target = dur * ratio
      const delta = Math.abs(after - target)
      const ok = dur > 0 && delta < Math.max(8, dur * 0.05)
      if (ok) seekOK++
      results.push({ ratio, before: before.toFixed(1), after: after.toFixed(1), target: target.toFixed(1), delta: delta.toFixed(1), ok })
      console.log(`  seek ${Math.round(ratio*100)}%: ${before.toFixed(1)}->${after.toFixed(1)} target=${target.toFixed(1)} delta=${delta.toFixed(1)} ok=${ok}`)
    }
    reportRow(rows, '4', 'Seek al 30/60/90% desde la barra',
      seekOK === 3 ? 'OK' : seekOK > 0 ? 'WARN' : 'BUG',
      results.map((r) => `${Math.round(r.ratio*100)}%=${r.ok ? 'ok' : `fail(Δ${r.delta})`}`).join(' '))
  }

  // ---- T11a (retest) — karaoke ON con espera más larga y song con letra
  //   Yellow (Coldplay) NO tuvo letra sync en el intento anterior. Probamos
  //   otra con letra segura: "Bad Guy - Billie Eilish"
  await playFirstSearchResult(win, 'billie eilish bad guy')
  await win.waitForTimeout(2000)
  await win.evaluate(() => window.api.settings.set({ miniKaraoke: true }))
  await mini.waitForTimeout(9000) // más tiempo para fetch de letra
  const karInfo = await mini.evaluate(() => {
    const el = document.querySelector('.karaoke-fill')
    return { has: !!el, text: el?.textContent ?? '', inline: el?.getAttribute('style') ?? '' }
  })
  console.log('  karaoke retest:', karInfo)
  await mini.screenshot({ path: join(shots, '05b-retest-karaoke.png') })
  reportRow(rows, '11a', 'Karaoke ON muestra letra sincronizada',
    karInfo.has && karInfo.text.length > 0 ? 'OK' : 'BUG',
    `has=${karInfo.has} text="${karInfo.text.slice(0, 40)}"`)

  // Cleanup: karaoke off
  await win.evaluate(() => window.api.settings.set({ miniKaraoke: false }))
  await win.waitForTimeout(600)

  writeFileSync(join(shots, '..', 'results-followup.json'), JSON.stringify({ rows }, null, 2))
  console.log('\n=== FOLLOWUP ===')
  console.table(rows.map((r) => ({ id: r.id, result: r.result, name: r.name.slice(0, 40), detail: r.detail.slice(0, 60) })))
  await app.close()
  process.exit(0)
}

main().catch(async (err) => {
  console.error('followup falla:', err)
  writeFileSync(join(shots, '..', 'results-followup.json'), JSON.stringify({ rows, error: String(err) }, null, 2))
  process.exit(2)
})
