// Parser de LRC (letras sincronizadas).
// Acepta timestamps [mm:ss.xx], [mm:ss.xxx], [mm:ss.x] y [mm:ss], con varios
// timestamps por línea ([00:12.00][00:24.00]texto). Ignora las etiquetas de
// metadatos ([ar:], [ti:], [al:], [length:], [offset:], [id:], etc.) porque
// no empiezan por dígitos. El [offset:] se ignora deliberadamente, igual que
// hace Metrolist en Android.

export interface LrcLine {
  timeMs: number
  text: string
}

/** Timestamp al principio de la línea (o encadenado tras otro timestamp) */
const HEAD_RE = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/

/** Timestamps "enhanced" incrustados en el texto (<mm:ss.xx>): se eliminan */
const INLINE_RE = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g

/** Convierte minutos, segundos y fracción a milisegundos.
 *  La fracción se interpreta por nº de cifras: 1 = décimas, 2 = centésimas, 3 = milésimas. */
function toMs(min: string, sec: string, frac: string | undefined): number {
  let ms = 0
  if (frac !== undefined && frac.length > 0) {
    ms = Number(frac) * [100, 10, 1][frac.length - 1]
  }
  return Number(min) * 60_000 + Number(sec) * 1000 + ms
}

/**
 * Parsea un texto LRC completo y devuelve las líneas sincronizadas ordenadas
 * por tiempo. Las líneas sin timestamp (metadatos o texto suelto) se ignoran.
 * Una línea con varios timestamps genera una entrada por cada uno.
 */
export function parseLrc(lrc: string): LrcLine[] {
  const out: LrcLine[] = []
  for (const rawLine of lrc.split(/\r?\n/)) {
    let rest = rawLine.trimStart()
    const times: number[] = []
    let m: RegExpExecArray | null
    while ((m = HEAD_RE.exec(rest)) !== null) {
      times.push(toMs(m[1], m[2], m[3]))
      rest = rest.slice(m[0].length).trimStart()
    }
    if (times.length === 0) continue
    const text = rest.replace(INLINE_RE, '').trim()
    for (const timeMs of times) out.push({ timeMs, text })
  }
  // Orden estable por tiempo (los LRC de KuGou a veces vienen desordenados)
  out.sort((a, b) => a.timeMs - b.timeMs)
  return out
}

/** Indica si el texto contiene al menos una línea con timestamp LRC válido. */
export function isLrcSynced(lrc: string): boolean {
  return /^\s*\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/m.test(lrc)
}
