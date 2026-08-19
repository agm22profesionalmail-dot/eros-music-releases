import { useEffect, useMemo, useRef } from 'react'
import { usePlayer } from '../player/store'
import { engine } from '../player/engine'
import { useSettings } from '../app/settingsStore'
import type { BgDesignId } from '../app/bgDesigns'

/**
 * Fondo ambiental: una capa animada a baja resolución con blur CSS enorme que
 * toma los colores de la carátula (variables `--amb-*`) y, en modo `reactive`,
 * respira con los graves del audio.
 *
 * El ajuste `bgDesign` elige la RUTINA DE DIBUJO (blobs · ondas · partículas ·
 * aurora · carátula); `bgMode` decide aparte si reacciona al audio. Todos los
 * diseños comparten el mismo carácter difuminado de fondo — esto NO es el
 * visualizador a pantalla completa (`VisualizerPage`), que es otra feature.
 */

interface DesignCfg {
  /** Resolución interna del canvas (px). Baja = barato + más blur. */
  w: number
  h: number
  /** Blur CSS aplicado al canvas. */
  blur: number
  /** Opacidad de la capa. */
  opacity: number
  /** Escala CSS (evita bordes al desplazar los blobs). */
  scale: number
  /** Saturación CSS. */
  sat: number
}

// Cada diseño ajusta resolución/blur a su naturaleza: los suaves (blobs,
// aurora, artwork) van a baja resolución con mucho blur; ondas y partículas
// piden algo más de definición (más px, menos blur) para que se aprecie la
// forma sin dejar de ser ambientales.
const DESIGN_CFG: Record<BgDesignId, DesignCfg> = {
  blobs: { w: 64, h: 40, blur: 64, opacity: 0.55, scale: 1.2, sat: 1.4 },
  aurora: { w: 64, h: 40, blur: 70, opacity: 0.6, scale: 1.3, sat: 1.5 },
  artwork: { w: 96, h: 64, blur: 46, opacity: 0.5, scale: 1.25, sat: 1.3 },
  waves: { w: 200, h: 120, blur: 30, opacity: 0.52, scale: 1.1, sat: 1.45 },
  particles: { w: 200, h: 120, blur: 18, opacity: 0.55, scale: 1.1, sat: 1.5 }
}

const PARTICLE_COUNT = 46

interface Palette {
  base: string
  c60: string
  c30: string
  glow: string
}

export function AmbientBackground(): React.JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const current = usePlayer((s) => s.current())
  const bgMode = useSettings((s) => s.settings.bgMode)
  const bgDesign = useSettings((s) => s.settings.bgDesign)
  const freq = useRef(new Uint8Array(engine.analyserBins))

  const cfg = DESIGN_CFG[bgDesign] ?? DESIGN_CFG.blobs

  useEffect(() => {
    if (bgMode === 'off') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = (canvas.width = cfg.w)
    const H = (canvas.height = cfg.h)

    const readVar = (name: string, fallback: string): string => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
      return v || fallback
    }
    const palette = (): Palette => ({
      base: readVar('--amb-60', '#121212'),
      c60: readVar('--amb-60-soft', '#1a1a1a'),
      c30: readVar('--amb-30', '#242424'),
      glow: readVar('--amb-glow', '#3a3a3a')
    })

    // Carátula para el diseño "artwork" (no necesita CORS: sólo se dibuja, no
    // se leen píxeles, así que un canvas "tainted" es irrelevante aquí).
    let art: HTMLImageElement | null = null
    if (bgDesign === 'artwork' && current?.thumbnailUrl) {
      art = new Image()
      art.src = current.thumbnailUrl
    }

    // Partículas persistentes durante la vida del efecto (posiciones
    // normalizadas 0..1 para sobrevivir al cambio de resolución).
    const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      r: 4 + Math.random() * 10,
      vy: (Math.random() - 0.5) * 0.03,
      band: 1 + (i % 14),
      tint: Math.random()
    }))

    let raf = 0
    let t = 0

    const readBass = (): number => {
      if (bgMode !== 'reactive') return 0
      engine.getFrequencyData(freq.current)
      let bass = 0
      for (let i = 0; i < 16; i++) bass += freq.current[i] * (i < 8 ? 1.5 : 0.7)
      bass = bass / (16 * 255)
      bass = Math.pow(bass, 0.6)
      return Math.min(bass * 1.4, 1)
    }

    // ---------- Rutinas de dibujo ----------

    // Diseño original: tres blobs radiales que derivan y "brillan" con graves.
    const drawBlobs = (bass: number, p: Palette): void => {
      const pulse = bgMode === 'reactive' ? 1 + bass * 0.7 : 1
      ctx.fillStyle = p.base
      ctx.fillRect(0, 0, W, H)
      const blob = (cx: number, cy: number, r: number, color: string, alpha: number): void => {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
        g.addColorStop(0, color)
        g.addColorStop(1, 'transparent')
        ctx.globalAlpha = alpha
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fill()
      }
      const aBoost = bgMode === 'reactive' ? bass * 0.3 : 0
      ctx.globalCompositeOperation = 'lighter'
      blob(W * (0.3 + 0.15 * Math.sin(t)), H * (0.35 + 0.2 * Math.cos(t * 0.8)), 34 * pulse, p.c60, 0.9 + aBoost)
      blob(W * (0.7 + 0.12 * Math.cos(t * 0.9)), H * (0.6 + 0.18 * Math.sin(t * 1.1)), 30 * pulse, p.c30, 0.85 + aBoost)
      blob(W * (0.5 + 0.2 * Math.sin(t * 0.7)), H * (0.3 + 0.15 * Math.cos(t)), 24 * pulse, p.glow, 0.5 + aBoost * 0.6)
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }

    // Ondas sinusoidales apiladas que se desplazan; la amplitud crece con graves.
    const drawWaves = (bass: number, p: Palette): void => {
      ctx.fillStyle = p.base
      ctx.fillRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'lighter'
      const layers = [
        { color: p.c60, amp: 0.1, y: 0.66, speed: 1, freq: 1.4, alpha: 0.55 },
        { color: p.c30, amp: 0.08, y: 0.78, speed: -0.7, freq: 2, alpha: 0.5 },
        { color: p.glow, amp: 0.06, y: 0.9, speed: 1.3, freq: 2.6, alpha: 0.4 }
      ]
      for (const L of layers) {
        const amp = H * (L.amp + bass * 0.14)
        const baseY = H * L.y
        ctx.beginPath()
        ctx.moveTo(0, H)
        for (let x = 0; x <= W; x += 2) {
          const y = baseY + Math.sin((x / W) * Math.PI * 2 * L.freq + t * L.speed) * amp
          ctx.lineTo(x, y)
        }
        ctx.lineTo(W, H)
        ctx.closePath()
        const g = ctx.createLinearGradient(0, baseY - amp, 0, H)
        g.addColorStop(0, L.color)
        g.addColorStop(1, 'transparent')
        ctx.globalAlpha = Math.min(1, L.alpha + bass * 0.2)
        ctx.fillStyle = g
        ctx.fill()
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }

    // Puntos que derivan y pulsan por banda de frecuencia (tipo "glow pills").
    const drawParticles = (bass: number, p: Palette): void => {
      ctx.fillStyle = p.base
      ctx.fillRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'lighter'
      const cols = [p.c60, p.c30, p.glow]
      const reactive = bgMode === 'reactive'
      for (const pt of particles) {
        const e = reactive ? freq.current[pt.band] / 255 : 0.45 + 0.15 * Math.sin(t + pt.tint * 6)
        const rr = pt.r * (0.55 + e * 1.7)
        const x = pt.x * W
        const y = (((pt.y + t * pt.vy) % 1) + 1) % 1 * H
        const col = cols[Math.floor(pt.tint * cols.length) % cols.length]
        const g = ctx.createRadialGradient(x, y, 0, x, y, rr)
        g.addColorStop(0, col)
        g.addColorStop(1, 'transparent')
        ctx.globalAlpha = 0.22 + e * 0.6
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, rr, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }

    // Cortinas de color que se cruzan lateralmente y respiran con el audio.
    const drawAurora = (bass: number, p: Palette): void => {
      ctx.fillStyle = p.base
      ctx.fillRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'lighter'
      const bands = [
        { color: p.c60, x: 0.32, w: 0.5, speed: 0.6, alpha: 0.5 },
        { color: p.c30, x: 0.62, w: 0.46, speed: -0.5, alpha: 0.45 },
        { color: p.glow, x: 0.48, w: 0.4, speed: 0.9, alpha: 0.4 }
      ]
      for (const b of bands) {
        const cx = W * (b.x + 0.2 * Math.sin(t * b.speed))
        const halfW = W * b.w * 0.5 * (1 + bass * 0.35)
        const g = ctx.createLinearGradient(cx - halfW, 0, cx + halfW, 0)
        g.addColorStop(0, 'transparent')
        g.addColorStop(0.5, b.color)
        g.addColorStop(1, 'transparent')
        ctx.globalAlpha = Math.min(1, b.alpha + bass * 0.2)
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }

    // Carátula muy ampliada con zoom/deriva lentos (Ken Burns) + pulso sutil.
    const drawArtwork = (bass: number, p: Palette): void => {
      if (!art || !art.complete || art.naturalWidth === 0) {
        drawBlobs(bass, p) // aún sin cargar la imagen → blobs de respaldo
        return
      }
      const zoom = 1.15 + 0.06 * Math.sin(t * 0.4) + bass * 0.06
      const ar = art.naturalWidth / art.naturalHeight
      const car = W / H
      let dw: number
      let dh: number
      if (ar > car) {
        dh = H * zoom
        dw = dh * ar
      } else {
        dw = W * zoom
        dh = dw / ar
      }
      const dx = (W - dw) / 2 + Math.sin(t * 0.25) * W * 0.04
      const dy = (H - dh) / 2 + Math.cos(t * 0.2) * H * 0.04
      ctx.drawImage(art, dx, dy, dw, dh)
    }

    const render = (): void => {
      t += 0.006
      const bass = readBass()
      const p = palette()
      ctx.clearRect(0, 0, W, H)
      switch (bgDesign) {
        case 'waves':
          drawWaves(bass, p)
          break
        case 'particles':
          drawParticles(bass, p)
          break
        case 'aurora':
          drawAurora(bass, p)
          break
        case 'artwork':
          drawArtwork(bass, p)
          break
        case 'blobs':
        default:
          drawBlobs(bass, p)
          break
      }
      raf = requestAnimationFrame(render)
    }
    raf = requestAnimationFrame(render)
    return () => cancelAnimationFrame(raf)
  }, [bgMode, bgDesign, cfg.w, cfg.h, current?.thumbnailUrl])

  const style = useMemo<React.CSSProperties>(
    () => ({
      position: 'fixed',
      inset: 0,
      width: '100%',
      height: '100%',
      zIndex: 0,
      filter: `blur(${cfg.blur}px) saturate(${cfg.sat})`,
      transform: `scale(${cfg.scale})`,
      opacity: cfg.opacity,
      pointerEvents: 'none',
      transition: 'opacity 0.6s'
    }),
    [cfg]
  )

  if (bgMode === 'off') return null

  return <canvas ref={canvasRef} aria-hidden="true" style={style} />
}
