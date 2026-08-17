import { app, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC } from '@shared/types'

/**
 * F67 · Auto-actualización vía GitHub Releases (electron-updater).
 *
 * Filosofía: aviso + confirmación, nunca descarga silenciosa. El main solo
 * comprueba y notifica; descargar e instalar lo dispara el usuario desde el
 * banner del renderer ("Actualizar ahora" encadena descarga → instalación).
 *
 * Reglas:
 *  - En dev (`!app.isPackaged`) el auto-updater NO se activa: electron-updater
 *    no tiene sentido (ni funciona) corriendo desde `electron-vite dev` sin
 *    build empaquetado. Solo la comprobación manual responde — con un
 *    `UPDATE_NOT_AVAILABLE` inmediato, para que el botón de Ajustes no se
 *    quede en "Buscando…" para siempre.
 *  - Las comprobaciones automáticas (arranque + cada 6 h, mismo orden de
 *    magnitud que la rotación de cookies SIDTS de innertube/session.ts) son
 *    INVISIBLES si fallan o si no hay nada nuevo: sin red no es un error que
 *    el usuario deba ver. Solo la comprobación manual (botón en Ajustes)
 *    reenvía `UPDATE_NOT_AVAILABLE` / `UPDATE_ERROR`.
 *  - Un fallo de DESCARGA sí se reenvía siempre: la descarga la inició el
 *    usuario y el banner no puede quedarse congelado en un porcentaje.
 *  - La instalación real (quitAndInstall) vive detrás de
 *    `IPC.UPDATE_INSTALL_NOW`, registrado en `src/main/index.ts` junto al flag
 *    `isQuitting` — ver el comentario allí sobre la integración con F66.
 */

const STARTUP_DELAY_MS = 8_000 // no competir con la carga inicial de la app
const RECHECK_INTERVAL_MS = 6 * 3600_000 // mismo ritmo que el refresco SIDTS

let getWindow: (() => BrowserWindow | null) | null = null
/** true entre "el usuario pulsó Buscar actualizaciones" y su respuesta. */
let manualCheckInFlight = false
/** true entre "el usuario pulsó Actualizar ahora" y downloaded/error. */
let downloadInFlight = false
let initialized = false

function send(channel: string, payload?: unknown): void {
  const win = getWindow?.()
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

/**
 * Configura electron-updater y cablea sus eventos hacia el renderer.
 * Llamar una sola vez en `app.whenReady`. En dev solo guarda el accessor de
 * la ventana (para poder contestar a la comprobación manual) y sale.
 */
export function initAutoUpdater(getMainWindow: () => BrowserWindow | null): void {
  getWindow = getMainWindow
  if (!app.isPackaged || initialized) return
  initialized = true

  autoUpdater.autoDownload = false // descarga solo tras confirmación del usuario
  autoUpdater.autoInstallOnAppQuit = false // el quitAndInstall lo controlamos nosotros

  autoUpdater.on('update-available', (info) => {
    manualCheckInFlight = false
    send(IPC.UPDATE_AVAILABLE, { version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    // Solo la comprobación manual muestra "ya estás al día" — las silenciosas
    // de arranque/6h no deben generar ruido en la UI.
    const wasManual = manualCheckInFlight
    manualCheckInFlight = false
    if (wasManual) send(IPC.UPDATE_NOT_AVAILABLE)
  })

  autoUpdater.on('download-progress', (progress) => {
    send(IPC.UPDATE_DOWNLOAD_PROGRESS, { percent: progress.percent })
  })

  autoUpdater.on('update-downloaded', (info) => {
    downloadInFlight = false
    // NO se instala aquí: se reenvía al renderer, que encadena
    // `UPDATE_INSTALL_NOW` (flujo de un solo click en el banner).
    send(IPC.UPDATE_DOWNLOADED, { version: info.version })
  })

  autoUpdater.on('error', (err) => {
    // Comprobación silenciosa fallida (sin red, repo inalcanzable…): solo log.
    // Manual o descarga en curso: el renderer necesita enterarse.
    const visible = manualCheckInFlight || downloadInFlight
    manualCheckInFlight = false
    downloadInFlight = false
    console.warn('[updater] error:', err?.message ?? err)
    if (visible) send(IPC.UPDATE_ERROR, { message: String(err?.message ?? err) })
  })
}

/** Comprobación silenciosa: cualquier fallo se queda en un console.warn. */
function checkSilently(): void {
  if (!app.isPackaged) return
  autoUpdater.checkForUpdates().catch((err) => {
    console.warn('[updater] checkForUpdates (silencioso) falló:', err?.message ?? err)
  })
}

/**
 * Comprobación automática: una vez a los 8 s del arranque (para no competir
 * con la carga inicial) y luego cada 6 horas mientras la app siga abierta.
 */
export function checkForUpdatesOnStartup(): void {
  if (!app.isPackaged) return
  setTimeout(checkSilently, STARTUP_DELAY_MS)
  setInterval(checkSilently, RECHECK_INTERVAL_MS)
}

/** Comprobación manual (botón de Ajustes): sus resultados SÍ llegan a la UI. */
export function checkForUpdatesManually(): void {
  if (!app.isPackaged) {
    // Dev: el updater está apagado; contestamos "sin novedades" para que el
    // botón de Ajustes salga del estado "Buscando…".
    send(IPC.UPDATE_NOT_AVAILABLE)
    return
  }
  manualCheckInFlight = true
  autoUpdater.checkForUpdates().catch(() => {
    /* el listener 'error' de arriba ya loguea y reenvía por ser manual */
  })
}

/** Descarga la actualización ya anunciada (tras "Actualizar ahora"). */
export function startUpdateDownload(): void {
  if (!app.isPackaged) return
  downloadInFlight = true
  autoUpdater.downloadUpdate().catch(() => {
    /* el listener 'error' ya reenvía (downloadInFlight estaba a true) */
  })
}

/**
 * Instala lo descargado y reinicia. El llamante (handler de
 * `IPC.UPDATE_INSTALL_NOW` en `src/main/index.ts`) DEBE poner
 * `isQuitting = true` antes — igual que el "Salir" del tray — para que el
 * intercept de `closeToTray` no esconda la ventana en vez de dejarla cerrar.
 * El `app.quit()` interno de quitAndInstall pasa por el `before-quit` de F66
 * (flush de cookies con timeout de 1,5 s) sin bloquearse: el instalador NSIS
 * ya está lanzado y espera a que el proceso muera.
 */
export function quitAndInstallUpdate(): void {
  if (!app.isPackaged) return
  autoUpdater.quitAndInstall()
}
