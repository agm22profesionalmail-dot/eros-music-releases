import { useEffect, useState } from 'react'

/**
 * Extrae un color dominante "vibrante" de una carátula (estilo Material You
 * de Metrolist): media de los píxeles más saturados de una miniatura 24x24,
 * con recorte de luminosidad para que siempre sea usable como acento.
 */

const cache = new Map<string, string>()

export async function extractAccent(url: string): Promise<string | null> {
  if (cache.has(url)) return cache.get(url)!
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('img'))
    })
    const size = 24
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, size, size)
    const { data } = ctx.getImageData(0, 0, size, size)

    // Junta los píxeles con más saturación
    let r = 0
    let g = 0
    let b = 0
    let count = 0
    for (let i = 0; i < data.length; i += 4) {
      const pr = data[i]
      const pg = data[i + 1]
      const pb = data[i + 2]
      const max = Math.max(pr, pg, pb)
      const min = Math.min(pr, pg, pb)
      const sat = max === 0 ? 0 : (max - min) / max
      const lum = (pr * 0.299 + pg * 0.587 + pb * 0.114) / 255
      if (sat > 0.35 && lum > 0.15 && lum < 0.9) {
        r += pr
        g += pg
        b += pb
        count++
      }
    }
    if (count < 8) {
      // Carátula poco saturada (B/N): media global aclarada
      r = g = b = 0
      count = 0
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]
        g += data[i + 1]
        b += data[i + 2]
        count++
      }
    }
    r = Math.round(r / count)
    g = Math.round(g / count)
    b = Math.round(b / count)

    // Ajusta luminosidad a un rango útil como acento sobre fondo oscuro
    const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255
    if (lum < 0.35) {
      const k = 0.45 / Math.max(lum, 0.05)
      r = Math.min(255, Math.round(r * k))
      g = Math.min(255, Math.round(g * k))
      b = Math.min(255, Math.round(b * k))
    }

    const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
    cache.set(url, hex)
    return hex
  } catch {
    return null
  }
}

/** Hook: color de acento derivado de una imagen (o null mientras carga). */
export function useArtworkColor(url: string | undefined): string | null {
  const [color, setColor] = useState<string | null>(url ? (cache.get(url) ?? null) : null)
  useEffect(() => {
    if (!url) {
      setColor(null)
      return
    }
    let cancelled = false
    void extractAccent(url).then((c) => {
      if (!cancelled) setColor(c)
    })
    return () => {
      cancelled = true
    }
  }, [url])
  return color
}
