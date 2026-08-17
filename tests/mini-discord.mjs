/**
 * Prueba de mini-player flotante + Discord Rich Presence.
 * Uso: node tests/mini-discord.mjs
 */
import { _electron } from 'playwright'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shots = join(root, 'tests', 'shots')
mkdirSync(shots, { recursive: true })

const app = await _electron.launch({ args: ['.'], cwd: root })

const mainLog = []
app.process().stdout?.on('data', (d) => {
  const s = String(d).trim()
  if (s) mainLog.push(s)
})
app.process().stderr?.on('data', (d) => {
  const s = String(d).trim()
  if (s && !s.includes('Parser')) mainLog.push(s)
})

const win = await app.firstWindow()
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(1500)

let failures = 0
const check = (name, cond) => {
  console.log(cond ? `  OK  ${name}` : `  FAIL ${name}`)
  if (!cond) failures++
}

// 1. Activa Discord RPC vía ajustes
await win.evaluate(() => window.api.settings.set({ discordRpc: true }))

// 2. Reproduce una canción (necesaria para estado del mini y presencia)
await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
await win.locator('.topbar-search input').fill('daft punk')
await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 15000 })
await win.waitForTimeout(800)
await win.locator('.track-row').first().hover()
await win.locator('.track-row').first().locator('.play-hover').click()
await win.locator('.np-left .title').waitFor({ state: 'visible', timeout: 20000 })
const playingTitle = (await win.locator('.np-left .title').textContent()) ?? ''
console.log('  reproduciendo:', playingTitle)

// 3. Abre el mini-player
await win.locator('[aria-label="Mini-player"]').click()
// Espera a la segunda ventana
let miniPage = null
for (let i = 0; i < 20 && !miniPage; i++) {
  await win.waitForTimeout(500)
  miniPage = app.windows().find((w) => w.url().includes('#/mini'))
}
check('ventana mini abierta', Boolean(miniPage))

if (miniPage) {
  await miniPage.waitForLoadState('domcontentloaded')
  // El estado tarda ≤1 s en publicarse
  await miniPage.waitForTimeout(2500)
  const miniTitle = await miniPage.locator('div[title="Abrir ERO\'S Music"]').textContent()
  console.log('  título en mini:', miniTitle)
  check('el mini muestra la pista actual', Boolean(miniTitle) && miniTitle !== "ERO'S Music")
  await miniPage.screenshot({ path: join(shots, 'miniplayer.png') })

  // 4. Control desde el mini: pausa
  const wasPlaying = await win.evaluate(() => {
    const audios = [...document.querySelectorAll('audio')]
    return audios.some((a) => !a.paused)
  })
  await miniPage.locator('.np-play').click()
  await win.waitForTimeout(1500)
  const nowPaused = await win.evaluate(() => {
    const audios = [...document.querySelectorAll('audio')]
    return audios.every((a) => a.paused)
  })
  check(`pausa desde el mini (antes sonaba=${wasPlaying})`, wasPlaying && nowPaused)

  // Reanuda desde el mini
  await miniPage.locator('.np-play').click()
  await win.waitForTimeout(1500)
  const resumed = await win.evaluate(() => {
    const audios = [...document.querySelectorAll('audio')]
    return audios.some((a) => !a.paused)
  })
  check('reanudar desde el mini', resumed)

  // 5. Línea de tiempo visible con tiempos
  const hasTimes = await miniPage.evaluate(() => {
    const spans = [...document.querySelectorAll('span')]
    return spans.filter((s) => /^\d+:\d\d$/.test(s.textContent ?? '')).length >= 2
  })
  check('línea de tiempo con tiempos', hasTimes)

  // 6. Seek desde el mini: clic al 50% de la barra
  const posBefore = await win.evaluate(() => {
    const audios = [...document.querySelectorAll('audio')]
    return Math.max(...audios.map((a) => a.currentTime), 0)
  })
  const bar = miniPage.locator('div[style*="cursor: pointer"]').filter({ hasNot: miniPage.locator('b') }).first()
  const barBox = await bar.boundingBox()
  if (barBox) {
    await miniPage.mouse.click(barBox.x + barBox.width * 0.5, barBox.y + barBox.height / 2)
    await win.waitForTimeout(1500)
    const posAfter = await win.evaluate(() => {
      const audios = [...document.querySelectorAll('audio')]
      return Math.max(...audios.map((a) => a.currentTime), 0)
    })
    console.log(`  seek: ${posBefore.toFixed(1)}s -> ${posAfter.toFixed(1)}s`)
    check('seek desde el mini', Math.abs(posAfter - posBefore) > 15)
  } else {
    check('seek desde el mini (barra no encontrada)', false)
  }

  // 7. Ventana de ajustes independiente: abrir con la ruedita
  await miniPage.hover('body')
  await miniPage.locator('[title="Ajustes del mini-player"]').click()
  let settingsPage = null
  for (let i = 0; i < 20 && !settingsPage; i++) {
    await win.waitForTimeout(400)
    settingsPage = app.windows().find((w) => w.url().includes('#/mini-settings'))
  }
  check('ventana de ajustes del mini abierta', Boolean(settingsPage))

  if (settingsPage) {
    await settingsPage.waitForLoadState('domcontentloaded')
    await settingsPage.waitForTimeout(500)

    // Esquina arriba-izquierda desde el diagrama
    await settingsPage.locator('[title="Arriba izquierda"]').click()
    await win.waitForTimeout(800)
    const miniBounds = await app.evaluate(({ BrowserWindow }) => {
      const mini = BrowserWindow.getAllWindows().find(
        (w) => w.webContents.getURL().includes('#/mini') && !w.webContents.getURL().includes('settings')
      )
      return mini ? mini.getBounds() : null
    })
    console.log('  bounds tras esquina TL:', JSON.stringify(miniBounds))
    check('anclado arriba-izquierda', Boolean(miniBounds && miniBounds.x < 40 && miniBounds.y < 40))

    // Escala al 130%: la ventana del mini debe crecer
    await settingsPage.locator('input[type="range"]').fill('1.3')
    await win.waitForTimeout(800)
    const scaledBounds = await app.evaluate(({ BrowserWindow }) => {
      const mini = BrowserWindow.getAllWindows().find(
        (w) => w.webContents.getURL().includes('#/mini') && !w.webContents.getURL().includes('settings')
      )
      return mini ? mini.getBounds() : null
    })
    console.log('  bounds al 130%:', JSON.stringify(scaledBounds))
    check('escala aplicada (ancho ≈ 520)', Boolean(scaledBounds && Math.abs(scaledBounds.width - 520) < 6))
    await settingsPage.locator('input[type="range"]').fill('1')
    await win.waitForTimeout(500)

    // Karaoke: activar y comprobar que aparece letra en la tarjeta
    await settingsPage.locator('input[type="checkbox"]').check()
    await miniPage.waitForTimeout(6000) // deja cargar la letra
    const karaokeText = await miniPage
      .locator('div[title="Abrir ERO\'S Music"] div')
      .first()
      .textContent()
      .catch(() => null)
    console.log('  línea de karaoke:', karaokeText)
    check(
      'karaoke muestra letra (no el título)',
      Boolean(karaokeText && karaokeText.length > 2 && !karaokeText.includes('·'))
    )
    await miniPage.screenshot({ path: join(shots, 'miniplayer-karaoke.png') })
    await settingsPage.locator('input[type="checkbox"]').uncheck()

    // Posición libre: puntitos de arrastre
    await settingsPage.locator('button', { hasText: 'Libre' }).click()
    await miniPage.waitForTimeout(400)
    check(
      'agarre de puntitos en modo libre',
      await miniPage.locator('[title="Arrastra para mover"]').isVisible()
    )

    // Vuelve a abajo-derecha y cierra ajustes
    await settingsPage.locator('[title="Abajo derecha"]').click()
    await settingsPage.locator('[aria-label="Cerrar"]').click()
    await win.waitForTimeout(500)
    check(
      'ventana de ajustes cerrada',
      !app.windows().some((w) => w.url().includes('#/mini-settings'))
    )
  }

  // 8. Cierra el mini con su botón
  await miniPage.hover('body')
  await miniPage.locator('[title="Cerrar mini-player"]').click()
  await win.waitForTimeout(1000)
  const stillOpen = app.windows().some((w) => w.url().includes('#/mini'))
  check('mini cerrado con su botón', !stillOpen)
}

// 6. Discord: espera a las trazas de conexión/presencia en el log del main
await win.waitForTimeout(4000)
const discordConnected = mainLog.some((l) => l.includes('[discord] conectado'))
const discordPresence = mainLog.some((l) => l.includes('[discord] presencia:'))
check('Discord RPC conectado', discordConnected)
check('presencia enviada a Discord', discordPresence)
console.log(
  '  trazas discord:',
  mainLog.filter((l) => l.includes('[discord]')).join(' | ') || '(ninguna)'
)

// Deja el ajuste de Discord como estaba (desactivado por defecto)
await win.evaluate(() => window.api.settings.set({ discordRpc: false }))

await app.close()
console.log(failures === 0 ? '\nTODO OK' : `\n${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
