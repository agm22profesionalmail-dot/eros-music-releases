/**
 * Paleta 60-30-10 extraída de una carátula.
 *
 * - base   (60 %): tono dominante, para fondos — se sirve oscurecido/aclarado
 * - mid    (30 %): tono secundario, para superficies y degradados
 * - accent (10 %): el color más vibrante, para controles y estados activos
 *
 * Algoritmo: histograma de tono (12 sectores) ponderado por saturación y
 * población sobre una miniatura de 32×32. Sin dependencias.
 */

export interface ArtPalette {
  /** Tono dominante en grados [0-360) */
  baseHue: number
  baseSat: number
  /** Tono secundario */
  midHue: number
  midSat: number
  /** Acento listo para usar (hex) */
  accent: string
  accentHue: number
}

const cache = new Map<string, ArtPalette>()

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h * 360, s, l]
}

export function hslCss(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`
}

export async function extractPalette(url: string): Promise<ArtPalette | null> {
  const hit = cache.get(url)
  if (hit) return hit
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('img'))
    })
    const size = 32
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, size, size)
    const { data } = ctx.getImageData(0, 0, size, size)

    // Histograma de 12 sectores de tono, ponderado por saturación
    const BINS = 12
    const weight = new Array<number>(BINS).fill(0)
    const satSum = new Array<number>(BINS).fill(0)
    const count = new Array<number>(BINS).fill(0)
    let bestAccent: { h: number; s: number; l: number; score: number } | null = null

    for (let i = 0; i < data.length; i += 4) {
      const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2])
      if (l < 0.06 || l > 0.96) continue // casi negro/blanco: no definen tono
      const bin = Math.floor(h / (360 / BINS)) % BINS
      const w = 0.25 + s // los píxeles saturados definen más el carácter
      weight[bin] += w
      satSum[bin] += s
      count[bin]++
      // Candidato a acento: saturado y de luminosidad media
      if (s > 0.35 && l > 0.22 && l < 0.82) {
        const score = s * (1 - Math.abs(l - 0.55))
        if (!bestAccent || score > bestAccent.score) bestAccent = { h, s, l, score }
      }
    }

    const order = weight
      .map((w, i) => ({ w, i }))
      .sort((a, b) => b.w - a.w)
      .map((x) => x.i)

    const baseBin = order[0] ?? 0
    // El secundario: el siguiente sector con población real y tono distinto
    const midBin =
      order.find((b) => b !== baseBin && count[b] > 8 && Math.abs(b - baseBin) % BINS > 1) ??
      (baseBin + 2) % BINS

    const binHue = (b: number): number => (b + 0.5) * (360 / BINS)
    const binSat = (b: number): number => (count[b] ? Math.min(0.9, satSum[b] / count[b]) : 0.3)

    // Acento utilizable: fuerza saturación y luminosidad de control
    let accentHue = bestAccent?.h ?? binHue(baseBin)
    let accentSat = Math.max(0.62, bestAccent?.s ?? 0.62)
    let accentLum = 0.58
    if (!bestAccent) {
      // Carátula gris: acento neutro cálido, no inventamos color chillón
      accentSat = 0.08
      accentLum = 0.72
      accentHue = 40
    }

    const palette: ArtPalette = {
      baseHue: binHue(baseBin),
      baseSat: binSat(baseBin),
      midHue: binHue(midBin),
      midSat: binSat(midBin),
      accent: hslCss(accentHue, accentSat, accentLum),
      accentHue
    }
    cache.set(url, palette)
    return palette
  } catch {
    return null
  }
}
