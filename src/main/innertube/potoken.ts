import { BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'

/**
 * Generación de PoToken (Proof of Origin) en un navegador REAL.
 *
 * El generador vive en el renderer (`src/renderer/src/potoken/gen.ts`, cargado
 * en una ventana oculta `potoken.html`): BotGuard necesita un navegador de
 * verdad (jsdom producía tokens que YouTube rechazaba con 403).
 *
 * Expone dos usos, con el mismo minter reutilizable:
 *   - `generatePoToken(visitorData)` → token de sesión, para la petición /player.
 *   - `mintPoToken(identifier)`      → firma para un binding cualquiera; el
 *     resolver lo usa con el VIDEOID para el `pot` de la URL de streaming (GVS),
 *     que es lo que exige googlevideo para los art tracks de YouTube Music.
 */

export interface PoTokenResult {
  poToken: string
  visitorData: string
  mintedAt: number
}

let genWindow: BrowserWindow | null = null
let loading: Promise<BrowserWindow> | null = null

async function ensureWindow(): Promise<BrowserWindow> {
  if (genWindow && !genWindow.isDestroyed()) return genWindow
  if (loading) return loading

  loading = (async () => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: false,
        sandbox: false,
        // BotGuard llama a jnn-pa.googleapis.com desde el renderer; sin esto
        // CORS bloquearía el fetch. Ventana interna sin contenido remoto no
        // confiable, así que es seguro.
        webSecurity: false,
        // La ventana está oculta: sin esto Chromium la "congela" y BotGuard,
        // que depende de timers/timing, tarda o falla.
        backgroundThrottling: false
      }
    })

    if (is.dev && process.env.ELECTRON_RENDERER_URL) {
      await win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/potoken.html`)
    } else {
      await win.loadFile(join(__dirname, '../renderer/potoken.html'))
    }

    await win.webContents.executeJavaScript(
      'new Promise((res) => { const c = () => (window.__potokenReady ? res(true) : setTimeout(c, 30)); c() })'
    )

    win.on('closed', () => {
      genWindow = null
    })
    genWindow = win
    loading = null
    return win
  })()

  try {
    return await loading
  } catch (err) {
    loading = null
    throw err
  }
}

async function mintOnce(identifier: string): Promise<string> {
  const win = await ensureWindow()
  const token = (await win.webContents.executeJavaScript(
    `window.__mintPoToken(${JSON.stringify(identifier)})`
  )) as string | null
  if (typeof token !== 'string' || !token) {
    throw new Error('El generador de PoToken no devolvió token')
  }
  return token
}

/** Firma un PoToken ligado a `identifier` (visitorData o videoId) en el navegador real. */
export async function mintPoToken(identifier: string): Promise<string> {
  try {
    return await mintOnce(identifier)
  } catch (err) {
    // La ventana oculta pudo quedar inservible (Chromium la descartó, el
    // contexto se recargó…). La recreamos una vez y reintentamos: mejor un
    // mint algo más lento que un 403 en la descarga.
    console.warn('[potoken] mint falló, recreo la ventana:', String((err as Error)?.message ?? err))
    if (genWindow && !genWindow.isDestroyed()) genWindow.destroy()
    genWindow = null
    loading = null
    return mintOnce(identifier)
  }
}

/**
 * Fuerza a regenerar el minter de BotGuard (challenge + integrity token nuevos).
 * Se llama ante un 403 de googlevideo al descargar: es la señal de que el
 * integrity token caducó y los pot que firma ya no valen. Si la ventana no
 * responde, la recreamos para que el siguiente `mintPoToken` la reconstruya.
 */
export async function refreshMinter(): Promise<void> {
  try {
    const win = await ensureWindow()
    await win.webContents.executeJavaScript(
      'window.__refreshPoMinter ? window.__refreshPoMinter() : false'
    )
  } catch (err) {
    console.warn('[potoken] refreshMinter falló, recreo la ventana:', String((err as Error)?.message ?? err))
    if (genWindow && !genWindow.isDestroyed()) genWindow.destroy()
    genWindow = null
    loading = null
  }
}

export async function generatePoToken(visitorData: string): Promise<PoTokenResult> {
  const poToken = await mintPoToken(visitorData)
  return { poToken, visitorData, mintedAt: Date.now() }
}
