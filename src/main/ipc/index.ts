import { BrowserWindow, ipcMain } from 'electron'
import { IPC, type PreparedStream, type SearchFilter } from '@shared/types'
import { sessionManager } from '../innertube/session'
import * as music from '../innertube/api'
import { openCookieLogin } from '../auth/cookieLogin'
import { resolveStream } from '../stream/resolver'
import { streamUrlFor } from '../stream/server'
import * as lib from '../innertube/library'
import * as downloads from '../downloads'
import { getLyrics } from '../lyrics'
import {
  getAllSettings,
  updateSettings,
  changeDownloadsDir,
  openDownloadsDir,
  getProfile,
  setProfile
} from '../settings'
import type {
  AppSettings,
  PlaylistEditPatch,
  TrackSummary,
  UserProfile
} from '@shared/types'

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
  ipcMain.handle(
    IPC.MUSIC_LYRICS,
    async (
      _e,
      params: { videoId: string; title: string; artists: string[]; album?: string; durationSec?: number }
    ) => {
      // LRCLIB/KuGou (sincronizadas) primero; letra de YouTube como último recurso
      const synced = await getLyrics(params)
      if (synced) return synced
      const yt = await music.getYtLyrics(params.videoId)
      return yt ? { source: 'YouTube Music', plain: yt.text } : null
    }
  )

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
  ipcMain.handle(IPC.LIB_PLAYLIST_EDIT, (_e, id: string, patch: PlaylistEditPatch) =>
    lib.editPlaylist(id, patch)
  )
  ipcMain.handle(IPC.LIB_SUBSCRIBE, (_e, channelId: string, subscribed: boolean) =>
    lib.setSubscribed(channelId, subscribed)
  )
  ipcMain.handle(IPC.LIB_LIKED_IDS, () => lib.getLikedIds())
  ipcMain.handle(IPC.HISTORY_ADD, (_e, track: TrackSummary) => lib.addHistoryEntry(track))
  ipcMain.handle(IPC.HISTORY_LIST, (_e, limit?: number) => lib.getHistory(limit))

  // ---- Descargas ----
  downloads.setDownloadNotifier(getMainWindow)
  ipcMain.handle(IPC.DL_ADD, (_e, track: TrackSummary) => downloads.enqueueDownload(track))
  ipcMain.handle(IPC.DL_REMOVE, (_e, videoId: string) => downloads.deleteDownload(videoId))
  ipcMain.handle(IPC.DL_LIST, () => downloads.listDownloads())
  ipcMain.handle(IPC.DL_CHANGE_DIR, () => changeDownloadsDir(getMainWindow()))
  ipcMain.handle(IPC.DL_OPEN_DIR, () => openDownloadsDir())

  // ---- Ajustes ----
  ipcMain.handle(IPC.SETTINGS_GET, () => getAllSettings())
  ipcMain.handle(IPC.SETTINGS_SET, async (_e, patch: Partial<AppSettings>) => {
    const merged = updateSettings(patch)
    if ('discordRpc' in patch) {
      const { setDiscordEnabled } = await import('../integrations/discord')
      setDiscordEnabled(Boolean(patch.discordRpc))
    }
    // Notifica a todas las ventanas (la principal Y el mini) para que
    // tema/acento se mantengan sincronizados en vivo.
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send(IPC.SETTINGS_CHANGED, merged)
    }
    return merged
  })

  // ---- Perfil de usuario (F20) ----
  ipcMain.handle(IPC.PROFILE_GET, () => getProfile())
  ipcMain.handle(IPC.PROFILE_SET, (_e, patch: Partial<UserProfile>) => {
    const merged = setProfile(patch)
    // Notifica a todas las ventanas para que el avatar/nombre se actualicen en vivo
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send(IPC.PROFILE_CHANGED, merged)
    }
    return merged
  })

  // ---- Géneros (F23) ----
  // La UI manda las pistas visibles y recibe un mapa videoId→géneros más la
  // lista de géneros presentes. La resolución usa caché en SQLite y consulta
  // Last.fm solo cuando falta información.
  ipcMain.handle(IPC.GENRE_RESOLVE, async (_e, tracks: TrackSummary[]) => {
    const { resolveGenresForTracks } = await import('../genres')
    return resolveGenresForTracks(Array.isArray(tracks) ? tracks : [])
  })

  // ---- Streaming ----
  ipcMain.handle(IPC.STREAM_PREPARE, async (_e, videoId: string): Promise<PreparedStream> => {
    // Descargada -> directo del disco, sin tocar la red (modo offline real)
    const { getDownloadPath } = await import('../db')
    const local = getDownloadPath(videoId)
    if (local) {
      return {
        url: streamUrlFor(videoId),
        mimeType: local.endsWith('.opus') ? 'audio/ogg' : 'audio/mp4',
        via: 'local'
      }
    }
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
