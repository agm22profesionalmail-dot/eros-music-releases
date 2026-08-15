import { create } from 'zustand'
import { engine } from '../player/engine'
import { usePlayer } from '../player/store'

/**
 * F27 · Temporizador de apagado (sleep timer).
 *
 * Reglas del comportamiento:
 *  - `start(minutes, opts)` arranca la cuenta atrás. `minutesLeft` se actualiza
 *     cada segundo (contamos en segundos internos y exponemos el redondeo).
 *  - Al agotarse el tiempo:
 *      · Si `endWithSong=true`, esperamos al `ended` del track actual para pausar.
 *      · Si `fadeOutLastMinute=true`, durante los últimos 60 s de la cuenta atrás
 *        rampa lineal del preamp de su valor actual (0 dB de referencia) a -40 dB.
 *  - `stop()` cancela todo y restaura el preamp al valor de ajuste del usuario.
 *
 * NO tocamos ajustes persistentes: el fade actúa sobre `engine.setPreamp` y al
 * cancelar volvemos a re-aplicar `settings.preampDb` (los settings mandan).
 */

export interface SleepTimerOptions {
  endWithSong: boolean
  fadeOutLastMinute: boolean
}

interface SleepTimerState {
  active: boolean
  /** Minutos completos restantes (redondeados hacia arriba). */
  minutesLeft: number
  /** Segundos restantes reales — usado por el bucle interno. */
  secondsLeft: number
  endWithSong: boolean
  fadeOutLastMinute: boolean
  start: (minutes: number, opts?: Partial<SleepTimerOptions>) => void
  stop: () => void
}

// Devuelve el preamp actual del ajuste del usuario en dB (para restaurarlo).
function userPreampDb(): number {
  try {
    // Import perezoso para evitar ciclo (settingsStore importa engine).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./settingsStore') as {
      useSettings: { getState: () => { settings: { preampDb: number } } }
    }
    return mod.useSettings.getState().settings.preampDb ?? 0
  } catch {
    return 0
  }
}

// Estado del bucle: guardamos los timers fuera del store para poder limpiarlos.
let tickTimer: number | null = null
let fadeStart: number | null = null

function clearTimers(): void {
  if (tickTimer !== null) {
    window.clearInterval(tickTimer)
    tickTimer = null
  }
  fadeStart = null
}

export const useSleepTimer = create<SleepTimerState>((set, get) => ({
  active: false,
  minutesLeft: 0,
  secondsLeft: 0,
  endWithSong: false,
  fadeOutLastMinute: false,

  start: (minutes, opts) => {
    const min = Math.max(1, Math.min(600, Math.floor(minutes)))
    const secondsLeft = min * 60
    const endWithSong = Boolean(opts?.endWithSong)
    const fadeOutLastMinute = Boolean(opts?.fadeOutLastMinute)
    clearTimers()
    set({
      active: true,
      minutesLeft: min,
      secondsLeft,
      endWithSong,
      fadeOutLastMinute
    })

    // Bucle de 1 s: cuenta atrás + rampa de fade en el último minuto.
    tickTimer = window.setInterval(() => {
      const st = get()
      if (!st.active) {
        clearTimers()
        return
      }
      const next = st.secondsLeft - 1

      // Fade en el último minuto: rampa lineal del preamp de userPreampDb → -40 dB
      if (st.fadeOutLastMinute && next <= 60 && next >= 0) {
        if (fadeStart === null) fadeStart = 60
        const from = userPreampDb()
        const to = -40
        const t = 1 - next / 60 // 0..1 en el último minuto
        const db = from + (to - from) * t
        engine.setPreamp(db)
      }

      if (next <= 0) {
        // Se acabó el tiempo
        clearTimers()
        if (st.endWithSong) {
          // Espera al final de la canción actual y pausa entonces.
          set({ active: true, secondsLeft: 0, minutesLeft: 0 })
          const off = engine.on('ended', () => {
            off()
            engine.pause()
            engine.setPreamp(userPreampDb())
            set({
              active: false,
              secondsLeft: 0,
              minutesLeft: 0,
              endWithSong: false,
              fadeOutLastMinute: false
            })
          })
        } else {
          // Pausa inmediata
          usePlayer.getState() // sanity: mantiene el import vivo
          engine.pause()
          engine.setPreamp(userPreampDb())
          set({
            active: false,
            secondsLeft: 0,
            minutesLeft: 0,
            endWithSong: false,
            fadeOutLastMinute: false
          })
        }
        return
      }

      set({ secondsLeft: next, minutesLeft: Math.ceil(next / 60) })
    }, 1000)
  },

  stop: () => {
    clearTimers()
    // Restaura preamp al valor de ajuste del usuario (por si hubo fade)
    engine.setPreamp(userPreampDb())
    set({
      active: false,
      secondsLeft: 0,
      minutesLeft: 0,
      endWithSong: false,
      fadeOutLastMinute: false
    })
  }
}))
