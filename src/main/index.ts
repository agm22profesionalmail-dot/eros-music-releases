import { app, shell, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpc } from './ipc'
import { sessionManager } from './innertube/session'
import { startStreamServer } from './stream/server'
import { getAllSettings } from './settings'
import { IPC } from '@shared/types'

let tray: Tray | null = null
let isQuitting = false
let miniWindow: BrowserWindow | null = null

function toggleMiniPlayer(): void {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.close()
    miniWindow = null
    return
  }
  miniWindow = new BrowserWindow({
    width: 360,
    height: 100,
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
  miniWindow.on('closed', () => {
    miniWindow = null
  })
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
    if (process.env.METROLIST_SMOKE === '1') {
      setTimeout(() => app.quit(), 3000)
    }
    // Autocaptura para verificación visual: guarda un PNG de la ventana y sale
    const shotPath = process.env.METROLIST_SHOT
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
            if (process.env.METROLIST_SHOT_STAY !== '1') app.quit()
          }
        })()
      }, Number(process.env.METROLIST_SHOT_DELAY ?? 3500))
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
  tray.setToolTip('Metrolist PC')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Mostrar Metrolist',
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

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.zero.metrolistpc')

    ipcMain.handle('app:ping', () => 'pong')

    registerIpc(() => mainWindow)

    // Restaura la sesión guardada (OAuth cacheado o cookies de la partición)
    void sessionManager.restore()

    // Proxy local de audio
    void startStreamServer()

    createTray()
    registerMediaKeys()

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

    // Discord RPC según ajustes (y reaccionando a cambios)
    void import('./integrations/discord').then(({ setDiscordEnabled }) => {
      setDiscordEnabled(getAllSettings().discordRpc)
    })

    // Gancho de pruebas de humo: METROLIST_TEST_SEARCH="consulta" imprime
    // los primeros resultados y sale. Solo para verificación automatizada.
    // Smoke de streaming: resuelve, descarga por spool y sirve por el proxy.
    const testStream = process.env.METROLIST_TEST_STREAM
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

    if (process.env.METROLIST_TEST_POTOKEN === '1') {
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

    const testSearch = process.env.METROLIST_TEST_SEARCH
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

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
