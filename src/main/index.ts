import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  globalShortcut,
  nativeImage,
  screen,
  session as electronSession
} from 'electron'
import { join, resolve as pathResolve } from 'path'
import { cpSync, existsSync, renameSync, rmSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpc } from './ipc'
import { initAutoUpdater, checkForUpdatesOnStartup, quitAndInstallUpdate } from './updater'
import { sessionManager, AUTH_PARTITION } from './innertube/session'
import { startStreamServer } from './stream/server'
import { getAllSettings, updateSettings } from './settings'
import { IPC, type MiniCorner } from '@shared/types'

let tray: Tray | null = null
let isQuitting = false
// F66 · Se pone a true justo antes de dejar pasar el quit real, para no
// reintentar el flush en la segunda vuelta de 'before-quit' (ver más abajo).
let cookiesFlushed = false
let miniWindow: BrowserWindow | null = null
const MINI_W = 400
const MINI_H = 84
const MINI_MARGIN = 12
const SNAP_DIST = 64

function miniSize(): [number, number] {
  const scale = getAllSettings().miniScale || 1
  return [Math.round(MINI_W * scale), Math.round(MINI_H * scale)]
}

/** Cambia la escala: redimensiona la ventana y re-ancla a su esquina. */
function setMiniScale(scale: number): void {
  const clamped = Math.max(0.8, Math.min(1.6, scale))
  updateSettings({ miniScale: clamped })
  if (miniWindow && !miniWindow.isDestroyed()) {
    const [w, h] = miniSize()
    miniWindow.setMinimumSize(w, h)
    miniWindow.setSize(w, h)
    const corner = getAllSettings().miniCorner
    if (corner !== 'free') placeMiniAtCorner(corner)
  }
  // Notifica a todas las ventanas (el mini aplica el zoom del contenido)
  broadcastSettings()
}

/** Coordenadas de cada esquina dentro del área útil (sin barra de tareas). */
function cornerPositions(win: BrowserWindow): Record<Exclude<MiniCorner, 'free'>, [number, number]> {
  const wa = screen.getDisplayMatching(win.getBounds()).workArea
  const [w, h] = win.getSize()
  return {
    tl: [wa.x + MINI_MARGIN, wa.y + MINI_MARGIN],
    tr: [wa.x + wa.width - w - MINI_MARGIN, wa.y + MINI_MARGIN],
    bl: [wa.x + MINI_MARGIN, wa.y + wa.height - h - MINI_MARGIN],
    br: [wa.x + wa.width - w - MINI_MARGIN, wa.y + wa.height - h - MINI_MARGIN]
  }
}

function broadcastSettings(): void {
  const merged = getAllSettings()
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(IPC.SETTINGS_CHANGED, merged)
  }
}

function placeMiniAtCorner(corner: MiniCorner): void {
  if (!miniWindow || miniWindow.isDestroyed()) return
  if (corner === 'free') {
    const s = getAllSettings()
    if (s.miniX != null && s.miniY != null) miniWindow.setPosition(s.miniX, s.miniY)
    const [x, y] = miniWindow.getPosition()
    updateSettings({ miniCorner: 'free', miniX: x, miniY: y })
    broadcastSettings()
    return
  }
  const [x, y] = cornerPositions(miniWindow)[corner]
  miniWindow.setPosition(x, y)
  updateSettings({ miniCorner: corner })
  broadcastSettings()
}

/** Imán: al soltar cerca de una esquina, engancha; si no, guarda posición libre. */
let snapTimer: NodeJS.Timeout | null = null
function onMiniMoved(): void {
  if (!miniWindow || miniWindow.isDestroyed()) return
  if (snapTimer) clearTimeout(snapTimer)
  snapTimer = setTimeout(() => {
    if (!miniWindow || miniWindow.isDestroyed()) return
    const [x, y] = miniWindow.getPosition()
    const corners = cornerPositions(miniWindow)
    for (const [corner, [cx, cy]] of Object.entries(corners) as [
      Exclude<MiniCorner, 'free'>,
      [number, number]
    ][]) {
      if (Math.abs(x - cx) < SNAP_DIST && Math.abs(y - cy) < SNAP_DIST) {
        miniWindow.setPosition(cx, cy)
        updateSettings({ miniCorner: corner })
        broadcastSettings()
        return
      }
    }
    updateSettings({ miniCorner: 'free', miniX: x, miniY: y })
    broadcastSettings()
  }, 350)
}

let miniSettingsWindow: BrowserWindow | null = null

/** Ventana independiente de ajustes del mini, colocada junto a él. */
function toggleMiniSettings(): void {
  if (miniSettingsWindow && !miniSettingsWindow.isDestroyed()) {
    miniSettingsWindow.close()
    miniSettingsWindow = null
    return
  }
  if (!miniWindow || miniWindow.isDestroyed()) return

  const W = 300
  const H = 400
  const mb = miniWindow.getBounds()
  const wa = screen.getDisplayMatching(mb).workArea
  // Encima del mini si hay hueco; si no, debajo. Alineada a su borde derecho.
  let y = mb.y - H - 8
  if (y < wa.y) y = mb.y + mb.height + 8
  let x = mb.x + mb.width - W
  x = Math.max(wa.x + 8, Math.min(x, wa.x + wa.width - W - 8))

  miniSettingsWindow = new BrowserWindow({
    width: W,
    height: H,
    x,
    y,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    backgroundColor: '#121212',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  miniSettingsWindow.setAlwaysOnTop(true, 'screen-saver')
  miniSettingsWindow.on('closed', () => {
    miniSettingsWindow = null
  })
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void miniSettingsWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/mini-settings`)
  } else {
    void miniSettingsWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: '/mini-settings'
    })
  }
}

function toggleMiniPlayer(): void {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.close()
    miniWindow = null
    miniSettingsWindow?.close()
    return
  }
  const [mw, mh] = miniSize()
  miniWindow = new BrowserWindow({
    width: mw,
    height: mh,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    backgroundColor: '#121212',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  miniWindow.setAlwaysOnTop(true, 'screen-saver')
  miniWindow.on('moved', onMiniMoved)
  miniWindow.on('closed', () => {
    miniWindow = null
  })
  // Coloca en la esquina recordada (por defecto abajo-derecha, sobre la barra de tareas)
  placeMiniAtCorner(getAllSettings().miniCorner)
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void miniWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/mini`)
  } else {
    void miniWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/mini' })
  }
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 832,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#121212',
    // F60 · icono de ventana/barra de tareas también en dev (empaquetado ya
    // lo hereda del .exe)
    icon: iconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    // Modo humo para verificación automatizada: arranca, espera y sale limpio
    if (process.env.EROS_SMOKE === '1') {
      setTimeout(() => app.quit(), 3000)
    }
    // Autocaptura para verificación visual: guarda un PNG de la ventana y sale
    const shotPath = process.env.EROS_SHOT
    if (shotPath) {
      setTimeout(() => {
        void (async () => {
          try {
            const image = await mainWindow!.webContents.capturePage()
            const { promises: fs } = await import('fs')
            await fs.writeFile(shotPath, image.toPNG())
            console.log('[SHOT_OK]', shotPath)
          } catch (err) {
            console.error('[SHOT_FAIL]', err)
            process.exitCode = 1
          } finally {
            if (process.env.EROS_SHOT_STAY !== '1') app.quit()
          }
        })()
      }, Number(process.env.EROS_SHOT_DELAY ?? 3500))
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Cerrar a la bandeja (si está activado en Ajustes)
  mainWindow.on('close', (e) => {
    if (!isQuitting && getAllSettings().closeToTray) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icon-256.png')
    : join(app.getAppPath(), 'assets', 'icon-256.png')
}

function sendMedia(cmd: string): void {
  mainWindow?.webContents.send(IPC.MEDIA_COMMAND, cmd)
}

function createTray(): void {
  const image = nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 })
  tray = new Tray(image)
  tray.setToolTip("ERO'S Music")
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Mostrar ERO'S Music",
        click: () => {
          mainWindow?.show()
          mainWindow?.focus()
        }
      },
      { type: 'separator' },
      { label: 'Reproducir/Pausar', click: () => sendMedia('playpause') },
      { label: 'Siguiente', click: () => sendMedia('next') },
      { label: 'Anterior', click: () => sendMedia('previous') },
      { type: 'separator' },
      {
        label: 'Salir',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

function registerMediaKeys(): void {
  // Teclas multimedia globales (funcionan con la app en segundo plano)
  globalShortcut.register('MediaPlayPause', () => sendMedia('playpause'))
  globalShortcut.register('MediaNextTrack', () => sendMedia('next'))
  globalShortcut.register('MediaPreviousTrack', () => sendMedia('previous'))
  globalShortcut.register('MediaStop', () => sendMedia('pause'))
}

// F63 · Rebranding interno v1.2.0: el userData canónico pasa de la carpeta
// histórica "Metrolist PC" (nombre original del proyecto, usado hasta
// v1.1.x) a "ERO'S Music". La migración ocurre AQUÍ, antes de que Chromium
// abra un solo fichero: sesión de Google (Partitions/ytauth), metrolist.db
// + WAL/SHM, Preferences, Local/Session Storage, Network, spool, ytcache,
// Cache… viajan enteros de una carpeta a otra.
//
// Reglas:
//  - Si "ERO'S Music" ya existe (ya migrado, o reinstalación posterior) NO
//    se toca nada: esa carpeta manda y la vieja, si quedara, se ignora.
//  - Si no existe ninguna (instalación limpia): Electron crea la nueva vacía.
//  - Migración: rename atómico (mismo volumen %APPDATA%, instantáneo). Si
//    falla (handle abierto, antivirus…), copia a un dir de staging y rename
//    final — "ERO'S Music" solo aparece si la copia terminó ENTERA.
//  - Si nada funciona, se sigue usando la carpeta vieja: arrancar sin los
//    datos del usuario no es una opción.
function resolveUserDataDir(): string {
  const appData = app.getPath('appData')
  const legacyDir = join(appData, 'Metrolist PC') // pre-rebranding (≤ v1.1.x)
  const newDir = join(appData, "ERO'S Music")
  const stagingDir = join(appData, "ERO'S Music.migrating")
  try {
    // Restos de una copia interrumpida en un arranque anterior: fuera.
    if (existsSync(stagingDir)) rmSync(stagingDir, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
  if (existsSync(newDir)) return newDir
  if (!existsSync(legacyDir)) return newDir
  try {
    renameSync(legacyDir, newDir)
    console.log('[userData] migrado "Metrolist PC" -> "ERO\'S Music" (rename)')
    return newDir
  } catch {
    /* rename no disponible: probamos copia por etapas */
  }
  try {
    cpSync(legacyDir, stagingDir, { recursive: true })
    renameSync(stagingDir, newDir)
    try {
      rmSync(legacyDir, { recursive: true, force: true })
    } catch {
      /* la copia ya es la buena; la carpeta vieja queda huérfana pero sin uso */
    }
    console.log('[userData] migrado "Metrolist PC" -> "ERO\'S Music" (copia)')
    return newDir
  } catch (err) {
    console.error('[userData] migración fallida; se mantiene la carpeta antigua:', err)
    try {
      rmSync(stagingDir, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
    return legacyDir
  }
}

// F50 · Modo E2E: con EROS_E2E_PROFILE, la app usa un userData propio.
// El lock de instancia única es por-userData, así que las pruebas pueden
// correr JUNTO a la app instalada del usuario sin cerrarla ni tocar su
// perfil real (ajustes, cola, spool… quedan aislados en el dir de prueba).
// En E2E la migración ni se evalúa: cero riesgo sobre los datos reales.
if (process.env.EROS_E2E_PROFILE) {
  app.setPath('userData', process.env.EROS_E2E_PROFILE)
} else {
  app.setPath('userData', resolveUserDataDir())
}

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    // F63 · AUMID nuevo (rebranding v1.2.0); debe coincidir con el appId de
    // electron-builder.yml para que Windows agrupe bien la ventana y las
    // notificaciones con los accesos directos del instalador.
    electronApp.setAppUserModelId('com.zero.erosmusic')

    // F22: registro del protocolo `erosmusic://` (antes `metrolist://`) para
    // deep-links. Solo el registro; el handler `open-url` (Windows: segundo
    // argv) se implementará cuando lleguen los deep-link. TODO F22-follow-up.
    try {
      if (process.defaultApp && process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('erosmusic', process.execPath, [
          pathResolve(process.argv[1])
        ])
      } else {
        app.setAsDefaultProtocolClient('erosmusic')
      }
    } catch {
      /* algunos entornos (sandboxed, portables) no admiten el registro */
    }

    ipcMain.handle('app:ping', () => 'pong')

    // F33 · aplica el proxy configurado (o direct) antes de que se dispare
    // cualquier `net.fetch` de la sesión por defecto.
    const { applyProxyFromSettings } = await import('./net/proxy')
    await applyProxyFromSettings()

    registerIpc(() => mainWindow)

    // Restaura la sesión guardada (OAuth cacheado o cookies de la partición)
    void sessionManager.restore()

    // Proxy local de audio
    void startStreamServer()

    createTray()
    registerMediaKeys()

    // F67 · Auto-actualización (GitHub Releases). En dev no hace nada (guard
    // `!app.isPackaged` dentro del módulo). El handler de instalación vive
    // AQUÍ y no en updater.ts porque necesita el flag module-level
    // `isQuitting`: debe ponerse a true ANTES de quitAndInstall() — mismo
    // patrón que el "Salir" del tray — para que el intercept de `closeToTray`
    // en mainWindow.on('close') no esconda la ventana en vez de dejarla
    // cerrar. El app.quit() interno del updater pasa después por el
    // before-quit de F66 (flush de cookies, timeout 1,5 s) sin bloquearse.
    initAutoUpdater(() => mainWindow)
    checkForUpdatesOnStartup()
    ipcMain.handle(IPC.UPDATE_INSTALL_NOW, () => {
      isQuitting = true
      quitAndInstallUpdate()
    })

    // Mini-player: toggle, relé de estado (principal -> mini) y de comandos (mini -> principal)
    ipcMain.handle(IPC.MINI_TOGGLE, () => toggleMiniPlayer())
    ipcMain.handle(IPC.MINI_SHOW_MAIN, () => {
      mainWindow?.show()
      mainWindow?.focus()
    })
    ipcMain.on(IPC.MINI_STATE, (_e, state) => {
      if (miniWindow && !miniWindow.isDestroyed()) {
        miniWindow.webContents.send(IPC.MINI_STATE, state)
      }
      // El mismo flujo alimenta la presencia de Discord
      void import('./integrations/discord').then(({ updateDiscordPresence }) =>
        updateDiscordPresence(state)
      )
    })
    ipcMain.handle(IPC.MINI_COMMAND, (_e, cmd: string) => sendMedia(cmd))
    ipcMain.handle(IPC.MINI_SET_CORNER, (_e, corner: MiniCorner) => placeMiniAtCorner(corner))
    ipcMain.handle(IPC.MINI_OPEN_SETTINGS, () => toggleMiniSettings())
    ipcMain.handle(IPC.MINI_SET_SCALE, (_e, scale: number) => setMiniScale(scale))

    // Discord RPC según ajustes (y reaccionando a cambios)
    void import('./integrations/discord').then(({ setDiscordEnabled }) => {
      setDiscordEnabled(getAllSettings().discordRpc)
    })

    // Gancho de pruebas de humo: EROS_TEST_SEARCH="consulta" imprime
    // los primeros resultados y sale. Solo para verificación automatizada.
    // Smoke de streaming: resuelve, descarga por spool y sirve por el proxy.
    const testStream = process.env.EROS_TEST_STREAM
    if (testStream) {
      void (async () => {
        try {
          const { streamUrlFor } = await import('./stream/server')
          const { resolveStream } = await import('./stream/resolver')
          const resolved = await resolveStream(testStream)
          console.log('[SMOKE_STREAM_RESOLVED]', {
            via: resolved.via,
            mime: resolved.mimeType,
            bitrate: resolved.bitrate,
            durationSec: resolved.durationSec
          })
          const proxied = await fetch(streamUrlFor(testStream), {
            headers: { Range: 'bytes=0-1023' }
          })
          const buf = await proxied.arrayBuffer()
          console.log('[SMOKE_STREAM_OK]', {
            status: proxied.status,
            contentRange: proxied.headers.get('content-range'),
            bytes: buf.byteLength
          })
          if (proxied.status !== 206 && proxied.status !== 200) process.exitCode = 1
        } catch (err) {
          console.error('[SMOKE_STREAM_FAIL]', err)
          process.exitCode = 1
        } finally {
          app.quit()
        }
      })()
    }

    if (process.env.EROS_TEST_LIBRARY === '1') {
      void (async () => {
        try {
          const { sessionManager: sm } = await import('./innertube/session')
          await sm.restore()
          const yt = await sm.get()
          /* eslint-disable @typescript-eslint/no-explicit-any */
          const lib: any = await yt.music.getLibrary()
          console.log('[LIB] keys:', Object.keys(lib))
          const sections: any[] = lib?.contents ?? []
          console.log('[LIB] contents length:', sections?.length)
          for (const s of (sections ?? []).slice(0, 4)) {
            console.log(
              '[LIB] section type:', s?.type,
              '| keys:', Object.keys(s ?? {}).slice(0, 12).join(','),
              '| inner len:', (s?.contents ?? s?.items)?.length
            )
            const first = (s?.contents ?? s?.items)?.[0]
            if (first) {
              console.log('  [LIB] item type:', first?.type, '| item_type:', first?.item_type,
                '| keys:', Object.keys(first ?? {}).slice(0, 14).join(','))
            }
          }
        } catch (err) {
          console.error('[LIB_FAIL]', err)
        } finally {
          app.quit()
        }
      })()
    }

    // Like reversible: pone Me gusta y lo quita, verificando el ciclo de escritura
    const testLike = process.env.EROS_TEST_LIKE
    if (testLike) {
      void (async () => {
        try {
          const { sessionManager: sm } = await import('./innertube/session')
          await sm.restore()
          const { setTrackRating } = await import('./innertube/library')
          await setTrackRating(testLike, 'like')
          console.log('[LIKE_OK] like aplicado')
          await new Promise((r) => setTimeout(r, 1500))
          await setTrackRating(testLike, 'clear')
          console.log('[LIKE_OK] like retirado (cuenta como estaba)')
        } catch (err) {
          console.error('[LIKE_FAIL]', err)
          process.exitCode = 1
        } finally {
          app.quit()
        }
      })()
    }

    // KRC: letra con tiempos por palabra desde KuGou
    const testKrc = process.env.EROS_TEST_KRC
    if (testKrc) {
      void (async () => {
        try {
          const [title, artist, dur] = testKrc.split('|')
          const { fetchKugouKrc } = await import('./lyrics/kugou')
          const lines = await fetchKugouKrc({
            title,
            artist,
            durationSec: dur ? Number(dur) : undefined
          })
          if (!lines) {
            console.log('[KRC] sin resultado para', title)
          } else {
            const withWords = lines.filter((l) => l.words && l.words.length > 1).length
            console.log(`[KRC_OK] ${lines.length} líneas, ${withWords} con palabras`)
            const sample = lines.find((l) => (l.words?.length ?? 0) > 2)
            if (sample) {
              console.log(
                '[KRC_SAMPLE]',
                sample.words!.slice(0, 4).map((w) => `${w.text}@${w.timeMs}+${w.durMs}`).join(' | ')
              )
            }
          }
        } catch (err) {
          console.error('[KRC_FAIL]', err)
        } finally {
          app.quit()
        }
      })()
    }

    if (process.env.EROS_TEST_POTOKEN === '1') {
      void (async () => {
        try {
          const { sessionManager: sm } = await import('./innertube/session')
          const yt = await sm.get()
          const vd = yt.session.context.client.visitorData
          if (!vd) throw new Error('sin visitorData')
          const { generatePoToken } = await import('./innertube/potoken')
          const result = await generatePoToken(vd)
          console.log('[SMOKE_POTOKEN_OK]', {
            len: result.poToken.length,
            head: result.poToken.slice(0, 24) + '…'
          })
        } catch (err) {
          console.error('[SMOKE_POTOKEN_FAIL]', err)
          process.exitCode = 1
        } finally {
          app.quit()
        }
      })()
    }

    const testSearch = process.env.EROS_TEST_SEARCH
    if (testSearch) {
      void (async () => {
        try {
          const { search } = await import('./innertube/api')
          const res = await search(testSearch, 'all')
          console.log('[SMOKE_SEARCH_OK]', JSON.stringify({
            songs: res.songs.slice(0, 3),
            albums: res.albums.slice(0, 2).map((a) => a.title),
            artists: res.artists.slice(0, 2).map((a) => a.title)
          }, null, 2))
        } catch (err) {
          console.error('[SMOKE_SEARCH_FAIL]', err)
          process.exitCode = 1
        } finally {
          app.quit()
        }
      })()
    }

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// F66 · Red de seguridad: un `taskkill /F` (o cualquier salida no limpia)
// puede matar Chromium a mitad de una escritura pendiente en su cookie
// store — la sesión de Google (cookies de `AUTH_PARTITION`) queda corrupta
// o sin persistir, y el usuario aparece deslogueado en el siguiente
// arranque aunque el fichero Cookies siga en disco. Antes de dejar salir a
// la app de verdad, forzamos un volcado explícito a disco. Timeout de 1.5s
// (patrón F42: ninguna promesa sin límite) para no bloquear nunca un cierre
// real si el volcado se cuelga por lo que sea.
app.on('before-quit', (event) => {
  isQuitting = true
  if (cookiesFlushed) return
  event.preventDefault()
  const flush = electronSession.fromPartition(AUTH_PARTITION).cookies.flushStore()
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 1500))
  Promise.race([flush, timeout])
    .catch((err) => console.warn('[quit] flushStore de cookies falló:', err))
    .finally(() => {
      cookiesFlushed = true
      app.quit()
    })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
