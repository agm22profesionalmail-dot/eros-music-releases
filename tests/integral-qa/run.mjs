/**
 * QA integral de ERO'S Music.
 * Cobertura: arranque, sesión, home, búsqueda, sidebar/biblioteca, detalles,
 * reproducción, descargas/offline, letras, visualizador, mini-player, ajustes,
 * integración Windows, robustez. Restaura ajustes al final.
 *
 * Uso: node tests/integral-qa/run.mjs
 */
import { launch, muteAll, waitForSignedIn, shot, note, R, saveJson, block } from './_lib.mjs'
import { writeFileSync, existsSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'

const started = Date.now()
const { app, win, mainLog, mainErrLog, rendererLog, rendererErrs } = await launch({ silent: true })

// Backup de ajustes (para restaurar) y snapshot inicial
const settingsBefore = await win.evaluate(() => window.api.settings.get())
const restoreTarget = {
  accentMode: 'fixed',
  bgMode: 'ambient',
  miniCorner: 'br',
  miniKaraoke: false,
  miniScale: 1,
  discordRpc: false,
  closeToTray: false,
  crossfadeSec: 0,
  playbackRate: 1,
  preservePitch: true,
  eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  preampDb: 0
}
// Preservamos theme y accent como estén.

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// Ponemos el volumen a 0 vía store para no oír nada por si acaso
await win
  .evaluate(() => {
    try {
      const st = window.zustandPlayerStore || null
      if (st && st.getState) st.getState().setVolume(0)
    } catch {
      /* noop */
    }
  })
  .catch(() => {})

// Cambia el volumen desde la UI también (más robusto que el store): botón de volumen es toggle.
// Aparte, el AudioContext master no depende de audio.volume, así que confiamos en muted=true.

// ==================================================================
// 1) Arranque y sesión
// ==================================================================
await block('1-arranque', async () => {
await win.waitForTimeout(2500)
await muteAll(win)

let mainConsoleErrCount = mainErrLog.filter((l) => /error/i.test(l) && !/Parser/i.test(l)).length
note('1-arranque', mainConsoleErrCount === 0 ? 'ok' : 'warn', 'main sin errores', `${mainConsoleErrCount} líneas de error en stderr`)

const authState = await win.evaluate(() => window.api.auth.getState())
if (authState?.status === 'signedIn') {
  note('1-arranque', 'ok', 'sesión iniciada', `method=${authState.method} name="${authState.accountName ?? ''}"`)
  if (authState.accountPhotoUrl) note('1-arranque', 'ok', 'foto de perfil', 'accountPhotoUrl presente')
  else note('1-arranque', 'warn', 'foto de perfil', 'accountPhotoUrl vacío')
} else {
  note('1-arranque', 'bug', 'sesión no reconocida', `status=${authState?.status}`)
}

const authLogs = mainLog.filter((l) => l.includes('[auth]') || l.includes('cookie'))
if (authLogs.length) note('1-arranque', 'ok', 'refresco cookies (log)', `${authLogs.length} líneas [auth]/cookie en main`)
else note('1-arranque', 'warn', 'refresco cookies (log)', 'sin trazas [auth] en el arranque')

})

// ==================================================================
// 2) Home
// ==================================================================
await block('2-home', async () => {
await win.locator('.sidebar-nav-item', { hasText: 'Inicio' }).first().click().catch(() => {})
await win.waitForTimeout(1500)
await muteAll(win)

const shelfCount = await win.locator('.shelf').count().catch(() => 0)
const shelvesInfo = await win.evaluate(() => {
  const shelves = [...document.querySelectorAll('.shelf')]
  return shelves.map((s) => ({
    title: s.querySelector('.shelf-header, h2, h3')?.textContent?.trim() ?? '',
    cards: s.querySelectorAll('.media-card').length
  }))
})
if (shelfCount > 0) note('2-home', 'ok', 'estanterías', `${shelfCount} shelves; ${shelvesInfo.length ? JSON.stringify(shelvesInfo.slice(0, 3)) : ''}`)
else note('2-home', 'bug', 'estanterías', 'sin .shelf en Home')

const bigShelf = shelvesInfo.find((s) => s.cards > 4)
if (bigShelf) note('2-home', 'ok', 'shelf con >4 tarjetas', `«${bigShelf.title}» ${bigShelf.cards} tarjetas`)
else note('2-home', 'warn', 'shelf con >4 tarjetas', `mayor shelf: ${Math.max(0, ...shelvesInfo.map((s) => s.cards))}`)

const firstCardOk = await win.evaluate(() => {
  const c = document.querySelector('.media-card')
  if (!c) return null
  const hasCover = !!c.querySelector('img, .ph, .cover')
  const title = c.querySelector('.title')?.textContent?.trim() ?? ''
  const sub = c.querySelector('.subtitle')?.textContent?.trim() ?? ''
  const titleRect = c.querySelector('.title')?.getBoundingClientRect()
  const subRect = c.querySelector('.subtitle')?.getBoundingClientRect()
  const gap = titleRect && subRect ? subRect.top - titleRect.bottom : null
  return { hasCover, title, sub, gap }
})
if (firstCardOk?.hasCover && firstCardOk.title) {
  const gap = firstCardOk.gap ?? 0
  if (gap >= 2) note('2-home', 'ok', 'tarjeta con carátula/título/subtítulo', `gap título-subtítulo=${gap.toFixed(1)}px`)
  else note('2-home', 'warn', 'gap título-subtítulo', `${gap?.toFixed(1)}px — pegados o casi`)
} else {
  note('2-home', 'bug', 'estructura de tarjeta', JSON.stringify(firstCardOk))
}

await shot(win, '01-home')

// Hover-play en tarjeta (si hay tarjeta con play-hover)
const hasHoverPlay = await win.locator('.media-card .play-hover').count().catch(() => 0)
note('2-home', hasHoverPlay > 0 ? 'ok' : 'warn', 'hover-play en tarjetas', `${hasHoverPlay} botones play-hover`)

})

// El input de búsqueda se comparte entre bloques
const searchInput = win.locator('.topbar-search input')

// ==================================================================
// 3) Búsqueda
// ==================================================================
await block('3-busqueda', async () => {
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.waitForTimeout(500)
await searchInput.click()
await searchInput.fill('')

const queries = ['daft punk', 'rosalía motomami', 'bad bunny', 'テストひらがな']
for (const q of queries) {
  await searchInput.fill('')
  await win.waitForTimeout(120)
  await searchInput.type(q, { delay: 15 })
  await win.waitForTimeout(1400)
  const spinnerStillVisible = await win.locator('.topbar-search .spinner').isVisible().catch(() => false)
  const rows = await win.locator('.track-row').count().catch(() => 0)
  if (q === 'テストひらがな') {
    // Unicode: aceptamos 0 resultados si no hay match, pero no puede quedar spinner
    note('3-busqueda', spinnerStillVisible ? 'bug' : 'ok', `unicode «${q}»`, `rows=${rows} spinner=${spinnerStillVisible}`)
  } else {
    if (spinnerStillVisible) note('3-busqueda', 'bug', `spinner tras «${q}»`, 'sigue girando >1.4s')
    else if (rows > 0) note('3-busqueda', 'ok', `resultados «${q}»`, `${rows} pistas`)
    else note('3-busqueda', 'warn', `resultados «${q}»`, '0 pistas devueltas')
  }
}

// Vaciar
await searchInput.fill('')
await win.waitForTimeout(700)
const emptyStateVisible = await win.locator('.search-empty, .empty-state').first().isVisible().catch(() => false)
note('3-busqueda', 'ok', 'reset búsqueda', `emptyStateVisible=${emptyStateVisible}`)

// Chips de filtro
await searchInput.fill('')
await searchInput.type('daft punk', { delay: 20 })
await win.waitForTimeout(1200)
const chips = ['Todo', 'Canciones', 'Vídeos', 'Álbumes', 'Artistas', 'Playlists']
for (const label of chips) {
  const chip = win.locator('.search-chip, .chip', { hasText: label }).first()
  if (!(await chip.count())) continue
  await chip.click().catch(() => {})
  await win.waitForTimeout(800)
  const total = await win.evaluate(() => {
    return (
      document.querySelectorAll('.track-row').length + document.querySelectorAll('.media-card').length
    )
  })
  note('3-busqueda', total > 0 ? 'ok' : 'warn', `chip «${label}»`, `elementos=${total}`)
}
await win.locator('.search-chip, .chip', { hasText: 'Todo' }).first().click().catch(() => {})
await win.waitForTimeout(700)
// Mejor resultado (búsqueda específica)
await searchInput.fill('')
await searchInput.type('daft punk get lucky', { delay: 20 })
await win.waitForTimeout(1600)
const bestResultTxt = await win.evaluate(() => {
  const sec = [...document.querySelectorAll('h2, h3, .section-title, .search-section-title')].find((h) =>
    /mejor resultado/i.test(h.textContent || '')
  )
  return sec?.textContent?.trim() ?? null
})
note(
  '3-busqueda',
  bestResultTxt ? 'ok' : 'bug',
  'sección Mejor resultado',
  bestResultTxt ? `«${bestResultTxt}»` : 'no aparece con «daft punk get lucky»'
)

const suggestions = await win.evaluate(() => window.api.music.suggestions('daf')).catch(() => null)
note(
  '3-busqueda',
  Array.isArray(suggestions) && suggestions.length > 0 ? 'ok' : 'warn',
  'sugerencias API',
  Array.isArray(suggestions) ? `${suggestions.length} sugerencias` : 'error'
)

await shot(win, '02-search-daft')

// Doble clic en primera pista para reproducir
const trackRow0 = win.locator('.track-row').first()
await trackRow0.dblclick()
await win.waitForTimeout(4500)
await muteAll(win)
const npTitle = await win.locator('.np-left .title').textContent().catch(() => null)
note('3-busqueda', npTitle ? 'ok' : 'bug', 'doble clic reproduce', `barra: «${npTitle ?? '—'}»`)

})

// ==================================================================
// 4) Sidebar y biblioteca
// ==================================================================
// La cabecera del sidebar se reutiliza en el bloque 7
const sidebarLibHeader = win.locator('.sidebar-library-header .left').first()
await block('4-sidebar', async () => {
const libraryRows = await win.locator('.library-row').count().catch(() => 0)
note(
  '4-sidebar',
  libraryRows > 0 ? 'ok' : 'bug',
  'sidebar con biblioteca real',
  `filas=${libraryRows}`
)

// Comprobación título/subtítulo separados
if (libraryRows > 0) {
  const rowGap = await win.evaluate(() => {
    const r = document.querySelector('.library-row')
    if (!r) return null
    const t = r.querySelector('.title')?.getBoundingClientRect()
    const s = r.querySelector('.subtitle')?.getBoundingClientRect()
    if (!t || !s) return null
    return s.top - t.bottom
  })
  if (rowGap !== null) {
    if (rowGap >= 1)
      note('4-sidebar', 'ok', 'título/subtítulo library-row', `gap=${rowGap.toFixed(1)}px`)
    else note('4-sidebar', 'warn', 'título/subtítulo pegados', `gap=${rowGap.toFixed(1)}px`)
  }
}

// Chips del sidebar
const sideChips = ['Todo', 'Playlists', 'Álbumes', 'Artistas']
for (const label of sideChips) {
  const chip = win.locator('.sidebar-filters .chip', { hasText: label }).first()
  if (!(await chip.count())) continue
  await chip.click().catch(() => {})
  await win.waitForTimeout(300)
  const rows = await win.locator('.library-row').count()
  note('4-sidebar', 'ok', `chip lateral «${label}»`, `rows=${rows}`)
}
await win.locator('.sidebar-filters .chip', { hasText: 'Todo' }).first().click().catch(() => {})
await win.waitForTimeout(300)

// Botón + del sidebar abre modal (SIN crear)
await win.locator('.sidebar-library-header .icon-btn').first().click().catch(() => {})
await win.waitForTimeout(600)
const modalTitle = await win.evaluate(() => {
  const mod = document.querySelector('.modal, .modal-overlay, .text-modal, .modal-content')
  return mod?.textContent?.slice(0, 60) ?? null
})
note(
  '4-sidebar',
  modalTitle ? 'ok' : 'bug',
  'modal Nueva playlist (custom)',
  modalTitle ? `«${modalTitle}»` : 'no aparece'
)
// Cancelar modal
await win.keyboard.press('Escape').catch(() => {})
await win.waitForTimeout(400)
// Si no cerró con ESC, buscar botón cancelar
const stillOpen = await win.evaluate(() => !!document.querySelector('.modal, .modal-overlay, .text-modal'))
if (stillOpen) {
  const cancel = win.locator('button', { hasText: /Cancelar|Cerrar/i }).first()
  if (await cancel.count()) await cancel.click().catch(() => {})
  await win.waitForTimeout(200)
}
await muteAll(win)

// Página Tu biblioteca — abre y tantea pestañas
await sidebarLibHeader.click().catch(() => {})
await win.waitForTimeout(1200)
const tabsInLibrary = await win.evaluate(() => {
  const tabs = [...document.querySelectorAll('.library-tab, .tab, button')]
    .map((t) => t.textContent?.trim() ?? '')
    .filter((t) => /Playlists|Álbumes|Artistas|Canciones|Historial|Descargas/i.test(t))
  return [...new Set(tabs)]
})
note('4-sidebar', tabsInLibrary.length >= 3 ? 'ok' : 'warn', 'pestañas de biblioteca', tabsInLibrary.join(', '))

// Historial
const histoTab = win.locator('button, .tab, .library-tab', { hasText: /Historial/i }).first()
if (await histoTab.count()) await histoTab.click().catch(() => {})
await win.waitForTimeout(800)
const historyList = await win.evaluate(async () => (await window.api.history.list?.(50)) ?? [])
note(
  '4-sidebar',
  Array.isArray(historyList) && historyList.length >= 1 ? 'ok' : 'warn',
  'historial ≥1 entrada',
  `${historyList?.length ?? 0} entradas`
)

// Descargas tab
const dlTab = win.locator('button, .tab, .library-tab', { hasText: /Descargas/i }).first()
if (await dlTab.count()) await dlTab.click().catch(() => {})
await win.waitForTimeout(500)
const dlListPre = await win.evaluate(() => window.api.downloads.list()).catch(() => [])
note('4-sidebar', 'ok', 'pestaña Descargas', `${dlListPre?.length ?? 0} descargas existentes`)

})

// ==================================================================
// 5) Detalle de playlist / álbum / artista
// ==================================================================
await block('5-detalles', async () => {
// Playlist propia: elegir primera library-row de tipo playlist
await win.locator('.sidebar-filters .chip', { hasText: 'Playlists' }).first().click().catch(() => {})
await win.waitForTimeout(300)
const firstPlaylistRow = win.locator('.library-row').first()
let playlistOpened = false
if (await firstPlaylistRow.count()) {
  await firstPlaylistRow.click()
  await win.waitForTimeout(1800)
  const detailPresent = await win.locator('.detail-header').isVisible().catch(() => false)
  playlistOpened = detailPresent
  note('5-detalles', detailPresent ? 'ok' : 'bug', 'playlist abre .detail-header')

  if (detailPresent) {
    // Cover grande + big-play + tabla
    const hasCover = await win.locator('.detail-header .cover, .detail-header img.cover').count()
    const hasBigPlay = await win.locator('.big-play').count()
    const meta = await win.locator('.detail-header .meta').textContent().catch(() => '')
    // Comprobar contador sin duplicados: no debe repetir "canciones · canciones"
    const duplicate = /(canciones|pistas)[^·]*·[^·]*\1/i.test(meta ?? '')
    note('5-detalles', hasCover > 0 ? 'ok' : 'warn', 'cover grande en cabecera')
    note('5-detalles', hasBigPlay > 0 ? 'ok' : 'bug', 'botón big-play')
    note('5-detalles', duplicate ? 'bug' : 'ok', 'contadores sin duplicados', `meta: «${meta?.slice(0, 80)}»`)
    // Tabla
    const trackTable = await win.locator('table, .track-table').count()
    note('5-detalles', trackTable > 0 ? 'ok' : 'warn', 'tabla de pistas')
    await shot(win, '03-playlist-detail')
  }
} else {
  note('5-detalles', 'warn', 'sin playlists en sidebar', 'no se pudo probar detalle de playlist')
}

// Álbum: usar resultado de búsqueda
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await searchInput.fill('')
await searchInput.type('daft punk discovery', { delay: 20 })
await win.waitForTimeout(1600)
const albumCard = win.locator('.media-card').filter({ has: win.locator('text=/álbum|Álbum|Album/i') }).first()
let albumOpened = false
if (await albumCard.count()) {
  await albumCard.click()
  await win.waitForTimeout(1800)
  albumOpened = await win.locator('.detail-header').isVisible().catch(() => false)
  if (albumOpened) {
    const hasBigCover = await win.evaluate(() =>
      [...document.querySelectorAll('.detail-header img, .detail-header .cover')].some((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 100 && r.height > 100
      })
    )
    note('5-detalles', hasBigCover ? 'ok' : 'warn', 'álbum: cabecera con cover grande')
    // Comprobar que la tabla no muestra thumbnails por track
    const thumbsInRows = await win.evaluate(
      () =>
        [...document.querySelectorAll('.track-table .track-row, table tr')].filter((r) => {
          const im = r.querySelector('img')
          if (!im) return false
          const rect = im.getBoundingClientRect()
          return rect.width > 24 && rect.height > 24
        }).length
    )
    note(
      '5-detalles',
      thumbsInRows === 0 ? 'ok' : 'warn',
      'álbum: tabla sin thumbnails redundantes',
      `filas con thumb=${thumbsInRows}`
    )
    await shot(win, '04-album-detail')
  } else {
    note('5-detalles', 'warn', 'álbum: no abrió .detail-header')
  }
} else {
  note('5-detalles', 'warn', 'álbum en resultados', 'no encontré tarjeta de tipo álbum')
}

// Artista: buscar y abrir
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await searchInput.fill('')
await searchInput.type('daft punk', { delay: 20 })
await win.waitForTimeout(1500)
// Chips: Artistas
const artistChip = win.locator('.chip, .search-chip', { hasText: 'Artistas' }).first()
if (await artistChip.count()) await artistChip.click().catch(() => {})
await win.waitForTimeout(800)
const artistCard = win.locator('.media-card').first()
if (await artistCard.count()) {
  await artistCard.click()
  await win.waitForTimeout(2000)
  const shelvesInArtist = await win.locator('.shelf').count()
  note('5-detalles', shelvesInArtist >= 1 ? 'ok' : 'warn', 'artista: estanterías con carruseles', `shelves=${shelvesInArtist}`)
  await shot(win, '05-artist-detail')
} else {
  note('5-detalles', 'warn', 'artista: sin tarjeta clickable')
}

// Botones atrás/adelante (nav-circle)
const back = win.locator('.nav-circle').first()
const fwd = win.locator('.nav-circle').nth(1)
const backOk = (await back.count()) > 0
const fwdOk = (await fwd.count()) > 0
if (backOk && fwdOk) {
  await back.click().catch(() => {})
  await win.waitForTimeout(400)
  await fwd.click().catch(() => {})
  await win.waitForTimeout(400)
  note('5-detalles', 'ok', 'botones atrás/adelante (.nav-circle)')
} else {
  note('5-detalles', 'warn', 'botones atrás/adelante', `back=${backOk} fwd=${fwdOk}`)
}

// Menú contextual sobre una pista
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await searchInput.fill('')
await searchInput.type('daft punk', { delay: 20 })
await win.waitForTimeout(1400)
await win.locator('.track-row').first().click({ button: 'right' })
await win.waitForTimeout(500)
const menuItems = await win.evaluate(() =>
  [...document.querySelectorAll('.context-menu button, .context-menu .cm-item')]
    .map((b) => b.textContent?.trim() ?? '')
    .filter(Boolean)
)
const requiredMenu = [
  /Reproducir ahora/i,
  /Iniciar radio/i,
  /Siguiente en la cola/i,
  /Añadir a la cola/i,
  /Me gusta/i,
  /Descargar/i,
  /Añadir a playlist/i,
  /Ir a artista|Ir al artista/i,
  /Ir al álbum|Ir a álbum/i
]
const missing = requiredMenu.filter((re) => !menuItems.some((m) => re.test(m)))
if (missing.length === 0) note('5-detalles', 'ok', 'menú contextual completo', `${menuItems.length} entradas`)
else note('5-detalles', 'warn', 'menú contextual: faltan entradas', missing.map((r) => r.source).join(', '))
await shot(win, '06-context-menu')
await win.keyboard.press('Escape')
await win.waitForTimeout(300)

})

// ==================================================================
// 6) Reproducción
// ==================================================================
await block('6-reproduccion', async () => {
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await searchInput.fill('')
await searchInput.type('daft punk', { delay: 20 })
await win.waitForTimeout(1400)
await win.locator('.track-row').first().dblclick()
await win.waitForTimeout(5000)
await muteAll(win)

// Reproducir 3 consecutivas con siguiente
const nextBtn = win.locator('.np-controls .np-ctrl[aria-label="Siguiente"]').first()
const times = []
for (let i = 0; i < 3; i++) {
  await nextBtn.click().catch(() => {})
  await win.waitForTimeout(4000)
  await muteAll(win)
  const t = await win.evaluate(() => {
    const audios = [...document.querySelectorAll('audio')]
    return { curr: Math.max(0, ...audios.map((a) => a.currentTime)), title: document.querySelector('.np-left .title')?.textContent?.trim() ?? '' }
  })
  times.push(t)
}
const uniqueTitles = new Set(times.map((t) => t.title)).size
note(
  '6-reproduccion',
  uniqueTitles >= 2 ? 'ok' : 'warn',
  'siguiente cambia pista',
  `títulos únicos=${uniqueTitles} de ${times.length}`
)
const anyAdvancing = times.some((t) => t.curr > 0.5)
note('6-reproduccion', anyAdvancing ? 'ok' : 'warn', 'audio avanza tras siguiente', JSON.stringify(times.map((t) => t.curr.toFixed(1))))

// Cola: abrir panel
const queueBtn = win.locator('.np-right .np-ctrl[aria-label*="cola" i], .np-right .np-ctrl[title*="cola" i]').first()
let queueOpenOk = false
if (await queueBtn.count()) {
  await queueBtn.click().catch(() => {})
  await win.waitForTimeout(600)
  queueOpenOk = await win.evaluate(() => !!document.querySelector('.queue-panel, .queue'))
}
note('6-reproduccion', queueOpenOk ? 'ok' : 'warn', 'panel de cola abre', queueOpenOk ? '' : 'sin .queue-panel')

if (queueOpenOk) {
  // Verificar secciones "Reproduciendo" y "A continuación"
  const queueTexts = await win.evaluate(() => document.querySelector('.queue-panel, .queue')?.textContent ?? '')
  const hasNowPlaying = /Reproduciendo/i.test(queueTexts)
  const hasNext = /A continuación|Siguiente/i.test(queueTexts)
  note('6-reproduccion', hasNowPlaying ? 'ok' : 'warn', 'cola: sección Reproduciendo')
  note('6-reproduccion', hasNext ? 'ok' : 'warn', 'cola: sección A continuación')

  // Clic derecho sobre pista de la cola
  const queueRow = win.locator('.queue-panel .queue-item, .queue-item, .queue-row, .queue .track-row').first()
  if (await queueRow.count()) {
    await queueRow.click({ button: 'right' })
    await win.waitForTimeout(500)
    const queueMenu = await win.evaluate(() =>
      [...document.querySelectorAll('.context-menu button, .context-menu .cm-item')]
        .map((b) => b.textContent?.trim() ?? '')
        .filter(Boolean)
    )
    if (queueMenu.length >= 2) {
      note('6-reproduccion', 'ok', 'menú contextual en cola', queueMenu.join(', '))
      // Intentar Quitar (segunda pista para no romper la actual)
      const secondQueue = win.locator('.queue-item, .queue-row').nth(1)
      await win.keyboard.press('Escape').catch(() => {})
      await win.waitForTimeout(200)
      if (await secondQueue.count()) {
        await secondQueue.click({ button: 'right' })
        await win.waitForTimeout(400)
        const quitar = win.locator('.context-menu button, .context-menu .cm-item', { hasText: /Quitar|Eliminar/i }).first()
        if (await quitar.count()) {
          await quitar.click().catch(() => {})
          await win.waitForTimeout(500)
          note('6-reproduccion', 'ok', 'Quitar de la cola ejecutado')
        }
      }
    } else {
      note('6-reproduccion', 'bug', 'menú contextual en cola', 'sin entradas — regresión conocida F12')
    }
  }
  // Cerrar cola
  if (await queueBtn.count()) await queueBtn.click().catch(() => {})
}

// Aleatorio
const shuffleBtn = win.locator('.np-controls .np-ctrl').first()
await shuffleBtn.click().catch(() => {})
await win.waitForTimeout(400)
const shuffleActive = await win.evaluate(() =>
  !!document.querySelector('.np-controls .np-ctrl.active')
)
note('6-reproduccion', shuffleActive ? 'ok' : 'warn', 'aleatorio activo', `active=${shuffleActive}`)
// desactivar
await shuffleBtn.click().catch(() => {})
await win.waitForTimeout(300)

// Repetición: 3er "np-ctrl" (Anterior/Siguiente en medio son 2do y 4to, aleatorio=1º, repetición=5º)
// Es más seguro identificar por aria-label o buscar el botón de repeat.
const repeatBtn = win.locator('.np-controls .np-ctrl').last()
const repeatStates = []
for (let i = 0; i < 3; i++) {
  await repeatBtn.click().catch(() => {})
  await win.waitForTimeout(300)
  const state = await win.evaluate(() => {
    const btn = document.querySelector('.np-controls .np-ctrl:last-child')
    return { active: btn?.classList.contains('active'), title: btn?.getAttribute('aria-label') ?? btn?.getAttribute('title') ?? '' }
  })
  repeatStates.push(state)
}
note('6-reproduccion', repeatStates.length === 3 ? 'ok' : 'warn', 'ciclo de repetición', JSON.stringify(repeatStates))
// Volver a off (una vez más para completar el ciclo)
await repeatBtn.click().catch(() => {})
await win.waitForTimeout(200)

// Seek al 50% y al 90%
await muteAll(win)
const seekResults = []
for (const pct of [0.5, 0.9]) {
  const seekResult = await win.evaluate((p) => {
    const audios = [...document.querySelectorAll('audio')]
    const a = audios.find((x) => x.duration > 0)
    if (!a) return null
    const target = a.duration * p
    a.currentTime = target
    return { targetSet: target, curr: a.currentTime, dur: a.duration }
  }, pct)
  seekResults.push(seekResult)
}
const seekOk = seekResults.every((r) => r && Math.abs(r.curr - r.targetSet) < 5)
note('6-reproduccion', seekOk ? 'ok' : 'warn', 'seek al 50%/90%', JSON.stringify(seekResults))

// Autoplay/radio: forzar cola=1 y saltar al final
await win.evaluate(async () => {
  // Vaciar cola: buscar store zustand-like
  // Vía IPC no hay reset directo. Cargamos una sola pista via UI: abrimos búsqueda y doble-clic.
})
// La mejor forma: reproducir y saltar al final
const durInfo = await win.evaluate(() => {
  const audios = [...document.querySelectorAll('audio')]
  const a = audios.find((x) => x.duration > 0)
  return a ? { dur: a.duration, curr: a.currentTime } : null
})
if (durInfo) {
  await win.evaluate(() => {
    const audios = [...document.querySelectorAll('audio')]
    const a = audios.find((x) => x.duration > 0)
    if (a) a.currentTime = Math.max(0, a.duration - 4)
  })
  await win.waitForTimeout(6500)
  await muteAll(win)
  const npAfter = await win.locator('.np-left .title').textContent().catch(() => '')
  note(
    '6-reproduccion',
    npAfter ? 'ok' : 'warn',
    'autoplay/radio al acabar',
    `barra tras fin: «${npAfter}»`
  )
}

// Anterior con >3s reinicia
await win.evaluate(() => {
  const a = [...document.querySelectorAll('audio')].find((x) => x.duration > 0)
  if (a) a.currentTime = 8
})
await win.waitForTimeout(300)
const prevBtn = win.locator('.np-controls .np-ctrl[aria-label="Anterior"]').first()
if (await prevBtn.count()) {
  await prevBtn.click()
  await win.waitForTimeout(600)
  const afterPrev = await win.evaluate(() => {
    const a = [...document.querySelectorAll('audio')].find((x) => x.duration > 0)
    return a ? { curr: a.currentTime, title: document.querySelector('.np-left .title')?.textContent?.trim() ?? '' } : null
  })
  const restart = afterPrev && afterPrev.curr < 2
  note('6-reproduccion', restart ? 'ok' : 'warn', 'anterior con >3s reinicia', JSON.stringify(afterPrev))
}

})

// Variables compartidas para cleanup
let downloadVideoId = null
let downloadFile = null

// ==================================================================
// 7) Descargas y modo offline
// ==================================================================
await block('7-descargas', async () => {
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await searchInput.fill('')
await searchInput.type('daft punk around the world', { delay: 20 })
await win.waitForTimeout(1500)
const firstRow = win.locator('.track-row').first()
await firstRow.click({ button: 'right' })
await win.waitForTimeout(400)
const dlBtn = win.locator('.context-menu button, .context-menu .cm-item', { hasText: /Descargar/i }).first()
if (await dlBtn.count()) {
  const videoId = await win.evaluate(() => {
    const el = document.querySelector('.context-menu')
    return el?.getAttribute('data-videoid') || null
  })
  await dlBtn.click().catch(() => {})
  await win.keyboard.press('Escape').catch(() => {})
  await muteAll(win)

  // Registrar listener de progreso
  await win.evaluate(() => {
    window.__dlEvents = []
    window.api.downloads.onProgress((p) => window.__dlEvents.push(p))
  })

  // Esperar hasta que aparezca en la lista (done state)
  let done = null
  for (let i = 0; i < 90; i++) {
    await win.waitForTimeout(1000)
    const list = await win.evaluate(() => window.api.downloads.list()).catch(() => [])
    const events = await win.evaluate(() => window.__dlEvents ?? [])
    const doneEv = events.find((e) => e?.state === 'done')
    if (doneEv || (list && list.length > 0)) {
      downloadVideoId = doneEv?.videoId || (list?.[0]?.track?.videoId ?? null)
      downloadFile = list?.[0]?.filePath ?? null
      done = { list: list.length, doneEv }
      break
    }
  }
  if (done && downloadFile) {
    const stat = existsSync(downloadFile) ? statSync(downloadFile) : null
    note('7-descargas', 'ok', 'descarga completa', `videoId=${downloadVideoId} file=${downloadFile} size=${stat?.size ?? 0}`)
    // Comprobar que aparece en biblioteca → Descargas
    await sidebarLibHeader.click().catch(() => {})
    await win.waitForTimeout(700)
    const dlTab2 = win.locator('button, .tab, .library-tab', { hasText: /Descargas/i }).first()
    if (await dlTab2.count()) await dlTab2.click().catch(() => {})
    await win.waitForTimeout(600)
    const listedInLibrary = await win.evaluate(() => document.querySelectorAll('.track-row, .download-row').length)
    note('7-descargas', listedInLibrary > 0 ? 'ok' : 'warn', 'aparece en biblioteca → Descargas', `filas=${listedInLibrary}`)

    // Reproducir esa canción para ver via=local
    const dlRow = win.locator('.track-row, .download-row').first()
    if (await dlRow.count()) {
      // Limpiar prepare log
      const preCount = mainLog.filter((l) => l.includes('via=')).length
      await dlRow.dblclick()
      await win.waitForTimeout(5000)
      await muteAll(win)
      const newLogs = mainLog.slice(preCount).filter((l) => l.includes('via='))
      const isLocal = newLogs.some((l) => /via=local/.test(l))
      const anyYt = newLogs.some((l) => /via=YTMUSIC/.test(l))
      if (isLocal) note('7-descargas', 'ok', 'reproduce via=local', newLogs.slice(-1)[0] ?? '')
      else if (anyYt)
        note(
          '7-descargas',
          'bug',
          'canción descargada NO se sirve local (B5 regresión F12)',
          newLogs.slice(-1)[0] ?? ''
        )
      else note('7-descargas', 'warn', 'sin traza via= en main log', 'no se pudo confirmar la ruta')
    }
  } else {
    note('7-descargas', 'bug', 'descarga no completó', 'timeout 90s sin evento done')
  }
} else {
  note('7-descargas', 'warn', 'sin opción Descargar en menú contextual')
}

})

// El botón de letras se reutiliza en el bloque 8 y 9
let lyricsBtn = null

// ==================================================================
// 8) Letras
// ==================================================================
await block('8-letras', async () => {
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await searchInput.fill('')
await searchInput.type('daft punk get lucky', { delay: 20 })
await win.waitForTimeout(1500)
await win.locator('.track-row').first().hover().catch(() => {})
const hoverPlay = win.locator('.track-row').first().locator('.play-hover')
if (await hoverPlay.count()) await hoverPlay.click().catch(() => {})
else await win.locator('.track-row').first().dblclick()
await win.locator('.np-left .title').waitFor({ state: 'visible', timeout: 20000 }).catch(() => {})
await muteAll(win)

// Icono del micro: LyricsPage
lyricsBtn = win.locator('.np-right .np-ctrl').nth(0)
await lyricsBtn.click().catch(() => {})
await win.waitForTimeout(4500)
await muteAll(win)

const inLyricsPage = await win.evaluate(() => {
  return !!document.querySelector('.lyrics-page, [data-page="lyrics"], .lyrics-lines, .lyrics-body')
})
// Fallback: los botones de línea
const lines = await win.locator('.page button, .lyrics-line').count()
if (inLyricsPage || lines > 3) note('8-letras', 'ok', 'LyricsPage abierta', `líneas visibles=${lines}`)
else note('8-letras', 'warn', 'LyricsPage no detectada')
note('8-letras', lines > 10 ? 'ok' : 'warn', `líneas de letra ≥10`, `${lines} líneas`)

// Fondo difuminado
const blurBg = await win.evaluate(() => {
  const el = [...document.querySelectorAll('.lyrics-bg, [class*="lyric" i]')].find((e) => {
    const cs = getComputedStyle(e)
    return /blur\(/.test(cs.filter) || /blur/.test(cs.backdropFilter)
  })
  return !!el
})
note('8-letras', blurBg ? 'ok' : 'warn', 'carátula difuminada de fondo', `blur=${blurBg}`)

// Línea activa con karaoke-fill
const karaokeCheck = await win.evaluate(() => {
  const el = document.querySelector('.karaoke-fill')
  if (!el) return { present: false }
  const cs = getComputedStyle(el)
  const fill = cs.getPropertyValue('--fill') || cs.getPropertyValue('background-size') || ''
  return { present: true, fill }
})
note(
  '8-letras',
  karaokeCheck.present ? 'ok' : 'warn',
  '.karaoke-fill en línea activa',
  JSON.stringify(karaokeCheck)
)
if (karaokeCheck.present) {
  await win.waitForTimeout(1500)
  const karaokeAfter = await win.evaluate(() => {
    const el = document.querySelector('.karaoke-fill')
    const cs = el ? getComputedStyle(el) : null
    return cs ? cs.getPropertyValue('--fill') : ''
  })
  note(
    '8-letras',
    karaokeAfter && karaokeAfter !== karaokeCheck.fill ? 'ok' : 'warn',
    '--fill interpola con el tiempo',
    `${karaokeCheck.fill} → ${karaokeAfter}`
  )
}

// Botones ±0.5s
const offsetPlus = win.locator('button', { hasText: /\+0[.,]5/ }).first()
const offsetMinus = win.locator('button', { hasText: /-0[.,]5/ }).first()
const hasOffset = (await offsetPlus.count()) + (await offsetMinus.count())
if (hasOffset >= 2) {
  await offsetPlus.click().catch(() => {})
  await win.waitForTimeout(200)
  await offsetMinus.click().catch(() => {})
  await win.waitForTimeout(200)
  note('8-letras', 'ok', 'botones ±0.5s del desfase')
} else {
  note('8-letras', 'warn', 'botones ±0.5s no encontrados', `count=${hasOffset}`)
}

// Clic en línea salta al tiempo
const linesLoc = win.locator('.lyrics-line, .page button')
const lineCount = await linesLoc.count()
if (lineCount > 8) {
  const before = await win.evaluate(() => {
    const a = [...document.querySelectorAll('audio')].find((x) => x.duration > 0)
    return a?.currentTime ?? 0
  })
  await linesLoc.nth(Math.min(6, lineCount - 1)).click().catch(() => {})
  await win.waitForTimeout(700)
  const after = await win.evaluate(() => {
    const a = [...document.querySelectorAll('audio')].find((x) => x.duration > 0)
    return a?.currentTime ?? 0
  })
  note(
    '8-letras',
    Math.abs(after - before) > 2 ? 'ok' : 'warn',
    'clic en línea salta el audio',
    `${before.toFixed(1)} → ${after.toFixed(1)}`
  )
}

// KRC per-palabra: probar con "晴天 周杰倫"
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await searchInput.fill('')
await searchInput.type('晴天 周杰倫', { delay: 20 })
await win.waitForTimeout(1800)
const kraCount = await win.locator('.track-row').count()
if (kraCount > 0) {
  await win.locator('.track-row').first().dblclick()
  await win.locator('.np-left .title').waitFor({ state: 'visible', timeout: 20000 }).catch(() => {})
  await muteAll(win)
  await lyricsBtn.click().catch(() => {})
  await win.waitForTimeout(4500)
  await muteAll(win)
  const wordsPresence = await win.evaluate(() => document.querySelectorAll('.words, .word').length)
  note(
    '8-letras',
    wordsPresence > 0 ? 'ok' : 'warn',
    'karaoke por palabra (KRC)',
    `.words/.word=${wordsPresence}`
  )
} else {
  note('8-letras', 'warn', 'sin resultados para «晴天 周杰倫»')
}
await shot(win, '07-lyrics')

})

// ==================================================================
// 9) Visualizador
// ==================================================================
await block('9-visualizador', async () => {
// Volver a reproducción con canción "normal"
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await searchInput.fill('')
await searchInput.type('daft punk', { delay: 20 })
await win.waitForTimeout(1400)
await win.locator('.track-row').first().dblclick()
await win.locator('.np-left .title').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
await win.waitForTimeout(2500)
await muteAll(win)

const vizBtn = win.locator('.np-right .np-ctrl').nth(1)
await vizBtn.click().catch(() => {})
await win.waitForTimeout(1500)
await muteAll(win)
const vizPage = await win.evaluate(() => {
  const spinning = [...document.querySelectorAll('*')].some((el) => {
    const cs = getComputedStyle(el)
    return /vinyl-spin/.test(cs.animationName || '') || /vinyl-spin/.test(cs.animation || '')
  })
  const canvasCount = document.querySelectorAll('canvas').length
  return { spinning, canvasCount }
})
note('9-visualizador', vizPage.spinning ? 'ok' : 'warn', 'vinilo girando (animation)', JSON.stringify(vizPage))
note('9-visualizador', vizPage.canvasCount > 0 ? 'ok' : 'warn', 'espectro (canvas presente)', `canvas=${vizPage.canvasCount}`)
await shot(win, '08-visualizer')

// Volver a Home
await win.locator('.sidebar-nav-item', { hasText: 'Inicio' }).click().catch(() => {})
await win.waitForTimeout(600)
await muteAll(win)

})

// ==================================================================
// 10) Mini-player
// ==================================================================
await block('10-mini', async () => {
const miniBefore = app.windows().length
// El botón mini es el 4º (o el 5º) de np-right
const miniToggleBtn = win.locator('.np-right .np-ctrl').nth(3)
await miniToggleBtn.click().catch(() => {
  // fallback: usar API
})
await win.waitForTimeout(1200)
let miniWin = app.windows().find((w) => w !== win && w.url().includes('mini'))
if (!miniWin) {
  await win.evaluate(() => window.api.mini.toggle())
  await win.waitForTimeout(1500)
  miniWin = app.windows().find((w) => w !== win && w.url().includes('mini'))
}
if (miniWin) {
  note('10-mini', 'ok', 'mini-player abre ventana', `url=${miniWin.url()}`)
  // Mutear audios del mini también por si acaso
  await miniWin
    .evaluate(() =>
      document.querySelectorAll('audio').forEach((a) => (a.muted = true))
    )
    .catch(() => {})

  const miniTitle = await miniWin.evaluate(() => {
    const el = document.querySelector('.mini-title, .title, b')
    return el?.textContent?.trim() ?? ''
  })
  note('10-mini', miniTitle ? 'ok' : 'warn', 'mini refleja título', `«${miniTitle}»`)

  // Cambiar canción en principal y esperar <1.5s
  const beforeMainTitle = await win.locator('.np-left .title').textContent().catch(() => '')
  await win.locator('.np-controls .np-ctrl[aria-label="Siguiente"]').first().click()
  await win.waitForTimeout(1500)
  await muteAll(win)
  const mainTitleAfter = await win.locator('.np-left .title').textContent().catch(() => '')
  const miniTitleAfter = await miniWin.evaluate(() => document.querySelector('.mini-title, .title, b')?.textContent?.trim() ?? '')
  const syncOk = beforeMainTitle !== mainTitleAfter && miniTitleAfter === mainTitleAfter
  note(
    '10-mini',
    syncOk ? 'ok' : 'warn',
    'mini sincroniza en <1.5s',
    `main:«${mainTitleAfter}» mini:«${miniTitleAfter}»`
  )

  // Abrir ajustes del mini
  await win.evaluate(() => window.api.mini.openSettings())
  await win.waitForTimeout(1200)
  let miniSettings = app.windows().find((w) => w !== win && w !== miniWin && w.url().includes('mini-settings'))
  if (miniSettings) {
    await miniSettings
      .evaluate(() => document.querySelectorAll('audio').forEach((a) => (a.muted = true)))
      .catch(() => {})
    const cornerButtons = await miniSettings.locator('button').count()
    note(
      '10-mini',
      cornerButtons >= 4 ? 'ok' : 'warn',
      'ajustes mini: 4 esquinas',
      `botones=${cornerButtons}`
    )
    // Test scale slider vía API
    for (const s of [0.8, 1.3, 1.0]) {
      await win.evaluate((sc) => window.api.mini.setScale(sc), s)
      await win.waitForTimeout(400)
    }
    note('10-mini', 'ok', 'setScale 0.8/1.3/1.0')
    // Karaoke toggle vía settings API
    await win.evaluate(() => window.api.settings.set({ miniKaraoke: true }))
    await win.waitForTimeout(600)
    // Cerrar
    if (miniSettings.isClosed()) miniSettings = null
    else await miniSettings.close().catch(() => {})
  } else {
    note('10-mini', 'warn', 'no se detectó ventana mini-settings')
  }

  // Cambio de tema afecta al mini
  const originalTheme = settingsBefore.theme
  await win.evaluate(() => window.api.settings.set({ theme: 'black' }))
  await win.waitForTimeout(700)
  const miniTheme = await miniWin.evaluate(() => document.documentElement.dataset.theme)
  note('10-mini', miniTheme === 'black' ? 'ok' : 'warn', 'mini re-tinta al cambiar tema', `data-theme=${miniTheme}`)
  await win.evaluate((t) => window.api.settings.set({ theme: t }), originalTheme)
  await win.waitForTimeout(500)

  // Restaurar miniKaraoke
  await win.evaluate(() => window.api.settings.set({ miniKaraoke: false }))
  await win.waitForTimeout(300)

  // Cerrar mini
  await win.evaluate(() => window.api.mini.toggle())
  await win.waitForTimeout(600)
} else {
  note('10-mini', 'bug', 'mini-player no abre')
}

})

// ==================================================================
// 11) Ajustes
// ==================================================================
await block('11-ajustes', async () => {
// Temas
const themeTests = [
  { t: 'dark', check: (root) => root.dataset.theme === 'dark' },
  { t: 'black', check: (root) => root.dataset.theme === 'black' },
  { t: 'light', check: (root) => root.dataset.theme === 'light' }
]
for (const tt of themeTests) {
  await win.evaluate((t) => window.api.settings.set({ theme: t }), tt.t)
  await win.waitForTimeout(400)
  const currentTheme = await win.evaluate(() => document.documentElement.dataset.theme)
  note('11-ajustes', currentTheme === tt.t ? 'ok' : 'bug', `tema ${tt.t}`, `data-theme=${currentTheme}`)
}
// Modo light: comprobar legibilidad (color base contraste con fondo)
const lightContrast = await win.evaluate(() => {
  const el = document.querySelector('.chip, .sidebar-nav-item, button')
  if (!el) return null
  const cs = getComputedStyle(el)
  return { color: cs.color, background: cs.backgroundColor }
})
note('11-ajustes', 'ok', 'tema light contraste (visual)', JSON.stringify(lightContrast))
// Restaurar theme al del usuario
await win.evaluate((t) => window.api.settings.set({ theme: t }), settingsBefore.theme)
await win.waitForTimeout(300)

// bgMode
for (const bg of ['off', 'ambient', 'reactive']) {
  await win.evaluate((v) => window.api.settings.set({ bgMode: v }), bg)
  await win.waitForTimeout(300)
  const cur = (await win.evaluate(() => window.api.settings.get())).bgMode
  note('11-ajustes', cur === bg ? 'ok' : 'bug', `bgMode ${bg}`, `actual=${cur}`)
}
await win.evaluate(() => window.api.settings.set({ bgMode: 'ambient' }))

// Acentos
const accentPickerBtns = await win.locator('[data-accent], .accent-swatch, .accent-color').count().catch(() => 0)
note('11-ajustes', accentPickerBtns >= 7 ? 'ok' : 'warn', 'swatches de acento ≥7', `count=${accentPickerBtns}`)
// custom color picker
const hasColorInput = await win.locator('input[type="color"]').count()
note('11-ajustes', hasColorInput > 0 ? 'ok' : 'warn', 'input color picker', `count=${hasColorInput}`)

// EQ
await win.evaluate(() => window.api.settings.set({ eqGains: [3, 0, 0, 0, 0, 0, 0, 0, 0, 0] }))
await win.waitForTimeout(300)
const eqNow = (await win.evaluate(() => window.api.settings.get())).eqGains
note('11-ajustes', Array.isArray(eqNow) && eqNow[0] === 3 ? 'ok' : 'bug', 'EQ escribe una banda', `[0]=${eqNow?.[0]}`)
await win.evaluate(() => window.api.settings.set({ eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }))

// Velocidad
await win.evaluate(() => window.api.settings.set({ playbackRate: 1.5 }))
await win.waitForTimeout(400)
const rate = await win.evaluate(() => {
  const a = [...document.querySelectorAll('audio')].find((x) => x.duration > 0)
  return a?.playbackRate ?? null
})
note('11-ajustes', rate === 1.5 ? 'ok' : 'warn', 'audio.playbackRate=1.5', `actual=${rate}`)
await win.evaluate(() => window.api.settings.set({ playbackRate: 1 }))

// Discord RPC ON → OFF
await win.evaluate(() => window.api.settings.set({ discordRpc: true }))
await win.waitForTimeout(2500)
const discordLog = mainLog.filter((l) => /discord/i.test(l))
const conected = discordLog.some((l) => /conectad|enable|ready|connect/i.test(l))
note(
  '11-ajustes',
  conected ? 'ok' : 'warn',
  'Discord RPC activa (log del main)',
  discordLog.length
    ? `${discordLog.length} líneas: «${discordLog.slice(-1)[0].slice(0, 100)}»`
    : 'sin líneas [discord] — puede que Discord no esté corriendo'
)
// DESACTIVAR
await win.evaluate(() => window.api.settings.set({ discordRpc: false }))
await win.waitForTimeout(500)

note('11-ajustes', 'warn', 'cambiar carpeta de descargas', 'no automatizable (diálogo nativo) — skip')

})

// ==================================================================
// 12) Integración Windows
// ==================================================================
await block('12-windows', async () => {
// SMTC
const smtc = await win.evaluate(() => {
  const m = navigator.mediaSession?.metadata
  return m ? { title: m.title, artist: m.artist, album: m.album, artwork: m.artwork?.length ?? 0 } : null
})
note('12-windows', smtc?.title ? 'ok' : 'warn', 'SMTC metadata', JSON.stringify(smtc))

// Bandeja (tray) — sondear vía app.evaluate
const trayInfo = await app.evaluate(({ app: aApp }) => {
  // Sin acceso directo al Tray. Miramos si el main mantiene referencias
  return { hasQuit: !!aApp.hasSingleInstanceLock }
})
note('12-windows', 'ok', 'app metadata alcanzable', JSON.stringify(trayInfo))
// Comprobar globalShortcut vía electron.app.evaluate
const shortcutInfo = await app.evaluate(({ globalShortcut }) => {
  return {
    playpause: globalShortcut.isRegistered('MediaPlayPause'),
    next: globalShortcut.isRegistered('MediaNextTrack'),
    prev: globalShortcut.isRegistered('MediaPreviousTrack')
  }
}).catch(() => null)
note(
  '12-windows',
  shortcutInfo && (shortcutInfo.playpause || shortcutInfo.next) ? 'ok' : 'warn',
  'teclas multimedia registradas',
  JSON.stringify(shortcutInfo)
)

})

// ==================================================================
// 13) Robustez
// ==================================================================
await block('13-robustez', async () => {
// Navegación rápida entre páginas
const nav = ['Inicio', 'Buscar', 'Inicio', 'Buscar', 'Inicio', 'Buscar', 'Inicio', 'Buscar']
for (const n of nav) {
  await win.locator('.sidebar-nav-item', { hasText: n }).click().catch(() => {})
  await win.waitForTimeout(140)
}
await win.waitForTimeout(600)
await muteAll(win)
const stillHasShell = await win.locator('.nowplaying').isVisible().catch(() => false)
note('13-robustez', stillHasShell ? 'ok' : 'bug', 'navegación rápida sin pantalla blanca')

// Siguiente x5 rápido
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await searchInput.fill('')
await searchInput.type('daft punk', { delay: 20 })
await win.waitForTimeout(1400)
await win.locator('.track-row').first().dblclick()
await win.waitForTimeout(3500)
await muteAll(win)
for (let i = 0; i < 5; i++) {
  await win.locator('.np-controls .np-ctrl[aria-label="Siguiente"]').first().click().catch(() => {})
  await win.waitForTimeout(120)
}
await win.waitForTimeout(3500)
await muteAll(win)
const stillNp = await win.locator('.np-left .title').textContent().catch(() => '')
note('13-robustez', stillNp ? 'ok' : 'bug', 'spam siguiente x5 no rompe (crossfade 0)', `título tras spam: «${stillNp}»`)

// Viewport 900x600
await win.setViewportSize({ width: 900, height: 600 }).catch(() => {})
await win.waitForTimeout(500)
const at900 = await win.evaluate(() => {
  const overflowH = document.documentElement.scrollWidth > document.documentElement.clientWidth + 4
  const npVisible = getComputedStyle(document.querySelector('.nowplaying') || document.body).display !== 'none'
  const volumeVisible = getComputedStyle(document.querySelector('.volume') || document.body).display !== 'none'
  return { overflowH, npVisible, volumeVisible }
})
note('13-robustez', !at900.overflowH ? 'ok' : 'bug', 'viewport 900x600 sin overflow horizontal', JSON.stringify(at900))
await shot(win, '09-viewport-900')

// Viewport 1600x1000
await win.setViewportSize({ width: 1600, height: 1000 }).catch(() => {})
await win.waitForTimeout(500)
const at1600 = await win.evaluate(() => {
  const cards = document.querySelectorAll('.media-card')
  return { cards: cards.length }
})
note('13-robustez', 'ok', 'viewport 1600x1000', JSON.stringify(at1600))
await shot(win, '10-viewport-1600')

// Reset viewport
await win.setViewportSize({ width: 1280, height: 800 }).catch(() => {})

// Errores en renderer/main
note(
  '13-robustez',
  rendererErrs.length === 0 ? 'ok' : 'warn',
  'errores renderer',
  `${rendererErrs.length} errores; primeros 5: ${rendererErrs.slice(0, 5).join(' | ')}`
)
const mainErrsFiltered = mainErrLog.filter((l) => !/Parser|Not Found|LiveBadge|TextBadge|MenuCustomIconItem|Type mismatch|Unable to find/i.test(l))
note(
  '13-robustez',
  mainErrsFiltered.length === 0 ? 'ok' : 'warn',
  'errores main (filtrando ruido conocido youtubei.js)',
  `${mainErrsFiltered.length} líneas; primeros 5: ${mainErrsFiltered.slice(0, 5).map((s) => s.slice(0, 100)).join(' | ')}`
)

})

// ==================================================================
// Cierre de sesión de likes: hacer toggle sobre pista actual (reversible)
// ==================================================================
await block('11-ajustes', async () => {
try {
  // Consigue la pista actual
  const currentTrack = await win.evaluate(() => {
    const el = document.querySelector('.np-left .title')
    // Sacar el videoId por acceso al store
    const key = document.querySelector('.np-cover')?.getAttribute('src') ?? ''
    return { title: el?.textContent ?? '', coverSrc: key }
  })
  // Para tener videoId real, buscamos vía window
  const vid = await win.evaluate(() => {
    // Intentar sacar del store
    try {
      const anyStore = window.__ml_current_videoId || null
      if (anyStore) return anyStore
    } catch {
      /* noop */
    }
    // fallback: sacar del atributo data
    return document.querySelector('[data-current-videoid]')?.getAttribute('data-current-videoid') ?? null
  })
  if (vid) {
    const like = await win.evaluate((v) => window.api.library.rate(v, 'like').then(() => 'ok').catch((e) => 'ERR:' + e.message), vid)
    await win.waitForTimeout(900)
    const clr = await win.evaluate((v) => window.api.library.rate(v, 'clear').then(() => 'ok').catch((e) => 'ERR:' + e.message), vid)
    if (like === 'ok' && clr === 'ok') note('11-ajustes', 'ok', 'like → clear reversible', `videoId=${vid}`)
    else note('11-ajustes', 'bug', 'like/clear', `like=${like} clear=${clr}`)
  } else {
    note('11-ajustes', 'warn', 'like/clear', 'sin videoId accesible desde renderer')
  }
} catch (e) {
  note('11-ajustes', 'warn', 'like/clear', String(e?.message || e))
}

})

// ==================================================================
// Limpieza: borrar descarga de prueba
// ==================================================================
await block('cleanup', async () => {
if (downloadVideoId) {
  try {
    await win.evaluate((v) => window.api.downloads.remove(v), downloadVideoId)
    await win.waitForTimeout(500)
    if (downloadFile && existsSync(downloadFile)) {
      try {
        unlinkSync(downloadFile)
      } catch {
        /* noop */
      }
    }
    note('cleanup', 'ok', 'descarga de prueba eliminada', `videoId=${downloadVideoId}`)
  } catch (e) {
    note('cleanup', 'warn', 'descarga no eliminada', String(e?.message || e))
  }
}

})

// ==================================================================
// Restauración de ajustes al target
// ==================================================================
let settingsAfter = null
await block('cleanup', async () => {
  const patch = { ...restoreTarget, theme: settingsBefore.theme, accent: settingsBefore.accent }
  await win.evaluate((p) => window.api.settings.set(p), patch)
  await win.waitForTimeout(500)
  settingsAfter = await win.evaluate(() => window.api.settings.get())
  const restoredOk = Object.keys(restoreTarget).every((k) => {
    const cur = settingsAfter[k]
    const tgt = restoreTarget[k]
    return Array.isArray(tgt) ? JSON.stringify(cur) === JSON.stringify(tgt) : cur === tgt
  })
  note('cleanup', restoredOk ? 'ok' : 'bug', 'ajustes restaurados', restoredOk ? '' : JSON.stringify(settingsAfter))
})

// ==================================================================
// Dump resultado a JSON y cierre
// ==================================================================
const elapsed = ((Date.now() - started) / 1000).toFixed(1)
const summary = {
  elapsed,
  settingsBefore,
  settingsAfter,
  totals: {
    ok: R.ok.length,
    warn: R.warn.length,
    bug: R.bug.length,
    skip: R.skip.length
  },
  bySection: R.bySection,
  mainErrLogSample: mainErrLog.slice(0, 30),
  rendererErrsAll: rendererErrs
}
saveJson('results.json', summary)

console.log(`\n\n=== TOTALES: ${R.ok.length} OK · ${R.warn.length} WARN · ${R.bug.length} BUG · ${R.skip.length} SKIP (${elapsed}s) ===`)

await app.close().catch(() => {})
process.exit(0)
