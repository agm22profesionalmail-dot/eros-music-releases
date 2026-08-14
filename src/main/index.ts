import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpc } from './ipc'
import { sessionManager } from './innertube/session'

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
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
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

    // Gancho de pruebas de humo: METROLIST_TEST_SEARCH="consulta" imprime
    // los primeros resultados y sale. Solo para verificación automatizada.
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
