import { create } from 'zustand'
import { useAuth } from './authStore'

/**
 * F61 · Asistente de bienvenida (onboarding).
 *
 * Máquina de pasos lineal sobre STEP_ORDER; el wizard es un overlay controlado
 * por este store (no una ruta del router). El flag `onboarding.completed` vive
 * en SQLite (main) vía IPC; el idioma elegido en el primer paso se persiste al
 * momento con settingsStore, así sobrevive a un cierre a mitad del wizard.
 *
 * Reglas:
 *  - `login` se salta automáticamente si ya hay sesión iniciada (caso típico:
 *    quien actualiza desde <1.2.0 con su Google ya vinculado, o quien repite
 *    el tutorial desde Ajustes).
 *  - `start(true)` (desde Ajustes) omite `language`: el idioma ya está elegido.
 */

export type OnboardingStep =
  | 'language'
  | 'welcome'
  | 'tour'
  | 'theme'
  | 'life'
  | 'login'
  | 'done'

export const STEP_ORDER: OnboardingStep[] = [
  'language',
  'welcome',
  'tour',
  'theme',
  'life',
  'login',
  'done'
]

interface OnboardingState {
  /** ¿El wizard está visible? */
  active: boolean
  step: OnboardingStep
  /** true cuando init() ya consultó el flag persistido. */
  loaded: boolean
  /** true si se reabrió desde Ajustes (sin paso de idioma). */
  fromSettings: boolean
  init: () => Promise<void>
  start: (fromSettings?: boolean) => void
  next: () => void
  back: () => void
  skip: () => Promise<void>
  finish: () => Promise<void>
}

function firstStep(fromSettings: boolean): OnboardingStep {
  return fromSettings ? 'welcome' : 'language'
}

/** Paso visible siguiente/anterior, saltando `login` si ya hay sesión. */
function shiftStep(step: OnboardingStep, dir: 1 | -1): OnboardingStep {
  const signedIn = useAuth.getState().state.status === 'signedIn'
  let i = STEP_ORDER.indexOf(step)
  do {
    i = Math.min(Math.max(i + dir, 0), STEP_ORDER.length - 1)
  } while (STEP_ORDER[i] === 'login' && signedIn && i > 0 && i < STEP_ORDER.length - 1)
  return STEP_ORDER[i]
}

async function persistCompleted(v: boolean): Promise<void> {
  try {
    await window.api.onboarding.setCompleted(v)
  } catch {
    /* sin IPC (tests aislados): el wizard funciona igual en memoria */
  }
}

export const useOnboarding = create<OnboardingState>((set, get) => ({
  active: false,
  step: 'language',
  loaded: false,
  fromSettings: false,

  // Consulta el flag persistido en el boot de App.tsx. Mientras `loaded` es
  // false, App muestra el LoadingSpinner (nunca un flash de LoginPage).
  init: async () => {
    try {
      const completed = await window.api.onboarding.getCompleted()
      set({ loaded: true, active: !completed, step: 'language', fromSettings: false })
    } catch {
      // IPC roto: no bloqueamos la app por el onboarding
      set({ loaded: true, active: false })
    }
  },

  // Reabre el wizard. `fromSettings` omite `language` (el idioma ya está
  // elegido) y resetea el flag para que, si se cierra la app a mitad, el
  // tutorial reaparezca — al terminar/saltar se vuelve a marcar completado.
  start: (fromSettings = false) => {
    void persistCompleted(false)
    set({ active: true, loaded: true, fromSettings, step: firstStep(fromSettings) })
  },

  next: () => {
    const { step } = get()
    const target = shiftStep(step, 1)
    if (target === 'done' || target === step) {
      void get().finish()
      return
    }
    set({ step: target })
  },

  back: () => {
    const { step, fromSettings } = get()
    const first = firstStep(fromSettings)
    if (step === first) return
    const target = shiftStep(step, -1)
    const firstIdx = STEP_ORDER.indexOf(first)
    set({ step: STEP_ORDER.indexOf(target) < firstIdx ? first : target })
  },

  // "Saltar introducción": cierra y persiste igual que terminar.
  skip: async () => {
    set({ active: false })
    await persistCompleted(true)
  },

  finish: async () => {
    set({ active: false, step: 'done' })
    await persistCompleted(true)
  }
}))

// Referencia para pruebas E2E, simétrica a `__erosMusicPlayerStore`,
// `__erosMusicSettingsStore` y `__erosMusicRouter`.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __erosMusicOnboardingStore?: unknown }).__erosMusicOnboardingStore =
    useOnboarding
}
