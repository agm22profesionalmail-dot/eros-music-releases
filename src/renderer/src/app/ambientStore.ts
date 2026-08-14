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

function paintPalette(p: ArtPalette | null, dynamicAccent: boolean): void {
  const root = document.documentElement.style
  if (!p) {
    root.removeProperty('--amb-60')
    root.removeProperty('--amb-30')
    root.removeProperty('--amb-glow')
    root.removeProperty('--amb-30-hue')
    return
  }
  // 60 %: base oscura pero con el tinte del disco (no negro plano)
  root.setProperty('--amb-60', hslCss(p.baseHue, Math.min(0.5, p.baseSat), 0.09))
  root.setProperty('--amb-60-soft', hslCss(p.baseHue, Math.min(0.4, p.baseSat), 0.14))
  // 30 %: superficie secundaria, algo más clara y con el tono medio
  root.setProperty('--amb-30', hslCss(p.midHue, Math.min(0.55, p.midSat), 0.16))
  root.setProperty('--amb-30-hue', String(Math.round(p.midHue)))
  // Glow del acento para halos y sombras de color
  root.setProperty('--amb-glow', hslCss(p.accentHue, 0.7, 0.55))

  if (dynamicAccent) {
    root.setProperty('--accent', p.accent)
    root.setProperty('--accent-hover', hslCss(p.accentHue, 0.72, 0.66))
    root.setProperty('--accent-press', hslCss(p.accentHue, 0.72, 0.5))
  }
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
  paintPalette(palette, dynamic)
  useAmbient.setState({ palette })
}
