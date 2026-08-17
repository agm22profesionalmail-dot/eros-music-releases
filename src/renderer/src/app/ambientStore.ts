import { create } from 'zustand'
import { extractPalette, hslCss, type ArtPalette } from './palette'
import { usePlayer } from '../player/store'

/**
 * Ambiente dinámico: extrae la paleta 60-30-10 de la carátula en reproducción
 * y la publica como variables CSS con transición suave.
 *
 * Reparto:
 *   --amb-60 : fondo dominante (superficie base, muy oscurecido)
 *   --amb-30 : superficie secundaria (paneles, degradados)
 *   --amb-10 : acento (controles activos) — solo si accentMode === 'dynamic'
 * Se derivan tonos listos: --amb-60-soft, --amb-glow, etc.
 */

interface AmbientState {
  enabled: boolean
  palette: ArtPalette | null
  setEnabled: (v: boolean) => void
  init: () => void
}

/** Devuelve #000 o #fff según cuál contrasta mejor con el color hex/hsl dado. */
/** Canal sRGB (0-1) a espacio lineal, para luminancia relativa WCAG. */
function toLinear(c: number): number {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/**
 * F62 · Mismo criterio que `contrastForHex` de settingsStore: luminancia
 * relativa WCAG con cruce en 0.179 (la heurística vieja, sin gamma y con
 * umbral 0.62, devolvía blanco sobre colores medios donde el negro contrasta
 * el doble). Para `hsl(...)` se sigue usando la lightness declarada, que no es
 * luminancia real; el umbral 0.62 sí es razonable en ese espacio.
 */
function contrastFor(bg: string): string {
  const hslMatch = bg.match(/hsl\(\s*[\d.]+\s*[,\s]\s*[\d.]+%?\s*[,\s]\s*([\d.]+)%/)
  if (hslMatch) return Number(hslMatch[1]) / 100 > 0.62 ? '#000' : '#fff'
  if (bg.startsWith('#') && (bg.length === 7 || bg.length === 4)) {
    const hex = bg.length === 4 ? '#' + bg.slice(1).split('').map((c) => c + c).join('') : bg
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    const lum = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
    return lum > 0.179 ? '#000' : '#fff'
  }
  return '#fff'
}

/**
 * F46 · Interpolación de tono en el círculo de color (grados) tomando el
 * camino más corto. Sin esto, ir de 350° → 10° pasaría por 340° dando un
 * "arcoíris invertido" en vez del degradado natural rojo → naranja.
 */
function lerpHue(a: number, b: number, t: number): number {
  const diff = ((b - a + 540) % 360) - 180
  return (a + diff * t + 360) % 360
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function applyPaletteVars(p: ArtPalette | null, dynamicAccent: boolean): void {
  const root = document.documentElement.style
  const presetActive = Boolean(document.documentElement.dataset.themePreset)
  if (!p || presetActive) {
    root.removeProperty('--amb-60')
    root.removeProperty('--amb-60-soft')
    root.removeProperty('--amb-30')
    root.removeProperty('--amb-30-hue')
    if (!p) {
      root.removeProperty('--amb-glow')
      if (dynamicAccent) root.removeProperty('--accent-fg')
      return
    }
  } else {
    root.setProperty('--amb-60', hslCss(p.baseHue, Math.min(0.5, p.baseSat), 0.09))
    root.setProperty('--amb-60-soft', hslCss(p.baseHue, Math.min(0.4, p.baseSat), 0.14))
    root.setProperty('--amb-30', hslCss(p.midHue, Math.min(0.55, p.midSat), 0.16))
    root.setProperty('--amb-30-hue', String(Math.round(p.midHue)))
  }
  root.setProperty('--amb-glow', hslCss(p.accentHue, 0.7, 0.55))
  if (dynamicAccent) {
    root.setProperty('--accent', p.accent)
    root.setProperty('--accent-hover', hslCss(p.accentHue, 0.72, 0.66))
    root.setProperty('--accent-press', hslCss(p.accentHue, 0.72, 0.5))
    root.setProperty('--accent-fg', contrastFor(p.accent))
  }
}

// F46 · rAF handle activo, para cancelar tweens si arranca otro crossfade.
let paletteTween: number | null = null

/**
 * F46 · Aplica la paleta. Si viene un `from` y `durationMs`, interpola las
 * variables CSS gradualmente durante ese tiempo con requestAnimationFrame
 * — así el ambient acompaña al fade de audio con la misma duración exacta
 * (los colores nunca "saltan" al final del crossfade).
 */
function paintPalette(
  p: ArtPalette | null,
  dynamicAccent: boolean,
  opts?: { from?: ArtPalette | null; durationMs?: number }
): void {
  if (paletteTween != null) {
    cancelAnimationFrame(paletteTween)
    paletteTween = null
  }
  const from = opts?.from
  const dur = opts?.durationMs ?? 0
  if (!from || !p || dur <= 50) {
    applyPaletteVars(p, dynamicAccent)
    return
  }
  const start = performance.now()
  const step = (now: number): void => {
    const t = Math.max(0, Math.min(1, (now - start) / dur))
    const accentHue = lerpHue(from.accentHue, p.accentHue, t)
    const accentSat = lerp(from.accentSat ?? 0.7, p.accentSat ?? 0.7, t)
    const accentLum = lerp(from.accentLum ?? 0.58, p.accentLum ?? 0.58, t)
    const interp: ArtPalette = {
      baseHue: lerpHue(from.baseHue, p.baseHue, t),
      baseSat: lerp(from.baseSat, p.baseSat, t),
      midHue: lerpHue(from.midHue, p.midHue, t),
      midSat: lerp(from.midSat, p.midSat, t),
      accentHue,
      accentSat,
      accentLum,
      // F50 · El acento también se interpola (antes saltaba en t=0.5):
      // se reconstruye desde sus componentes HSL fundidos.
      accent: hslCss(accentHue, accentSat, accentLum)
    }
    applyPaletteVars(interp, dynamicAccent)
    if (t < 1) paletteTween = requestAnimationFrame(step)
    else paletteTween = null
  }
  paletteTween = requestAnimationFrame(step)
}

export const useAmbient = create<AmbientState>((set, get) => ({
  enabled: true,
  palette: null,
  setEnabled: (v) => {
    set({ enabled: v })
    if (!v) paintPalette(null, false)
    else {
      const cur = usePlayer.getState().current()
      if (cur?.thumbnailUrl) void refresh(cur.thumbnailUrl)
    }
  },
  init: () => {
    let lastUrl: string | undefined
    usePlayer.subscribe((state) => {
      const url = state.current()?.thumbnailUrl
      if (url === lastUrl) return
      lastUrl = url
      if (get().enabled && url) void refresh(url)
      else if (!url) paintPalette(null, false)
    })
  }
}))

async function refresh(url: string): Promise<void> {
  const palette = await extractPalette(url)
  if (!palette) return
  // ¿El acento sigue a la carátula? (lo lee settingsStore vía data-attr)
  const dynamic = document.documentElement.dataset.accentMode === 'dynamic'
  // F46 · Si hay un crossfade audio en curso, interpola durante la misma
  // duración para que el fundido visual acompañe al sonido.
  // F49 · Si NO hay crossfade audio (xfade=0, clic manual, ended sin
  // solape), aún interpolamos entre la paleta anterior y la nueva con un
  // fundido corto (700 ms) — así el ambient NUNCA salta de golpe entre
  // colores, siempre hay blending fluido.
  const cx = usePlayer.getState().crossfading
  const from = useAmbient.getState().palette
  const durationMs = cx?.durationMs ?? (from ? 700 : 0)
  paintPalette(palette, dynamic, { from, durationMs })
  useAmbient.setState({ palette })
}
