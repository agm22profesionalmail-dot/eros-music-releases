import type { LyricLine } from '@shared/types'

/**
 * Progreso de iluminación (0–100) de una línea de karaoke en el instante nowMs.
 *
 * - Con tiempos por palabra (KRC de KuGou): el relleno avanza palabra a
 *   palabra siguiendo exactamente al cantante — cada palabra aporta su
 *   fracción de caracteres y se rellena durante SU duración real. Al acabar
 *   la última palabra la línea queda completa aunque después haya un hueco
 *   instrumental.
 *
 * - Solo con tiempo de línea: estimamos cuánto se tarda en cantarla
 *   (~70 ms por carácter, entre 0,9 s y la duración nominal) para que el
 *   relleno no se arrastre durante pausas largas ni corra de más.
 */
export function computeLineFill(line: LyricLine, nextStartMs: number, nowMs: number): number {
  if (line.words && line.words.length > 0) {
    const words = line.words
    const totalChars = words.reduce((n, w) => n + w.text.length, 0) || 1
    let sung = 0
    for (const w of words) {
      const end = w.timeMs + Math.max(1, w.durMs)
      if (nowMs >= end) {
        sung += w.text.length
      } else if (nowMs > w.timeMs) {
        sung += (w.text.length * (nowMs - w.timeMs)) / Math.max(1, w.durMs)
        break
      } else {
        break
      }
    }
    return Math.max(0, Math.min(100, (sung / totalChars) * 100))
  }

  // Estimación para letras solo-línea
  const nominal = Math.max(1, nextStartMs - line.timeMs)
  const estimated = Math.max(900, Math.min(nominal, line.text.length * 70))
  return Math.max(0, Math.min(100, ((nowMs - line.timeMs) / estimated) * 100))
}
