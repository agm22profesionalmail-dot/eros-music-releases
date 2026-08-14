import { BrowserWindow, ipcMain } from 'electron'
import { IPC, type PreparedStream, type SearchFilter } from '@shared/types'
import { sessionManager } from '../innertube/session'
import * as music from '../innertube/api'
import { openCookieLogin } from '../auth/cookieLogin'
import { resolveStream } from '../stream/resolver'
import { streamUrlFor } from '../stream/server'
import * as lib from '../innertube/library'
import type { TrackSummary } from '@shared/types'

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
  ipcMain.handle(IPC.MUSIC_LIBRARY, () => lib.getLibraryCached())
  ipcMain.handle(IPC.MUSIC_PLAYLIST, (_e, id: string) => music.getPlaylist(id))
  ipcMain.handle(IPC.MUSIC_ALBUM, (_e, id: string) => music.getAlbum(id))
  ipcMain.handle(IPC.MUSIC_ARTIST, (_e, id: string) => music.getArtist(id))
  ipcMain.handle(IPC.MUSIC_UP_NEXT, (_e, videoId: string) => music.getUpNext(videoId))
  ipcMain.handle(IPC.MUSIC_LYRICS, (_e, videoId: string) => music.getYtLyrics(videoId))

  // ---- Biblioteca (escrituras) e historial ----
  ipcMain.handle(IPC.LIB_REFRESH, () => lib.refreshLibrary())
  ipcMain.handle(IPC.LIB_RATE, (_e, videoId: string, action: lib.LikeAction) =>
    lib.setTrackRating(videoId, action)
  )
  ipcMain.handle(IPC.LIB_PLAYLIST_ADD, (_e, playlistId: string, videoIds: string[]) =>
    lib.addToPlaylist(playlistId, videoIds)
  )
  ipcMain.handle(IPC.LIB_PLAYLIST_REMOVE, (_e, playlistId: string, videoIds: string[]) =>
    lib.removeFromPlaylist(playlistId, videoIds)
  )
  ipcMain.handle(IPC.LIB_PLAYLIST_CREATE, (_e, title: string, videoIds: string[]) =>
    lib.createPlaylist(title, videoIds)
  )
  ipcMain.handle(IPC.LIB_SUBSCRIBE, (_e, channelId: string, subscribed: boolean) =>
    lib.setSubscribed(channelId, subscribed)
  )
  ipcMain.handle(IPC.HISTORY_ADD, (_e, track: TrackSummary) => lib.addHistoryEntry(track))
  ipcMain.handle(IPC.HISTORY_LIST, (_e, limit?: number) => lib.getHistory(limit))

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
