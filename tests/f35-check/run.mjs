/**
 * F35 · Check integral final v2 tras F27-F34.
 *
 * SILENCIO ABSOLUTO: minimiza inmediatamente tras firstWindow y mantiene
 * audio muted. El usuario está jugando: cero foco, cero sonido.
 *
 * Estructura: un único launch de la app. Cada bloque en su propio try/catch
 * — si un bloque revienta se marca BUG crítico y se sigue con el siguiente.
 *
 * Restaura ajustes y perfil al final. Escribe informe en
 * tests/f35-check-report.md y detalle en tests/f35-check/results.json.
 */
import { _electron } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const outDir = join(root, 'tests', 'f35-check')
const shots = join(outDir, 'shots')
mkdirSync(shots, { recursive: true })

// ---------- utilidades ----------
const bugs = []
const results = []
const mainLog = []
const rendererErrors = []
const rendererLog = []
let mainErrCount = 0

const now = () => new Date().toISOString()
const short = (s, n = 220) => String(s ?? '').slice(0, n)

function log(...a) {
  console.log(...a)
}

function pushResult(block, name, ok, severity = null, note = '') {
  const status = ok ? 'OK' : severity === 'warn' ? 'WARN' : 'BUG'
  results.push({ block, name, status, severity, note })
  log(`  ${status}  [${block}] ${name}${note ? ` — ${note}` : ''}`)
  if (!ok && status === 'BUG') {
    bugs.push({ block, name, severity: severity ?? 'medium', note })
  }
}

async function runBlock(id, title, fn) {
  log(`\n=== Bloque ${id} · ${title} ===`)
  try {
    await fn()
  } catch (err) {
    const msg = short(err?.stack || err?.message || err, 400)
    log(`  !! Bloque ${id} lanzó excepción: ${msg}`)
    pushResult(id, `bloque completo — excepción no capturada`, false, 'critical', msg)
  }
}

// ---------- launch ----------
log(`[F35] arrancando · ${now()}`)
const app = await _electron.launch({
  args: ['.'],
  cwd: root,
  env: { ...process.env, EROS_E2E: '1' }
})

app.process().stdout?.on('data', (d) => {
  const s = String(d).trim()
  if (s) mainLog.push(s)
})
app.process().stderr?.on('data', (d) => {
  const s = String(d).trim()
  if (!s) return
  mainLog.push(s)
  if (
    s.includes('Parser') ||
    s.includes('Autofill') ||
    s.includes('DevTools listening') ||
    s.includes('Passthrough is not supported')
  )
    return
  if (/error|Error|ERROR|Uncaught|Unhandled/i.test(s)) mainErrCount++
})

const win = await app.firstWindow()
// SILENCIO YA
await win.evaluate(() => window.api.win.minimize()).catch(() => undefined)
win.on('console', (msg) => {
  const t = msg.type()
  const text = short(msg.text(), 300)
  rendererLog.push(`[${t}] ${text}`)
  if (t === 'error') rendererErrors.push(text)
})
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(1500)
await win.evaluate(() => {
  document.querySelectorAll('audio').forEach((a) => (a.muted = true))
  new MutationObserver(() => {
    document.querySelectorAll('audio').forEach((a) => (a.muted = true))
  }).observe(document.body, { childList: true, subtree: true })
})
await win.evaluate(() => window.api.win.minimize()).catch(() => undefined)

// ---------- snapshot inicial ----------
const originalSettings = await win.evaluate(() => window.api.settings.get())
const originalProfile = await win.evaluate(() => window.api.profile.get())
log(
  '[setup] snapshot inicial:',
  `uiLanguage=${originalSettings.uiLanguage} proxyMode=${originalSettings.proxyMode} hideVideos=${originalSettings.hideVideos}`
)

writeFileSync(
  join(outDir, 'baseline.json'),
  JSON.stringify({ settings: originalSettings, profile: originalProfile }, null, 2)
)

const authState = await win.evaluate(() => window.api.auth.getState()).catch(() => null)
const signedIn = authState?.status === 'signedIn'
log(`[setup] auth status = ${authState?.status}`)

// ============================================================
// BLOQUE A · F27 · Paridad de reproducción
// ============================================================
await runBlock('A', 'F27 · Paridad reproducción', async () => {
  const s = originalSettings
  const keys = [
    ['audioQuality', 'auto'],
    ['disableCrossfadeOnGapless', true],
    ['normalize', false],
    ['normalizeLevel', 'normal'],
    ['progressiveSeek', false],
    ['avoidDuplicatesInQueue', true],
    ['skipOnError', true],
    ['rememberShuffleRepeat', true],
    ['persistentShuffle', false],
    ['shuffleFirstBeforeSimilar', true],
    ['disableAutoloadOnRepeatAll', true],
    ['autoDownloadOnLike', false],
    ['enableSimilarContent', true],
    ['preloadMoreAt80Percent', false],
    ['historyMaxEntries', 500]
  ]
  let missing = 0
  for (const [k] of keys) {
    if (!(k in s)) missing++
  }
  pushResult('A', `15 claves F27 presentes en settings.get()`, missing === 0, 'high',
    missing ? `faltan ${missing}` : '')
  // Verifica el tipo/coincidencia con default para cada una (informativo)
  for (const [k, def] of keys) {
    const v = s[k]
    const typeOk = typeof v === typeof def || (Array.isArray(def) && Array.isArray(v))
    if (!typeOk) {
      pushResult('A', `${k} tipo válido`, false, 'medium', `typeof=${typeof v}`)
    }
  }

  // Sleep timer: botón data-testid
  const sleepBtn = win.locator('[data-testid="sleep-timer-btn"]')
  const btnCount = await sleepBtn.count()
  pushResult('A', 'botón sleep timer [data-testid="sleep-timer-btn"] presente',
    btnCount >= 1, 'medium', `count=${btnCount}`)

  // Persistencia: cambiar audioQuality y avoidDuplicatesInQueue → volver a leer
  await win.evaluate(() => window.api.settings.set({ audioQuality: 'high', avoidDuplicatesInQueue: false }))
  const s1 = await win.evaluate(() => window.api.settings.get())
  pushResult('A', 'audioQuality:high persiste', s1.audioQuality === 'high', 'high')
  pushResult('A', 'avoidDuplicatesInQueue:false persiste', s1.avoidDuplicatesInQueue === false, 'high')

  // Restaurar los dos flags manipulados
  await win.evaluate(() =>
    window.api.settings.set({ audioQuality: 'auto', avoidDuplicatesInQueue: true })
  )
})

// ============================================================
// BLOQUE B · F28 · Filtros de contenido
// ============================================================
await runBlock('B', 'F28 · Filtros de contenido', async () => {
  const s = originalSettings
  const keys = [
    'hideExplicit', 'hideVideos', 'hideShorts',
    'contentLanguage', 'contentCountry',
    'showArtistDescription', 'showArtistSubscribers', 'showArtistMonthlyListeners',
    'pauseOnAudioDeviceChange'
  ]
  const missing = keys.filter((k) => !(k in s))
  pushResult('B', `9 claves F28 presentes en settings.get()`, missing.length === 0, 'high',
    missing.length ? `faltan: ${missing.join(', ')}` : '')

  // Activa hideVideos y busca — no debe haber kind:'video'
  if (!signedIn) {
    pushResult('B', 'búsqueda con hideVideos skip — sin sesión', true, 'warn')
  } else {
    await win.evaluate(() => window.api.settings.set({ hideVideos: true }))
    try {
      const res = await win.evaluate(() => window.api.music.search('daft punk', 'all'))
      const allTracks = [...(res.songs ?? []), ...(res.videos ?? [])]
      const anyVideo = allTracks.some((t) => t.kind === 'video')
      pushResult('B', 'con hideVideos:true no hay kind:video en resultados',
        !anyVideo, 'high',
        `total=${allTracks.length} videos=${allTracks.filter((t) => t.kind === 'video').length}`)
    } catch (err) {
      pushResult('B', 'búsqueda con hideVideos', false, 'warn', short(err?.message || err))
    }
    // Restaurar
    await win.evaluate(() => window.api.settings.set({ hideVideos: false }))
  }
})

// ============================================================
// BLOQUE C · F29 · Fuentes de streaming
// ============================================================
await runBlock('C', 'F29 · Fuentes de streaming', async () => {
  const s = originalSettings
  pushResult('C', 'streamingSources es array con ≥4 items',
    Array.isArray(s.streamingSources) && s.streamingSources.length >= 4, 'high',
    `len=${s.streamingSources?.length ?? 0}`)
  pushResult('C', 'useYtDlpFallback es boolean',
    typeof s.useYtDlpFallback === 'boolean', 'medium',
    `value=${s.useYtDlpFallback}`)

  const ids = ['YTMUSIC', 'IOS', 'ANDROID', 'TV_EMBEDDED']
  const currentIds = (s.streamingSources ?? []).map((x) => x.id)
  const allPresent = ids.every((i) => currentIds.includes(i))
  pushResult('C', 'contiene los 4 clientes históricos', allPresent, 'medium',
    `ids=${currentIds.join(',')}`)

  // Sección en Ajustes: navega a Ajustes y busca h2 con "Fuentes"
  try {
    const settingsBtn = win.locator('.avatar-btn').first()
    if ((await settingsBtn.count()) > 0) {
      await settingsBtn.click().catch(() => undefined)
      await win.waitForTimeout(600)
      const hasSection = await win.evaluate(() => {
        const hs = Array.from(document.querySelectorAll('h1, h2, h3'))
        return hs.some((h) => /fuentes de streaming|streaming sources/i.test(h.textContent ?? ''))
      })
      pushResult('C', 'sección "Fuentes de streaming" visible en Ajustes',
        hasSection, 'medium')
    } else {
      pushResult('C', 'topbar tiene avatar-btn', false, 'warn')
    }
  } catch (err) {
    pushResult('C', 'navegación a Ajustes', false, 'warn', short(err?.message || err))
  }

  // Restaurar defaults (por si el test los tocase)
  await win.evaluate(() =>
    window.api.settings.set({
      streamingSources: [
        { id: 'YTMUSIC', enabled: true },
        { id: 'IOS', enabled: true },
        { id: 'ANDROID', enabled: true },
        { id: 'TV_EMBEDDED', enabled: true }
      ],
      useYtDlpFallback: true
    })
  )
})

// ============================================================
// BLOQUE D · F30 · Proveedores de letras
// ============================================================
await runBlock('D', 'F30 · Proveedores letras', async () => {
  const s = originalSettings
  pushResult('D', 'lyricsProviders es array con 3 items',
    Array.isArray(s.lyricsProviders) && s.lyricsProviders.length === 3, 'high',
    `len=${s.lyricsProviders?.length ?? 0}`)
  pushResult('D', 'romanizeLyrics es boolean',
    typeof s.romanizeLyrics === 'boolean', 'medium',
    `value=${s.romanizeLyrics}`)
  const ids = ['LRCLIB', 'KUGOU', 'YTMUSIC']
  const currentIds = (s.lyricsProviders ?? []).map((x) => x.id)
  pushResult('D', 'contiene los 3 proveedores esperados',
    ids.every((i) => currentIds.includes(i)), 'medium',
    `ids=${currentIds.join(',')}`)

  // Pedir letra por IPC — no debe lanzar
  try {
    const res = await win.evaluate(() =>
      window.api.music.lyrics({
        videoId: 'dQw4w9WgXcQ',
        title: 'Never Gonna Give You Up',
        artists: ['Rick Astley'],
        durationSec: 213
      })
    )
    pushResult('D', 'music.lyrics(...) responde sin lanzar',
      res === null || typeof res === 'object', 'medium',
      `type=${res === null ? 'null' : typeof res}`)
  } catch (err) {
    pushResult('D', 'music.lyrics(...) responde sin lanzar', false, 'medium',
      short(err?.message || err))
  }
})

// ============================================================
// BLOQUE E · F31 · Wrapped y estadísticas
// ============================================================
await runBlock('E', 'F31 · Wrapped', async () => {
  const s = originalSettings
  pushResult('E', 'wrappedTopN es number', typeof s.wrappedTopN === 'number', 'high',
    `value=${s.wrappedTopN}`)
  pushResult('E', 'showWrappedRecapCard es boolean',
    typeof s.showWrappedRecapCard === 'boolean', 'medium')
  pushResult('E', 'showTopWeekly es boolean', typeof s.showTopWeekly === 'boolean', 'medium')
  pushResult('E', 'showTopMonthly es boolean', typeof s.showTopMonthly === 'boolean', 'medium')

  // stats.recap()
  try {
    const recap = await win.evaluate(() => window.api.stats.recap())
    const ok = recap && typeof recap === 'object' &&
      typeof recap.hoursListened === 'number' &&
      Array.isArray(recap.topTracks) &&
      Array.isArray(recap.topArtists)
    pushResult('E', 'stats.recap() devuelve estructura correcta', ok, 'high',
      ok ? `hours=${recap.hoursListened}` : `got=${JSON.stringify(recap)?.slice(0, 100)}`)
  } catch (err) {
    pushResult('E', 'stats.recap()', false, 'high', short(err?.message || err))
  }

  // Navega a Home → Recap si la tarjeta existe
  await win.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.sidebar-nav .sidebar-nav-item'))
      .find((el) => /inicio|home/i.test(el.textContent ?? ''))
    item?.click()
  })
  await win.waitForTimeout(500)

  if (s.showWrappedRecapCard) {
    const recapCards = await win.evaluate(() => document.querySelectorAll('.recap-card').length)
    pushResult('E', 'Home muestra ≥1 .recap-card con showWrappedRecapCard=true',
      recapCards >= 1, 'medium', `cards=${recapCards}`)
  } else {
    pushResult('E', 'showWrappedRecapCard off — skip check en Home', true, 'warn')
  }

  // Navegar a Recap vía sidebar (el router es custom, no basado en hash)
  try {
    const clicked = await win.evaluate(() => {
      const item = Array.from(document.querySelectorAll('.sidebar-nav .sidebar-nav-item'))
        .find((el) => /recap/i.test(el.textContent ?? ''))
      if (!item) return false
      item.click()
      return true
    })
    await win.waitForTimeout(800)
    const hasRecapPage = await win.evaluate(() => !!document.querySelector('.recap-page'))
    pushResult('E', '.recap-page renderiza al navegar a Recap',
      hasRecapPage, 'medium', clicked ? '' : 'no encontró item Recap en sidebar')
  } catch (err) {
    pushResult('E', 'navegación a Recap', false, 'medium', short(err?.message || err))
  }
})

// ============================================================
// BLOQUE F · F32 · Personalización Home
// ============================================================
await runBlock('F', 'F32 · Personalización Home', async () => {
  const s = originalSettings
  pushResult('F', 'homeShuffleShelves es boolean',
    typeof s.homeShuffleShelves === 'boolean', 'high')
  pushResult('F', 'homeShelvesOrder es array', Array.isArray(s.homeShelvesOrder), 'high')
  pushResult('F', 'homeHiddenShelves es array', Array.isArray(s.homeHiddenShelves), 'high')
  pushResult('F', 'homeQuickPicks es array', Array.isArray(s.homeQuickPicks), 'high',
    `value=${JSON.stringify(s.homeQuickPicks)}`)

  // Sidebar tiene entrada Recap
  const sidebarHasRecap = await win.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.sidebar-nav .sidebar-nav-item'))
    return items.some((el) => /recap/i.test(el.textContent ?? ''))
  })
  pushResult('F', 'sidebar-nav contiene item "Recap"', sidebarHasRecap, 'high')

  // Ir a Home y buscar quickpicks
  await win.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.sidebar-nav .sidebar-nav-item'))
      .find((el) => /inicio|home/i.test(el.textContent ?? ''))
    item?.click()
  })
  await win.waitForTimeout(700)
  const hasHomeUI = await win.evaluate(() => {
    return !!document.querySelector('.home-quickpicks, .home-hero, .shelf, .home-recap')
  })
  pushResult('F', 'Home renderiza al menos una sección conocida', hasHomeUI, 'medium')
})

// ============================================================
// BLOQUE G · F33 · Proxy
// ============================================================
await runBlock('G', 'F33 · Proxy', async () => {
  const s = originalSettings
  pushResult('G', "proxyMode default 'off'", s.proxyMode === 'off', 'high',
    `value=${s.proxyMode}`)
  pushResult('G', "proxyUrl default ''", s.proxyUrl === '', 'medium',
    `value="${s.proxyUrl}"`)

  // Cambia a http con URL fake
  try {
    const s2 = await win.evaluate(() =>
      window.api.settings.set({ proxyMode: 'http', proxyUrl: '127.0.0.1:9999' })
    )
    pushResult('G', 'settings.set proxy http no lanza',
      s2 && s2.proxyMode === 'http', 'high',
      `proxyMode=${s2?.proxyMode} proxyUrl=${s2?.proxyUrl}`)

    await win.waitForTimeout(500)
    const alive = await win.evaluate(() => 1 + 1).catch(() => null)
    pushResult('G', 'ventana sigue viva tras aplicar proxy inexistente',
      alive === 2, 'critical')
  } catch (err) {
    pushResult('G', 'settings.set proxy http', false, 'critical',
      short(err?.message || err))
  }

  // Restaurar
  await win.evaluate(() =>
    window.api.settings.set({ proxyMode: 'off', proxyUrl: '' })
  )
})

// ============================================================
// BLOQUE H · F34 · i18n
// ============================================================
await runBlock('H', 'F34 · i18n', async () => {
  const s = originalSettings
  pushResult('H', "uiLanguage está definido",
    typeof s.uiLanguage === 'string', 'high', `value=${s.uiLanguage}`)
  pushResult('H', "uiLanguage con valor válido (auto|es|en)",
    ['auto', 'es', 'en'].includes(s.uiLanguage), 'medium', `value=${s.uiLanguage}`)

  // Cambio a en → sidebar debe contener "Home"
  await win.locator('.sidebar-nav-item').first().waitFor({ state: 'visible', timeout: 6000 }).catch(() => undefined)
  const readHome = async () =>
    (await win.locator('.sidebar-nav-item').first().innerText().catch(() => '')).trim()
  const before = await readHome()

  await win.evaluate(() => window.api.settings.set({ uiLanguage: 'en' }))
  await win.waitForTimeout(700)
  const enText = await readHome()
  pushResult('H', 'sidebar cambia con uiLanguage=en (Home)',
    /home/i.test(enText), 'high', `"${before}" → "${enText}"`)

  // Vuelve a es
  await win.evaluate(() => window.api.settings.set({ uiLanguage: 'es' }))
  await win.waitForTimeout(700)
  const esText = await readHome()
  pushResult('H', 'sidebar vuelve a "Inicio" con uiLanguage=es',
    /inicio/i.test(esText), 'high', `got="${esText}"`)
})

// ============================================================
// BLOQUE I · Regresiones v0.2 (F20-F26)
// ============================================================
await runBlock('I', 'Regresiones v0.2', async () => {
  // Sidebar tiene playlists (≥1 .library-row) — solo si signedIn
  if (signedIn) {
    await win.locator('.library-row').first().waitFor({ state: 'visible', timeout: 12000 }).catch(() => undefined)
    const rowCount = await win.locator('.library-row').count()
    pushResult('I', 'sidebar tiene ≥1 .library-row', rowCount >= 1, 'high',
      `rows=${rowCount}`)

    // Menú contextual clic derecho en .media-card
    await win.evaluate(() => {
      const item = Array.from(document.querySelectorAll('.sidebar-nav .sidebar-nav-item'))
        .find((el) => /inicio|home/i.test(el.textContent ?? ''))
      item?.click()
    })
    await win.waitForTimeout(400)
    await win.locator('.media-card').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined)
    const cardCount = await win.locator('.media-card').count()
    if (cardCount > 0) {
      await win.locator('.media-card').first().scrollIntoViewIfNeeded().catch(() => undefined)
      await win.locator('.media-card').first().click({ button: 'right' }).catch(() => undefined)
      await win.waitForTimeout(250)
      const menuVis = await win.locator('.context-menu').first().isVisible().catch(() => false)
      pushResult('I', 'clic derecho en .media-card abre .context-menu', menuVis, 'high')
      await win.keyboard.press('Escape').catch(() => undefined)
      await win.waitForTimeout(150)
    } else {
      pushResult('I', 'Home con .media-card', false, 'warn', 'sin tarjetas visibles')
    }

    // Reproducción de una canción avanza
    try {
      const searchBtn = win.locator('.sidebar-nav-item').filter({ hasText: /buscar|search/i }).first()
      await searchBtn.click().catch(() => undefined)
      await win.waitForTimeout(300)
      const searchInput = win.locator('.topbar-search input').first()
      await searchInput.waitFor({ state: 'visible', timeout: 5000 })
      await searchInput.fill('daft punk get lucky')
      await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined)
      const initialSrc = await win.evaluate(() => document.querySelector('audio')?.src ?? '')
      await win.locator('.track-row').first().dblclick().catch(() => undefined)
      const deadline = Date.now() + 10000
      let playing = false
      while (Date.now() < deadline) {
        const src = await win.evaluate(() => document.querySelector('audio')?.src ?? '')
        if (src && src !== initialSrc) { playing = true; break }
        await win.waitForTimeout(300)
      }
      pushResult('I', 'reproducción arranca (audio.src cambia)', playing, 'high')
      // Pausa inmediatamente
      await win.evaluate(() => {
        document.querySelectorAll('audio').forEach((a) => { try { a.pause(); a.muted = true } catch {} })
      })
    } catch (err) {
      pushResult('I', 'reproducción de prueba', false, 'high', short(err?.message || err))
    }
  } else {
    pushResult('I', 'regresiones sidebar/menú/repro skip — sin sesión', true, 'warn')
  }

  // Cero errores no controlados
  pushResult('I', 'sin errores del renderer',
    rendererErrors.length === 0, 'medium',
    rendererErrors.length ? short(rendererErrors.join(' | '), 200) : '')
  pushResult('I', 'sin líneas Error en stderr del main',
    mainErrCount === 0, 'medium', `errCount=${mainErrCount}`)
})

// ============================================================
// BLOQUE J · Robustez
// ============================================================
await runBlock('J', 'Robustez', async () => {
  if (signedIn) {
    // Navega rápido entre 8 páginas via clic sidebar (Inicio/Buscar/Recap)
    for (let i = 0; i < 8; i++) {
      const which = ['Inicio', 'Buscar', 'Recap'][i % 3]
      await win.locator('.sidebar-nav-item').filter({ hasText: new RegExp(which, 'i') }).first()
        .click().catch(() => undefined)
      await win.waitForTimeout(150)
    }
    const alive = await win.evaluate(() => !!document.querySelector('.app, #app, main, .page'))
    pushResult('J', 'tras 8 navegaciones no hay pantalla en blanco', alive, 'high')

    // Spam "siguiente" 5 veces vía botón
    try {
      const nextBtn = win.locator('[aria-label*="Siguiente" i], [aria-label*="Next" i], .np-controls .next').first()
      const hasNext = (await nextBtn.count()) > 0
      if (hasNext) {
        for (let i = 0; i < 5; i++) {
          await nextBtn.click().catch(() => undefined)
          await win.waitForTimeout(200)
        }
        const stillAlive = await win.evaluate(() => 1 + 1).catch(() => null)
        pushResult('J', 'spam siguiente x5 no cuelga', stillAlive === 2, 'medium')
      } else {
        pushResult('J', 'botón siguiente encontrado', false, 'warn')
      }
      await win.evaluate(() => {
        document.querySelectorAll('audio').forEach((a) => { try { a.pause(); a.muted = true } catch {} })
      })
    } catch (err) {
      pushResult('J', 'spam siguiente', false, 'warn', short(err?.message || err))
    }
  }

  // Viewport 900×600 → sin overflow horizontal
  try {
    await win.setViewportSize({ width: 900, height: 600 })
    await win.waitForTimeout(400)
    const overflowH = await win.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    )
    pushResult('J', 'viewport 900×600 sin overflow horizontal', !overflowH, 'medium')
  } catch (err) {
    pushResult('J', 'redimensionar viewport a 900×600', false, 'warn',
      short(err?.message || err))
  }
})

// ============================================================
// RESTAURACIÓN FINAL — reasignamos el snapshot inicial completo
// ============================================================
log('\n=== Restauración ===')
let restoreOK = true
let restoreProfileOK = true
try {
  // Reaplica todos los ajustes originales
  const finalSettings = await win.evaluate(
    (orig) => window.api.settings.set(orig),
    originalSettings
  )
  // Verifica cuatro claves clave restauradas
  const okKeys = ['uiLanguage', 'proxyMode', 'hideVideos', 'audioQuality']
  const okRestore = okKeys.every((k) => finalSettings[k] === originalSettings[k])
  restoreOK = okRestore
  pushResult('restore', 'ajustes restaurados al snapshot inicial', okRestore, 'high',
    `uiLang=${finalSettings.uiLanguage} proxy=${finalSettings.proxyMode} hideV=${finalSettings.hideVideos} aq=${finalSettings.audioQuality}`)
} catch (err) {
  restoreOK = false
  pushResult('restore', 'restaurar ajustes', false, 'critical', short(err?.message || err))
}

try {
  const finalP = await win.evaluate(
    (p) => window.api.profile.set({
      enabled: !!p.enabled,
      displayName: p.displayName ?? '',
      bio: p.bio ?? '',
      photoDataUrl: p.photoDataUrl ?? '',
      favoriteArtists: p.favoriteArtists ?? [],
      publicPlaylistIds: p.publicPlaylistIds ?? []
    }),
    originalProfile
  )
  const ok =
    (finalP.enabled === !!originalProfile.enabled) &&
    ((finalP.displayName ?? '') === (originalProfile.displayName ?? '')) &&
    ((finalP.bio ?? '') === (originalProfile.bio ?? ''))
  restoreProfileOK = ok
  pushResult('restore', 'perfil restaurado a valores originales', ok, 'high',
    ok ? '' : 'diff en algún campo')
} catch (err) {
  restoreProfileOK = false
  pushResult('restore', 'restaurar perfil', false, 'critical', short(err?.message || err))
}

// Verifica cuenta intacta
try {
  const st = await win.evaluate(() => window.api.auth.getState())
  const isSame = signedIn ? st?.status === 'signedIn' : true
  pushResult('restore', 'sesión intacta (no signOut)', isSame, 'critical',
    `status=${st?.status}`)
} catch (err) {
  pushResult('restore', 'auth.getState final', false, 'critical', short(err?.message || err))
}

await app.close()

// ============================================================
// INFORME
// ============================================================
const okCount = results.filter((r) => r.status === 'OK').length
const warnCount = results.filter((r) => r.status === 'WARN').length
const bugCount = results.filter((r) => r.status === 'BUG').length
const total = results.length

const critical = bugs.filter((b) => b.severity === 'critical')
const high = bugs.filter((b) => b.severity === 'high')
const medium = bugs.filter((b) => b.severity === 'medium')
const low = bugs.filter((b) => b.severity === 'low')

let veredicto = 'LISTO PARA v0.3'
if (critical.length > 0 || high.length > 0) veredicto = 'NECESITA FIXES ANTES DE v0.3'
else if (medium.length >= 3) veredicto = 'NECESITA FIXES ANTES DE v0.3'

let estado = 'apto para uso'
if (critical.length > 0) estado = 'con bugs críticos'
else if (high.length > 0 || bugCount >= 3) estado = 'con reservas'

const blocks = [
  ['A', 'F27', 'Paridad reproducción'],
  ['B', 'F28', 'Filtros de contenido'],
  ['C', 'F29', 'Fuentes de streaming'],
  ['D', 'F30', 'Proveedores letras'],
  ['E', 'F31', 'Wrapped'],
  ['F', 'F32', 'Personalización Home'],
  ['G', 'F33', 'Proxy'],
  ['H', 'F34', 'i18n'],
  ['I', 'Regresiones', 'v0.2 (F20-F26)'],
  ['J', 'Robustez', 'nav/spam/viewport'],
  ['restore', 'Cleanup', 'restauración final']
]

let tableRows = ''
for (const [id, feat, title] of blocks) {
  const items = results.filter((r) => r.block === id)
  const ok = items.filter((r) => r.status === 'OK').length
  const wr = items.filter((r) => r.status === 'WARN').length
  const bg = items.filter((r) => r.status === 'BUG').length
  tableRows += `| ${id} | ${title} | ${feat} | ${ok} | ${wr} | ${bg} |\n`
}

const bugsSection = () => {
  const emoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' }
  const lines = []
  for (const sev of ['critical', 'high', 'medium', 'low']) {
    const list = bugs.filter((b) => b.severity === sev)
    if (!list.length) continue
    lines.push(`\n### ${emoji[sev]} ${sev}`)
    for (const b of list) {
      lines.push(`- [${b.block}] ${b.name}${b.note ? ` — ${b.note}` : ''}`)
    }
  }
  return lines.join('\n') || '\n(sin bugs)'
}

const restoreLine = `Ajustes → ${restoreOK ? 'OK' : 'BUG'} · Perfil → ${restoreProfileOK ? 'OK' : 'BUG'} · Cuenta → ${
  results.find((r) => r.name.startsWith('sesión intacta'))?.status === 'OK' ? 'OK' : 'BUG'
}`

const report = `# Check integral final v2 · F27-F34 · ${now()}

## Resumen
${total} pruebas · ${okCount} OK / ${warnCount} WARN / ${bugCount} BUG
Estado: ${estado === 'apto para uso' ? '✅ apto para uso' : estado === 'con reservas' ? '⚠️ con reservas' : '🔴 con bugs críticos'}
- errores no controlados del renderer al final: ${rendererErrors.length}
- líneas con "Error" en stderr del main: ${mainErrCount}
- sesión: ${authState?.status ?? 'unknown'}

## Tabla por bloque
| # | Bloque | Feature | OK | WARN | BUG |
| - | ------ | ------- | -- | ---- | --- |
${tableRows}

## Bugs por severidad
${bugsSection()}

## Regresiones respecto a v0.2 (F26 ya validó 64/64)
${bugs.filter((b) => b.block === 'I').length === 0
  ? 'ninguna — sidebar, menú contextual, reproducción y errores mantienen el nivel de F26.'
  : bugs.filter((b) => b.block === 'I').map((b) => `- ${b.name}: ${b.note}`).join('\n')}

## Restauración
${restoreLine}

## Veredicto
${veredicto}

---

<details><summary>Detalle completo (${results.length} filas)</summary>

${results.map((r) => `- [${r.block}] **${r.status}** · ${r.name}${r.note ? ` — ${r.note}` : ''}`).join('\n')}

</details>

<details><summary>Errores del renderer</summary>

${rendererErrors.length ? rendererErrors.map((e, i) => `${i + 1}. ${e}`).join('\n') : '(ninguno)'}

</details>

<details><summary>Trazas relevantes del main</summary>

${mainLog.filter((l) => /\[discord\]|\[error\]|\[warn\]|Error|error/.test(l)).slice(0, 40).map((l) => `- ${short(l, 200)}`).join('\n') || '(nada relevante)'}

</details>
`

writeFileSync(join(root, 'tests', 'f35-check-report.md'), report, 'utf8')
writeFileSync(
  join(outDir, 'results.json'),
  JSON.stringify({ results, bugs, mainErrCount, rendererErrors, veredicto }, null, 2),
  'utf8'
)

log(`\n[F35] hecho · ${total} pruebas · ${okCount} OK / ${warnCount} WARN / ${bugCount} BUG · ${veredicto}`)
process.exit(bugCount > 0 ? 1 : 0)
