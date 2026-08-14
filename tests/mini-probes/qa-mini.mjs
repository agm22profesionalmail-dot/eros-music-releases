/**
 * QA completo del mini-player tras el rediseño visual.
 * Corre TODAS las pruebas funcionales y visuales y escribe el informe.
 * Uso: node tests/mini-probes/qa-mini.mjs
 */
import { launch, waitForSignedIn, playFirstSearchResult, openMini, reportRow, shots } from './_lib.mjs'
import { writeFileSync } from 'fs'
import { join } from 'path'

const rows = []
const startedAt = Date.now()

// --- guardar ajustes originales para restaurar al final ---
let initialSettings = null

async function withMini(app, win, fn) {
  const mini = await openMini(app, win)
  if (!mini) throw new Error('mini no abrió')
  try {
    return await fn(mini)
  } finally {
    // deja el mini abierto para el próximo test
  }
}

async function main() {
  const { app, win, mainLog } = await launch({ label: 'mini-qa' })
  const auth = await waitForSignedIn(win, 20000)
  console.log('  auth:', auth?.status)

  initialSettings = await win.evaluate(() => window.api.settings.get())
  console.log('  ajustes iniciales:',
    JSON.stringify({
      accentMode: initialSettings.accentMode,
      bgMode: initialSettings.bgMode,
      theme: initialSettings.theme,
      miniCorner: initialSettings.miniCorner,
      miniKaraoke: initialSettings.miniKaraoke,
      miniScale: initialSettings.miniScale,
      discordRpc: initialSettings.discordRpc
    })
  )

  // --- Semilla: reproduce una canción para tener estado ---
  const playing = await playFirstSearchResult(win, 'daft punk get lucky')
  console.log('  reproduciendo:', playing)

  // Pausamos para T2a (abrir estando pausado)
  await win.evaluate(() => {
    const audios = [...document.querySelectorAll('audio')]
    audios.forEach((a) => a.pause())
  })
  await win.waitForTimeout(1200)

  // ========================================================================
  // T2a — Abrir mini estando PAUSADO
  // ========================================================================
  {
    const mini = await openMini(app, win)
    if (!mini) {
      reportRow(rows, '2a', 'Abrir mini estando pausado', 'BUG', 'no abrió la ventana')
    } else {
      const s = await mini.evaluate(() => {
        const t = document.querySelector('div[title="Abrir Metrolist"]')?.textContent ?? ''
        // busca el botón .np-play y comprueba su SVG (PlayIcon vs PauseIcon)
        const play = document.querySelector('.np-play')
        const svg = play?.querySelector('svg')
        return { text: t, svgTitle: svg?.getAttribute('data-icon') ?? '', hasContent: !!play }
      })
      const shot = `01-open-paused.png`
      await mini.screenshot({ path: join(shots, shot) })
      reportRow(rows, '2a', 'Mini abierto pausado con estado correcto',
        s.text && s.text.length > 4 ? 'OK' : 'BUG',
        `título="${s.text?.slice(0, 60)}"`, shot)
    }
  }

  // ========================================================================
  // T3 — Play desde el mini controla el audio principal
  // ========================================================================
  {
    let mini = app.windows().find((w) => w.url().includes('#/mini') && !w.url().includes('mini-settings'))
    if (!mini) mini = await openMini(app, win)
    const wasPaused = await win.evaluate(() => {
      const a = [...document.querySelectorAll('audio')]
      return a.length > 0 && a.every((x) => x.paused)
    })
    await mini.locator('.np-play').click()
    await win.waitForTimeout(1500)
    const nowPlaying = await win.evaluate(() => {
      const a = [...document.querySelectorAll('audio')]
      return a.some((x) => !x.paused)
    })
    reportRow(rows, '3a', 'Play desde el mini reanuda audio principal',
      wasPaused && nowPlaying ? 'OK' : 'BUG',
      `wasPaused=${wasPaused} nowPlaying=${nowPlaying}`)

    // Pausa desde el mini
    await mini.locator('.np-play').click()
    await win.waitForTimeout(1500)
    const nowPaused = await win.evaluate(() => {
      const a = [...document.querySelectorAll('audio')]
      return a.length > 0 && a.every((x) => x.paused)
    })
    reportRow(rows, '3b', 'Pausa desde el mini pausa audio principal',
      nowPaused ? 'OK' : 'BUG')
  }

  // ========================================================================
  // T2b — Abrir estando REPRODUCIENDO (reabrimos)
  // ========================================================================
  {
    // Cierra mini
    let mini = app.windows().find((w) => w.url().includes('#/mini') && !w.url().includes('mini-settings'))
    if (mini) {
      await mini.hover('body')
      await mini.locator('[title="Cerrar mini-player"]').click()
      await win.waitForTimeout(800)
    }
    // Reanuda
    await win.evaluate(() => {
      const a = [...document.querySelectorAll('audio')]
      a.forEach((x) => x.play?.())
    })
    await win.waitForTimeout(1500)
    mini = await openMini(app, win)
    if (!mini) {
      reportRow(rows, '2b', 'Abrir mini estando reproduciendo', 'BUG', 'no abrió')
    } else {
      const state = await mini.evaluate(() => {
        // El botón muestra PauseIcon cuando isPlaying=true
        // Sin data attribute, inspecciona los paths del svg
        const play = document.querySelector('.np-play')
        const svg = play?.querySelector('svg')
        const paths = svg ? [...svg.querySelectorAll('*')].length : 0
        // PauseIcon tiene 2 <rect>, PlayIcon tiene 1 <path>
        const rects = svg?.querySelectorAll('rect').length ?? 0
        const t = document.querySelector('div[title="Abrir Metrolist"]')?.textContent ?? ''
        return { title: t, rectCount: rects, allEls: paths }
      })
      const shot = '02-open-playing.png'
      await mini.screenshot({ path: join(shots, shot) })
      // 2 rects => Pause icon => reproduciendo
      reportRow(rows, '2b', 'Mini abierto reproduciendo con botón pausa',
        state.rectCount >= 2 && state.title.length > 4 ? 'OK' : 'BUG',
        `rects=${state.rectCount} title="${state.title.slice(0, 50)}"`, shot)
    }
  }

  // ========================================================================
  // T4 — Seek al 30%, 60%, 90%
  // ========================================================================
  {
    const mini = app.windows().find((w) => w.url().includes('#/mini') && !w.url().includes('mini-settings'))
    const readTime = () => win.evaluate(() => {
      const a = [...document.querySelectorAll('audio')]
      return Math.max(...a.map((x) => x.currentTime), 0)
    })
    const readDur = () => win.evaluate(() => {
      const a = [...document.querySelectorAll('audio')]
      return Math.max(...a.map((x) => x.duration || 0), 0)
    })
    const dur = await readDur()
    console.log('  duración audio:', dur.toFixed(1), 's')

    // Localiza la barra: div con onPointerDown que contiene otro div con background
    const bar = mini.locator('div').filter({ has: mini.locator('div[style*="width: 100%"][style*="height: 4px"]') }).first()
    const box = await bar.boundingBox().catch(() => null)
    let seekOK = 0
    let seekTot = 0
    for (const ratio of [0.3, 0.6, 0.9]) {
      seekTot++
      const before = await readTime()
      if (!box) break
      await mini.mouse.click(box.x + box.width * ratio, box.y + box.height / 2)
      await win.waitForTimeout(1500)
      const after = await readTime()
      const target = dur * ratio
      const delta = Math.abs(after - target)
      const ok = dur > 0 && delta < Math.max(8, dur * 0.05)
      console.log(`  seek ${Math.round(ratio*100)}%: ${before.toFixed(1)}s -> ${after.toFixed(1)}s (target ${target.toFixed(1)}s, delta ${delta.toFixed(1)}s)`)
      if (ok) seekOK++
    }
    reportRow(rows, '4', 'Seek al 30/60/90% desde la barra',
      seekOK === seekTot ? 'OK' : seekOK > 0 ? 'WARN' : 'BUG',
      `${seekOK}/${seekTot} seeks precisos`)
  }

  // ========================================================================
  // T5 — Doble clic / clic en título abre y enfoca la ventana principal
  // ========================================================================
  {
    const mini = app.windows().find((w) => w.url().includes('#/mini') && !w.url().includes('mini-settings'))
    // Minimizamos primero para verificar que showMain la re-enfoca
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => !x.webContents.getURL().includes('#/mini'))
      w?.minimize()
    })
    await win.waitForTimeout(500)
    const wasMinimized = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => !x.webContents.getURL().includes('#/mini'))
      return w?.isMinimized() ?? false
    })
    await mini.locator('div[title="Abrir Metrolist"]').first().click()
    await win.waitForTimeout(800)
    const shown = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => !x.webContents.getURL().includes('#/mini'))
      return { visible: w?.isVisible() ?? false, minimized: w?.isMinimized() ?? false }
    })
    reportRow(rows, '5', 'Clic en título abre/enfoca ventana principal',
      wasMinimized && shown.visible && !shown.minimized ? 'OK' : 'BUG',
      `wasMin=${wasMinimized} visible=${shown.visible} min=${shown.minimized}`)
  }

  // ========================================================================
  // T6 — Cambiar canción en principal ⇒ mini se actualiza <1.5s
  // ========================================================================
  {
    const mini = app.windows().find((w) => w.url().includes('#/mini') && !w.url().includes('mini-settings'))
    const before = await mini.locator('div[title="Abrir Metrolist"]').first().textContent()
    // Cambia a otra búsqueda y toca la primera pista
    const newTitle = await playFirstSearchResult(win, 'coldplay yellow')
    // Espera hasta 1.5s
    const t0 = Date.now()
    let after = before
    while (Date.now() - t0 < 1600) {
      after = await mini.locator('div[title="Abrir Metrolist"]').first().textContent()
      if (after && after !== before) break
      await mini.waitForTimeout(120)
    }
    const dt = Date.now() - t0
    reportRow(rows, '6', 'Cambiar canción principal se refleja en <1.5s',
      after !== before && dt < 1600 ? 'OK' : 'BUG',
      `dt=${dt}ms before="${(before ?? '').slice(0, 30)}" after="${(after ?? '').slice(0, 30)}"`)
  }

  // ========================================================================
  // T7 — Ventana de ajustes independiente (abre con ruedita, cierra con ✕)
  // ========================================================================
  {
    const mini = app.windows().find((w) => w.url().includes('#/mini') && !w.url().includes('mini-settings'))
    // Nada de ventana settings inicialmente
    const before = app.windows().some((w) => w.url().includes('#/mini-settings'))
    await mini.hover('body')
    await mini.locator('[title="Ajustes del mini-player"]').click()
    let settingsPage = null
    for (let i = 0; i < 20 && !settingsPage; i++) {
      await win.waitForTimeout(300)
      settingsPage = app.windows().find((w) => w.url().includes('#/mini-settings'))
    }
    reportRow(rows, '7a', 'Ajustes del mini se abre con ruedita',
      !before && settingsPage ? 'OK' : 'BUG')

    if (settingsPage) {
      await settingsPage.waitForLoadState('domcontentloaded')
      await settingsPage.waitForTimeout(500)
      await settingsPage.screenshot({ path: join(shots, '03-settings.png') })
      await settingsPage.locator('[aria-label="Cerrar"]').click()
      await win.waitForTimeout(800)
      const stillOpen = app.windows().some((w) => w.url().includes('#/mini-settings'))
      reportRow(rows, '7b', 'Cerrar ajustes con ✕',
        !stillOpen ? 'OK' : 'BUG')
    }
  }

  // ========================================================================
  // T8 — Cambio de esquina desde el diagrama (TL/TR/BL/BR)
  // ========================================================================
  {
    const mini = app.windows().find((w) => w.url().includes('#/mini') && !w.url().includes('mini-settings'))
    // reabrir ajustes
    await mini.hover('body')
    await mini.locator('[title="Ajustes del mini-player"]').click()
    let settingsPage = null
    for (let i = 0; i < 20 && !settingsPage; i++) {
      await win.waitForTimeout(300)
      settingsPage = app.windows().find((w) => w.url().includes('#/mini-settings'))
    }
    await settingsPage.waitForLoadState('domcontentloaded')
    await settingsPage.waitForTimeout(500)

    const cornerResults = []
    const corners = [
      { code: 'tl', title: 'Arriba izquierda', check: (b, wa) => b.x < wa.x + 40 && b.y < wa.y + 40 },
      { code: 'tr', title: 'Arriba derecha', check: (b, wa) => b.x + b.width > wa.x + wa.width - 40 && b.y < wa.y + 40 },
      { code: 'bl', title: 'Abajo izquierda', check: (b, wa) => b.x < wa.x + 40 && b.y + b.height > wa.y + wa.height - 40 },
      { code: 'br', title: 'Abajo derecha', check: (b, wa) => b.x + b.width > wa.x + wa.width - 40 && b.y + b.height > wa.y + wa.height - 40 }
    ]
    for (const c of corners) {
      await settingsPage.locator(`[title="${c.title}"]`).click()
      await win.waitForTimeout(800)
      const info = await app.evaluate(({ BrowserWindow, screen }) => {
        const m = BrowserWindow.getAllWindows().find((w) => {
          const u = w.webContents.getURL()
          return u.includes('#/mini') && !u.includes('mini-settings')
        })
        if (!m) return null
        return { bounds: m.getBounds(), workArea: screen.getDisplayMatching(m.getBounds()).workArea }
      })
      const ok = info && c.check(info.bounds, info.workArea)
      cornerResults.push({ code: c.code, ok, info })
      console.log(`  esquina ${c.code}: bounds=${JSON.stringify(info?.bounds)} ok=${ok}`)
    }
    const allOK = cornerResults.every((r) => r.ok)
    reportRow(rows, '8', 'Cambio de esquina (TL/TR/BL/BR)',
      allOK ? 'OK' : 'BUG',
      cornerResults.map((r) => `${r.code}=${r.ok ? 'ok' : 'FAIL'}`).join(' '))
  }

  // ========================================================================
  // T9 — Modo Libre: aparecen puntitos, esquinas quedan sin marcador
  // ========================================================================
  {
    const settingsPage = app.windows().find((w) => w.url().includes('#/mini-settings'))
    const mini = app.windows().find((w) => w.url().includes('#/mini') && !w.url().includes('mini-settings'))
    await settingsPage.locator('button', { hasText: 'Libre' }).click()
    await win.waitForTimeout(800)
    const dotsVisible = await mini.locator('[title="Arrastra para mover"]').isVisible().catch(() => false)
    await mini.screenshot({ path: join(shots, '04-free-mode.png') })
    reportRow(rows, '9', 'Modo libre muestra puntitos',
      dotsVisible ? 'OK' : 'BUG')
  }

  // ========================================================================
  // T10 — Slider de escala 80/130/160/100
  // ========================================================================
  {
    const settingsPage = app.windows().find((w) => w.url().includes('#/mini-settings'))
    // Volvemos a esquina para que placeMini pueda reposicionar limpio
    await settingsPage.locator('[title="Abajo derecha"]').click()
    await win.waitForTimeout(500)

    const scaleResults = []
    for (const scale of [0.8, 1.3, 1.6, 1.0]) {
      await settingsPage.locator('input[type="range"]').fill(String(scale))
      // trigger input+change
      await settingsPage.locator('input[type="range"]').evaluate((el, v) => {
        el.value = String(v)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }, scale)
      await win.waitForTimeout(900)
      const bounds = await app.evaluate(({ BrowserWindow }) => {
        const m = BrowserWindow.getAllWindows().find((w) => {
          const u = w.webContents.getURL()
          return u.includes('#/mini') && !u.includes('mini-settings')
        })
        return m?.getBounds() ?? null
      })
      const expectedW = Math.round(400 * scale)
      const ok = bounds && Math.abs(bounds.width - expectedW) < 8
      scaleResults.push({ scale, ok, width: bounds?.width, expected: expectedW })
      console.log(`  scale ${scale}: width=${bounds?.width} exp=${expectedW} ok=${ok}`)
    }
    const allOK = scaleResults.every((r) => r.ok)
    reportRow(rows, '10', 'Slider de escala redimensiona ventana',
      allOK ? 'OK' : 'BUG',
      scaleResults.map((r) => `${r.scale}=>${r.width}px(${r.ok ? 'ok' : 'fail'})`).join(' '))
  }

  // ========================================================================
  // T11 — Toggle karaoke (ON/OFF)
  // ========================================================================
  {
    const settingsPage = app.windows().find((w) => w.url().includes('#/mini-settings'))
    const mini = app.windows().find((w) => w.url().includes('#/mini') && !w.url().includes('mini-settings'))
    // ON
    await settingsPage.locator('input[type="checkbox"]').check()
    await mini.waitForTimeout(7000)
    const karaokeOn = await mini.evaluate(() => {
      const fill = document.querySelector('.karaoke-fill')
      return { has: !!fill, text: fill?.textContent ?? '' }
    })
    await mini.screenshot({ path: join(shots, '05-karaoke-on.png') })
    reportRow(rows, '11a', 'Karaoke ON: aparece letra sincronizada',
      karaokeOn.has && karaokeOn.text.length > 0 ? 'OK' : 'WARN',
      `has=${karaokeOn.has} text="${karaokeOn.text.slice(0, 40)}"`)

    // OFF
    await settingsPage.locator('input[type="checkbox"]').uncheck()
    await mini.waitForTimeout(1000)
    const karaokeOff = await mini.evaluate(() => {
      const fill = document.querySelector('.karaoke-fill')
      const title = document.querySelector('b')?.textContent ?? ''
      const bar = document.querySelector('div[style*="height: 4px"]')
      return { hasFill: !!fill, title, hasBar: !!bar }
    })
    await mini.screenshot({ path: join(shots, '06-karaoke-off.png') })
    reportRow(rows, '11b', 'Karaoke OFF: vuelve título+timeline',
      !karaokeOff.hasFill && karaokeOff.title && karaokeOff.hasBar ? 'OK' : 'BUG',
      `hasFill=${karaokeOff.hasFill} title="${karaokeOff.title.slice(0, 30)}" bar=${karaokeOff.hasBar}`)
  }

  // ========================================================================
  // T12 — Acento dinámico cambia con la carátula (accentMode:'dynamic')
  // ========================================================================
  {
    const mini = app.windows().find((w) => w.url().includes('#/mini') && !w.url().includes('mini-settings'))
    await win.evaluate(() => window.api.settings.set({ accentMode: 'dynamic' }))
    await mini.waitForTimeout(1500)
    const accent1 = await mini.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      return {
        accent: style.getPropertyValue('--accent').trim(),
        playColor: getComputedStyle(document.querySelector('.np-play')).color,
        rootAccentInline: document.documentElement.style.getPropertyValue('--accent')
      }
    })
    await mini.screenshot({ path: join(shots, '07-accent-dynamic-album1.png') })
    console.log('  acento álbum1:', accent1)

    // Cambia a álbum con paleta distinta
    await playFirstSearchResult(win, 'billie eilish bad guy')
    await mini.waitForTimeout(2500)
    const accent2 = await mini.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      return {
        accent: style.getPropertyValue('--accent').trim(),
        playColor: getComputedStyle(document.querySelector('.np-play')).color,
        rootAccentInline: document.documentElement.style.getPropertyValue('--accent')
      }
    })
    await mini.screenshot({ path: join(shots, '08-accent-dynamic-album2.png') })
    console.log('  acento álbum2:', accent2)

    const changed = accent1.accent && accent2.accent && accent1.accent !== accent2.accent
    reportRow(rows, '12', 'Acento dinámico cambia con la carátula',
      changed ? 'OK' : 'BUG',
      `1="${accent1.accent}" 2="${accent2.accent}"`)
  }

  // ========================================================================
  // T13 — Fondo teñido de la carátula (linear-gradient con tint)
  // ========================================================================
  {
    const mini = app.windows().find((w) => w.url().includes('#/mini') && !w.url().includes('mini-settings'))
    const info = await mini.evaluate(() => {
      const root = document.querySelector('#root > *')
      if (!root) return null
      const cs = getComputedStyle(root)
      return {
        bgImage: cs.backgroundImage,
        bgColor: cs.backgroundColor,
        transition: cs.transition
      }
    })
    console.log('  root bg:', info)
    const hasGradient = info && info.bgImage && info.bgImage.includes('linear-gradient')
    reportRow(rows, '13', 'Fondo teñido con linear-gradient',
      hasGradient ? 'OK' : 'BUG',
      `bgImage="${(info?.bgImage ?? '').slice(0, 80)}"`)
  }

  // ========================================================================
  // T14 — Cambio de tema se propaga al mini sin recargar
  // ========================================================================
  {
    const mini = app.windows().find((w) => w.url().includes('#/mini') && !w.url().includes('mini-settings'))
    const themeBefore = await mini.evaluate(() => document.documentElement.dataset.theme ?? '')
    // Cambia a light
    await win.evaluate(() => window.api.settings.set({ theme: 'light' }))
    await mini.waitForTimeout(1200)
    const themeLight = await mini.evaluate(() => document.documentElement.dataset.theme ?? '')
    // Cambia a black
    await win.evaluate(() => window.api.settings.set({ theme: 'black' }))
    await mini.waitForTimeout(1200)
    const themeBlack = await mini.evaluate(() => document.documentElement.dataset.theme ?? '')
    // Restauramos al inicial
    await win.evaluate((t) => window.api.settings.set({ theme: t }), initialSettings.theme)
    await mini.waitForTimeout(800)
    console.log(`  temas: before=${themeBefore} light=${themeLight} black=${themeBlack}`)
    const ok = themeLight === 'light' && themeBlack === 'black'
    reportRow(rows, '14', 'Cambio de tema se re-tinta el mini al instante',
      ok ? 'OK' : 'BUG',
      `light=${themeLight} black=${themeBlack}`)
  }

  // ========================================================================
  // T15 — Barra de tiempo: verifica que la barra existe y usa var(--accent)
  // (NOTA: el mini usa su propia mini-barra sin clase .slider .fill;
  //  la comprobación se adapta al layout real del MiniPlayer.tsx)
  // ========================================================================
  {
    const mini = app.windows().find((w) => w.url().includes('#/mini') && !w.url().includes('mini-settings'))
    // Reactivamos accentMode dinámico para tener acento no gris
    const info = await mini.evaluate(() => {
      // Localiza el <div> de progreso: el interior con background var(--accent)
      const bars = [...document.querySelectorAll('div')].filter((d) => {
        const s = d.getAttribute('style') ?? ''
        return s.includes('height: 4px') || s.includes('height:4px')
      })
      const fill = bars.length
        ? [...bars[0].querySelectorAll('div')].find((d) => {
            const s = d.getAttribute('style') ?? ''
            return /background:\s*var\(--accent\)/.test(s)
          })
        : null
      const cs = fill ? getComputedStyle(fill) : null
      return {
        railFound: bars.length > 0,
        fillFound: !!fill,
        bg: cs?.backgroundColor ?? '',
        boxShadow: cs?.boxShadow ?? ''
      }
    })
    console.log('  barra mini:', info)
    reportRow(rows, '15', 'Barra de tiempo del mini (accent)',
      info.railFound && info.fillFound ? 'OK' : 'WARN',
      `rail=${info.railFound} fill=${info.fillFound} bg="${info.bg}"`)
  }

  // ========================================================================
  // T16 — Animación de botones (transition en .np-play)
  // ========================================================================
  {
    const mini = app.windows().find((w) => w.url().includes('#/mini') && !w.url().includes('mini-settings'))
    const info = await mini.evaluate(() => {
      const btn = document.querySelector('.np-play')
      const cs = btn ? getComputedStyle(btn) : null
      return {
        transition: cs?.transition ?? '',
        transform: cs?.transform ?? '',
        transitionDuration: cs?.transitionDuration ?? ''
      }
    })
    console.log('  .np-play transition:', info.transition)
    const has = info.transition && info.transition !== 'all 0s ease 0s' && !/^all\s+0s\s/i.test(info.transition)
    reportRow(rows, '16', 'Animación del play (transition no vacía)',
      has ? 'OK' : 'BUG',
      `transition="${info.transition.slice(0, 100)}"`)
  }

  // ========================================================================
  // T17 — Karaoke iluminado: --fill cambia con el tiempo
  // ========================================================================
  {
    const mini = app.windows().find((w) => w.url().includes('#/mini') && !w.url().includes('mini-settings'))
    // Activamos karaoke y esperamos a que cargue letra
    await win.evaluate(() => window.api.settings.set({ miniKaraoke: true }))
    await mini.waitForTimeout(7000)
    const r1 = await mini.evaluate(() => {
      const el = document.querySelector('.karaoke-fill')
      if (!el) return null
      const inline = el.getAttribute('style') ?? ''
      const cs = getComputedStyle(el)
      return {
        text: el.textContent,
        inlineFill: /--fill:\s*([^;]+)/.exec(inline)?.[1] ?? '',
        bgSize: cs.backgroundSize
      }
    })
    console.log('  karaoke r1:', r1)
    await mini.waitForTimeout(1500)
    const r2 = await mini.evaluate(() => {
      const el = document.querySelector('.karaoke-fill')
      if (!el) return null
      const inline = el.getAttribute('style') ?? ''
      const cs = getComputedStyle(el)
      return {
        text: el.textContent,
        inlineFill: /--fill:\s*([^;]+)/.exec(inline)?.[1] ?? '',
        bgSize: cs.backgroundSize
      }
    })
    console.log('  karaoke r2:', r2)
    await mini.screenshot({ path: join(shots, '09-karaoke-illuminated.png') })
    const has = r1 && r2 && r1.inlineFill && r2.inlineFill && r1.inlineFill !== r2.inlineFill
    reportRow(rows, '17', 'Karaoke: --fill cambia con el tiempo',
      has ? 'OK' : 'WARN',
      `r1="${r1?.inlineFill ?? 'null'}" r2="${r2?.inlineFill ?? 'null'}"`)
    // Desactivar
    await win.evaluate(() => window.api.settings.set({ miniKaraoke: false }))
    await mini.waitForTimeout(600)
  }

  // ========================================================================
  // T18 — Layout: carátula 84px + contenido + 3 botones, ✕/ruedita alineadas
  // ========================================================================
  {
    const mini = app.windows().find((w) => w.url().includes('#/mini') && !w.url().includes('mini-settings'))
    const layout = await mini.evaluate(() => {
      const img = document.querySelector('img[alt=""]') || document.querySelector('div[style*="width: 84px"]')
      const imgRect = img?.getBoundingClientRect() ?? null
      const btns = [...document.querySelectorAll('.np-ctrl, .np-play')]
      const btnRects = btns.map((b) => b.getBoundingClientRect())
      const closeBtn = document.querySelector('[title="Cerrar mini-player"]')
      const settingsBtn = document.querySelector('[title="Ajustes del mini-player"]')
      const bodyRect = document.body.getBoundingClientRect()
      const scrollX = document.documentElement.scrollWidth > document.documentElement.clientWidth
      const scrollY = document.documentElement.scrollHeight > document.documentElement.clientHeight
      return {
        imgW: Math.round(imgRect?.width ?? 0),
        imgH: Math.round(imgRect?.height ?? 0),
        btns: btnRects.length,
        closeRect: closeBtn?.getBoundingClientRect() ?? null,
        settingsRect: settingsBtn?.getBoundingClientRect() ?? null,
        bodyW: Math.round(bodyRect.width),
        bodyH: Math.round(bodyRect.height),
        overflow: { x: scrollX, y: scrollY }
      }
    })
    console.log('  layout:', JSON.stringify(layout))
    const okImg = layout.imgW >= 80 && layout.imgW <= 90 && layout.imgH >= 80 && layout.imgH <= 90
    const okBtns = layout.btns >= 3
    const okOverflow = !layout.overflow.x && !layout.overflow.y
    // ✕ debe estar a la derecha del ruedita (ambos arriba a la derecha, X derecha)
    const okAlign = layout.closeRect && layout.settingsRect &&
      Math.abs(layout.closeRect.top - layout.settingsRect.top) < 4 &&
      layout.closeRect.right > layout.settingsRect.right
    reportRow(rows, '18', 'Layout íntegro: carátula 84px, 3 botones, sin desbordamiento',
      okImg && okBtns && okOverflow && okAlign ? 'OK' : 'WARN',
      `img=${layout.imgW}x${layout.imgH} btns=${layout.btns} overflow=${JSON.stringify(layout.overflow)} align=${okAlign}`)
    await mini.screenshot({ path: join(shots, '10-layout-final.png') })
  }

  // ========================================================================
  // T1 — Cerrar mini con el botón ✕
  // ========================================================================
  {
    const mini = app.windows().find((w) => w.url().includes('#/mini') && !w.url().includes('mini-settings'))
    // Cerrar settings primero (si sigue abierta)
    const settingsPage = app.windows().find((w) => w.url().includes('#/mini-settings'))
    if (settingsPage) {
      await settingsPage.locator('[aria-label="Cerrar"]').click().catch(() => {})
      await win.waitForTimeout(500)
    }
    await mini.hover('body')
    await mini.locator('[title="Cerrar mini-player"]').click()
    await win.waitForTimeout(1200)
    const stillOpen = app.windows().some((w) => w.url().includes('#/mini') && !w.url().includes('mini-settings'))
    reportRow(rows, '1a', 'Cerrar mini con botón ✕',
      !stillOpen ? 'OK' : 'BUG')

    // Reabrir con el icono para verificar toggle
    await win.locator('[aria-label="Mini-player"]').click()
    let mini2 = null
    for (let i = 0; i < 20 && !mini2; i++) {
      await win.waitForTimeout(300)
      mini2 = app.windows().find((w) => w.url().includes('#/mini') && !w.url().includes('mini-settings'))
    }
    reportRow(rows, '1b', 'Reabrir mini con icono de la app',
      mini2 ? 'OK' : 'BUG')
    // Y cerrarlo con el mismo icono (toggle)
    if (mini2) {
      await win.locator('[aria-label="Mini-player"]').click()
      await win.waitForTimeout(1200)
      const closed = !app.windows().some((w) => w.url().includes('#/mini') && !w.url().includes('mini-settings'))
      reportRow(rows, '1c', 'Toggle cierra el mini desde la app',
        closed ? 'OK' : 'BUG')
    }
  }

  // ========================================================================
  // CLEANUP — Restaura ajustes iniciales
  // ========================================================================
  console.log('\n--- Cleanup ---')
  await win.evaluate((s) => window.api.settings.set({
    accentMode: 'fixed',
    bgMode: 'ambient',
    miniCorner: 'br',
    miniKaraoke: false,
    miniScale: 1,
    discordRpc: false,
    theme: s.theme,
    accent: s.accent
  }), initialSettings)
  await win.waitForTimeout(1200)
  const final = await win.evaluate(() => window.api.settings.get())
  console.log('  ajustes finales:', JSON.stringify({
    accentMode: final.accentMode,
    bgMode: final.bgMode,
    theme: final.theme,
    miniCorner: final.miniCorner,
    miniKaraoke: final.miniKaraoke,
    miniScale: final.miniScale,
    discordRpc: final.discordRpc
  }))

  // Escribir informe
  const okCount = rows.filter((r) => r.result === 'OK').length
  const bugCount = rows.filter((r) => r.result === 'BUG').length
  const warnCount = rows.filter((r) => r.result === 'WARN').length
  const dur = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(`\n=== RESUMEN === OK=${okCount} BUG=${bugCount} WARN=${warnCount} (${dur}s)`)

  // Vuelca resultado en JSON para el reporter
  writeFileSync(join(shots, '..', 'results.json'), JSON.stringify({
    rows, mainLog: mainLog.slice(-40), duration: dur, okCount, bugCount, warnCount, finalSettings: final
  }, null, 2))

  await app.close()
  process.exit(bugCount > 0 ? 1 : 0)
}

main().catch(async (err) => {
  console.error('QA FALLA:', err)
  writeFileSync(join(shots, '..', 'results.json'), JSON.stringify({
    rows, error: String(err?.stack ?? err), okCount: rows.filter((r) => r.result === 'OK').length,
    bugCount: rows.filter((r) => r.result === 'BUG').length
  }, null, 2))
  process.exit(2)
})
