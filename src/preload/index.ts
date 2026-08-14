import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC } from '../shared/types'
import type {
  AlbumDetail,
  ArtistDetail,
  AuthState,
  LibrarySnapshot,
  PlaylistDetail,
  SearchFilter,
  SearchResults,
  Shelf
} from '../shared/types'

const api = {
  ping: (): Promise<string> => ipcRenderer.invoke('app:ping'),

  auth: {
    getState: (): Promise<AuthState> => ipcRenderer.invoke(IPC.AUTH_GET_STATE),
    startDeviceCode: (): Promise<void> => ipcRenderer.invoke(IPC.AUTH_START_DEVICE),
    openCookieLogin: (): Promise<void> => ipcRenderer.invoke(IPC.AUTH_OPEN_COOKIE_LOGIN),
    signOut: (): Promise<void> => ipcRenderer.invoke(IPC.AUTH_SIGN_OUT),
    onStateChanged: (cb: (state: AuthState) => void): (() => void) => {
      const listener = (_e: unknown, state: AuthState): void => cb(state)
      ipcRenderer.on(IPC.AUTH_STATE_CHANGED, listener)
      return () => ipcRenderer.removeListener(IPC.AUTH_STATE_CHANGED, listener)
    }
  },

  music: {
    search: (query: string, filter?: SearchFilter): Promise<SearchResults> =>
      ipcRenderer.invoke(IPC.MUSIC_SEARCH, query, filter),
    suggestions: (input: string): Promise<string[]> =>
      ipcRenderer.invoke(IPC.MUSIC_SUGGESTIONS, input),
    home: (): Promise<Shelf[]> => ipcRenderer.invoke(IPC.MUSIC_HOME),
    library: (): Promise<LibrarySnapshot> => ipcRenderer.invoke(IPC.MUSIC_LIBRARY),
    playlist: (id: string): Promise<PlaylistDetail> => ipcRenderer.invoke(IPC.MUSIC_PLAYLIST, id),
    album: (id: string): Promise<AlbumDetail> => ipcRenderer.invoke(IPC.MUSIC_ALBUM, id),
    artist: (id: string): Promise<ArtistDetail> => ipcRenderer.invoke(IPC.MUSIC_ARTIST, id),
    upNext: (videoId: string): Promise<{ tracks: unknown[]; playlistId?: string }> =>
      ipcRenderer.invoke(IPC.MUSIC_UP_NEXT, videoId),
    ytLyrics: (videoId: string): Promise<{ text: string; footer?: string } | null> =>
      ipcRenderer.invoke(IPC.MUSIC_LYRICS, videoId)
  },

  win: {
    minimize: (): Promise<void> => ipcRenderer.invoke(IPC.WIN_MINIMIZE),
    maximize: (): Promise<void> => ipcRenderer.invoke(IPC.WIN_MAXIMIZE),
    close: (): Promise<void> => ipcRenderer.invoke(IPC.WIN_CLOSE),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke(IPC.WIN_IS_MAXIMIZED)
  }
}

export type PreloadApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
