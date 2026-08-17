import { useEffect, useRef } from 'react'
import { usePlayer } from '../player/store'
import { engine } from '../player/engine'
import { useSettings } from '../app/settingsStore'

/**
 * Fondo ambiental estilo Discord Nitro: tres "blobs" de color de la carátula
 * (paleta 60-30-10) que derivan lentamente y respiran con el audio.
 *
 * Se dibuja en un canvas a baja resolución con blur CSS enorme: coste de
 * pintado despreciable, resultado orgánico. Respeta el modo elegido en Ajustes.
 */

export function AmbientBackground(): React.JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const current = usePlayer((s) => s.current())
  const bgMode = useSettings((s) => s.settings.bgMode)
  const freq = useRef(new Uint8Array(engine.analyserBins))

  useEffect(() => {
    if (bgMode === 'off') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = (canvas.width = 64)
    const H = (canvas.height = 40)

    const readVar = (name: string, fallback: string): string => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
      return v || fallback
    }

    let raf = 0
    let t = 0
    const render = (): void => {
      t += 0.006
      // Energía de graves para el "respiro" — amplificada para que sea
      // claramente visible incluso a volúmenes bajos/medios.
      let bass = 0
      if (bgMode === 'reactive') {
        engine.getFrequencyData(freq.current)
        // Ponderamos más los sub-graves (bins 0-7) que los graves altos (8-15)
        for (let i = 0; i < 16; i++) bass += freq.current[i] * (i < 8 ? 1.5 : 0.7)
        bass = bass / (16 * 255)
        // Curva de amplificación: eleva valores bajos para hacerlos visibles
        bass = Math.pow(bass, 0.6) // raíz ~0.6 → sube valores pequeños
        bass = Math.min(bass * 1.4, 1) // boost + clamp
      }
      const pulse = bgMode === 'reactive' ? 1 + bass * 0.7 : 1

      const c60 = readVar('--amb-60-soft', '#1a1a1a')
      const c30 = readVar('--amb-30', '#242424')
      const glow = readVar('--amb-glow', '#3a3a3a')

      ctx.clearRect(0, 0, W, H)
      const base = readVar('--amb-60', '#121212')
      ctx.fillStyle = base
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
      // Opacidad reactiva: sube con los graves para que el efecto sea más
      // evidente. Los blobs "brillan" con la música.
      const aBoost = bgMode === 'reactive' ? bass * 0.3 : 0

      ctx.globalCompositeOperation = 'lighter'
      blob(W * (0.3 + 0.15 * Math.sin(t)), H * (0.35 + 0.2 * Math.cos(t * 0.8)), 34 * pulse, c60, 0.9 + aBoost)
      blob(W * (0.7 + 0.12 * Math.cos(t * 0.9)), H * (0.6 + 0.18 * Math.sin(t * 1.1)), 30 * pulse, c30, 0.85 + aBoost)
      blob(W * (0.5 + 0.2 * Math.sin(t * 0.7)), H * (0.3 + 0.15 * Math.cos(t)), 24 * pulse, glow, 0.5 + aBoost * 0.6)
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'

      raf = requestAnimationFrame(render)
    }
    raf = requestAnimationFrame(render)
    return () => cancelAnimationFrame(raf)
  }, [bgMode, current?.thumbnailUrl])

  if (bgMode === 'off') return null

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        filter: 'blur(64px) saturate(1.4)',
        transform: 'scale(1.2)',
        opacity: 0.55,
        pointerEvents: 'none',
        transition: 'opacity 0.6s'
      }}
    />
  )
}
