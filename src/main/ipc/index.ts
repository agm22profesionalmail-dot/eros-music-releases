import { BrowserWindow, ipcMain } from 'electron'
import { IPC, type PreparedStream, type SearchFilter } from '@shared/types'
import { sessionManager } from '../innertube/session'
import * as music from '../innertube/api'
import { openCookieLogin } from '../auth/cookieLogin'
import { resolveStream } from '../stream/resolver'
import { streamUrlFor } from '../stream/server'

/** Registra todos los handlers IPC. Llamar una sola vez en app.whenReady. */
export function registerIpc(getMainWindow: () => BrowserWindow | null): void {
  // ---- Autenticación ----
  ipcMain.handle(IPC.AUTH_GET_STATE, () => sessionManager.authState)
  ipcMain.handle(IPC.AUTH_START_DEVICE, () => {
    void sessionManager.startDeviceFlow()
  })
  ipcMain.handle(IPC.AUTH_OPEN_COOKIE_LOGIN, () => {
    void openCookieLogin(getMainWindow() ?? undefined)
  })
  ipcMain.handle(IPC.AUTH_SIGN_OUT, () => sessionManager.signOut())

  sessionManager.on('auth-state', (state) => {
    getMainWindow()?.webContents.send(IPC.AUTH_STATE_CHANGED, state)
  })

  // ---- Música ----
  ipcMain.handle(IPC.MUSIC_SEARCH, (_e, query: string, filter: SearchFilter = 'all') =>
    music.search(query, filter)
  )
  ipcMain.handle(IPC.MUSIC_SUGGESTIONS, (_e, input: string) => music.getSuggestions(input))
  ipcMain.handle(IPC.MUSIC_HOME, () => music.getHome())
  ipcMain.handle(IPC.MUSIC_LIBRARY, () => music.getLibrary())
  ipcMain.handle(IPC.MUSIC_PLAYLIST, (_e, id: string) => music.getPlaylist(id))
  ipcMain.handle(IPC.MUSIC_ALBUM, (_e, id: string) => music.getAlbum(id))
  ipcMain.handle(IPC.MUSIC_ARTIST, (_e, id: string) => music.getArtist(id))
  ipcMain.handle(IPC.MUSIC_UP_NEXT, (_e, videoId: string) => music.getUpNext(videoId))
  ipcMain.handle(IPC.MUSIC_LYRICS, (_e, videoId: string) => music.getYtLyrics(videoId))

  // ---- Streaming ----
  ipcMain.handle(IPC.STREAM_PREPARE, async (_e, videoId: string): Promise<PreparedStream> => {
    const resolved = await resolveStream(videoId)
    return {
      url: streamUrlFor(videoId),
      mimeType: resolved.mimeType,
      durationSec: resolved.durationSec,
      bitrate: resolved.bitrate,
      via: resolved.via
    }
  })

  // ---- Ventana ----
  ipcMain.handle(IPC.WIN_MINIMIZE, () => getMainWindow()?.minimize())
  ipcMain.handle(IPC.WIN_MAXIMIZE, () => {
    const win = getMainWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.handle(IPC.WIN_CLOSE, () => getMainWindow()?.close())
  ipcMain.handle(IPC.WIN_IS_MAXIMIZED, () => getMainWindow()?.isMaximized() ?? false)
}
