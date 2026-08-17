import { create } from 'zustand'
import { pushToast } from '../components/Toast'
import { t } from './i18n'

/**
 * F67 · Auto-actualización (lado renderer).
 *
 * Estado del ciclo aviso → descarga → instalación, alimentado por los eventos
 * de `window.api.updater.on*` (que a su vez reenvían los de electron-updater
 * desde el main). El banner (`UpdateBanner.tsx`) pinta este store; el botón
 * "Buscar actualizaciones" de Ajustes también lee/escribe aquí.
 *
 * Flujo de UN SOLO click (petición explícita del usuario): "Actualizar ahora"
 * dispara `startDownload()` y, en cuanto llega el evento 'downloaded',
 * `installNow()` se encadena automáticamente — sin segundo click. El estado
 * 'downloaded' solo dura lo que tarda el main en cerrar la app ("Instalando,
 * la app se reiniciará…").
 *
 * Errores:
 *  - Comprobación MANUAL fallida → toast discreto (el banner nunca aparece).
 *  - Descarga fallida → estado 'error' en el banner (no puede quedarse
 *    congelado en un porcentaje) con opción de descartarlo.
 *  - Comprobaciones automáticas fallidas → el main ni las reenvía.
 */

export type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'

interface UpdaterState {
  state: UpdateState
  /** Versión nueva disponible/descargada (p. ej. "1.4.0"). */
  version: string | null
  /** Progreso de descarga 0-100 (solo relevante en 'downloading'). */
  progress: number
  errorMessage: string | null
  /** Registra los listeners de window.api.updater.on*. Llamar UNA VEZ (App.tsx). */
  init: () => void
  /** Comprobación manual desde Ajustes. */
  checkNow: () => void
  /** Botón "Actualizar ahora" del banner: descarga y (vía evento) instala. */
  startDownload: () => void
  /** Instala lo descargado y reinicia. Lo encadena solo el evento 'downloaded'. */
  installNow: () => void
  /** "Ahora no": oculta el banner esta sesión (reaparece al próximo chequeo). */
  dismiss: () => void
}

/** Guard de registro único (init puede re-invocarse en StrictMode/dev). */
let wired = false

export const useUpdater = create<UpdaterState>((set, get) => ({
  state: 'idle',
  version: null,
  progress: 0,
  errorMessage: null,

  init: () => {
    if (wired) return
    wired = true

    window.api.updater.onAvailable(({ version }) => {
      set({ state: 'available', version, progress: 0, errorMessage: null })
    })

    // Solo llega tras una comprobación MANUAL (el main filtra las silenciosas).
    window.api.updater.onNotAvailable(() => {
      if (get().state === 'checking') {
        pushToast(t('update.upToDate'))
        set({ state: 'idle' })
      }
    })

    window.api.updater.onDownloadProgress(({ percent }) => {
      set({ state: 'downloading', progress: percent })
    })

    window.api.updater.onDownloaded(({ version }) => {
      // Un solo click: en cuanto está descargada, se instala sin preguntar más.
      set({ state: 'downloaded', version })
      get().installNow()
    })

    window.api.updater.onError(({ message }) => {
      const s = get().state
      if (s === 'checking') {
        // Comprobación manual fallida: toast discreto, sin banner.
        pushToast(t('update.errorToast'))
        set({ state: 'idle', errorMessage: message })
      } else if (s === 'downloading' || s === 'downloaded') {
        // Descarga/instalación fallida: el banner enseña el error.
        set({ state: 'error', errorMessage: message })
      }
      // En 'idle'/'available' sería un error de chequeo automático — el main
      // no los reenvía, pero por si acaso: silencio.
    })
  },

  checkNow: () => {
    const s = get().state
    // No pisar una descarga/instalación en curso ni duplicar la comprobación.
    if (s === 'checking' || s === 'downloading' || s === 'downloaded') return
    set({ state: 'checking', errorMessage: null })
    void window.api.updater.check()
  },

  startDownload: () => {
    set({ state: 'downloading', progress: 0, errorMessage: null })
    void window.api.updater.startDownload()
  },

  installNow: () => {
    void window.api.updater.installNow()
  },

  dismiss: () => set({ state: 'idle' })
}))

// Referencia para pruebas E2E, simétrica a `__erosMusicPlayerStore`,
// `__erosMusicSettingsStore` y `__erosMusicOnboardingStore`.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __erosMusicUpdaterStore?: unknown }).__erosMusicUpdaterStore = useUpdater
}
