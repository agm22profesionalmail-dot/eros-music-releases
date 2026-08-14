import { BrowserWindow } from 'electron'
import { AUTH_PARTITION, sessionManager } from '../innertube/session'

/**
 * Ventana de login con la página REAL de Google (mismo enfoque que el WebView
 * de Metrolist en Android). El usuario escribe sus credenciales directamente
 * en accounts.google.com; la app solo conserva las cookies de sesión que
 * quedan en la partición persistente.
 */

const LOGIN_URL =
  'https://accounts.google.com/ServiceLogin?ltmpl=music&service=youtube&continue=' +
  encodeURIComponent('https://www.youtube.com/signin?action_handle_signin=true&next=https%3A%2F%2Fmusic.youtube.com%2F')

let loginWindow: BrowserWindow | null = null

export async function openCookieLogin(parent?: BrowserWindow): Promise<void> {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus()
    return
  }

  loginWindow = new BrowserWindow({
    width: 480,
    height: 720,
    parent,
    modal: false,
    autoHideMenuBar: true,
    title: 'Iniciar sesión — YouTube Music',
    webPreferences: {
      partition: AUTH_PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  let adopted = false
  const tryAdopt = async (url: string): Promise<void> => {
    if (adopted) return
    try {
      const u = new URL(url)
      if (u.hostname === 'music.youtube.com' || u.hostname === 'www.youtube.com') {
        const ok = await sessionManager.adoptCookies()
        if (ok) {
          adopted = true
          loginWindow?.close()
        }
      }
    } catch {
      /* URL rara: ignorar */
    }
  }

  loginWindow.webContents.on('did-navigate', (_e, url) => void tryAdopt(url))
  loginWindow.webContents.on('did-navigate-in-page', (_e, url) => void tryAdopt(url))

  loginWindow.on('closed', () => {
    loginWindow = null
  })

  await loginWindow.loadURL(LOGIN_URL)
}
