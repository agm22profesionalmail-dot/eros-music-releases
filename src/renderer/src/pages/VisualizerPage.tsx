import { useEffect, useRef } from 'react'
import { usePlayer } from '../player/store'
import { engine } from '../player/engine'

/**
 * Visualizador a pantalla completa: carátula grande con un espectro de barras
 * en espejo debajo, todo teñido con la paleta de la carátula. Estilo "now
 * playing" de reproductores premium.
 */

export function VisualizerPage(): React.JSX.Element {
  const current = usePlayer((s) => s.current())
  const isPlaying = usePlayer((s) => s.isPlaying)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const freq = useRef(new Uint8Array(engine.analyserBins))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    const resize = (): void => {
      canvas.width = canvas.clientWidth * devicePixelRatio
      canvas.height = canvas.clientHeight * devicePixelRatio
    }
    resize()
    window.addEventListener('resize', resize)

    const readVar = (n: string, f: string): string => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim()
      return v || f
    }

    const render = (): void => {
      engine.getFrequencyData(freq.current)
      const W = canvas.width
      const H = canvas.height
      ctx.clearRect(0, 0, W, H)

      const accent = readVar('--accent', '#f43f4f')
      const glow = readVar('--amb-glow', accent)

      const bars = 64
      const step = Math.floor(freq.current.length / bars)
      const gap = 2 * devicePixelRatio
      const bw = (W - gap * (bars - 1)) / bars
      const mid = H / 2

      for (let i = 0; i < bars; i++) {
        let sum = 0
        for (let j = 0; j < step; j++) sum += freq.current[i * step + j]
        const v = sum / step / 255
        const h = Math.max(2 * devicePixelRatio, v * mid * 0.92)
        const x = i * (bw + gap)

        const grad = ctx.createLinearGradient(0, mid - h, 0, mid + h)
        grad.addColorStop(0, glow)
        grad.addColorStop(0.5, accent)
        grad.addColorStop(1, glow)
        ctx.fillStyle = grad
        // Espejo arriba y abajo del centro (redondeado)
        const r = bw / 2
        roundRect(ctx, x, mid - h, bw, h * 2, r)
        ctx.fill()
      }
      raf = requestAnimationFrame(render)
    }
    raf = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
        padding: 40
      }}
    >
      {current?.thumbnailUrl && (
        <div
          style={{
            position: 'relative',
            width: 'min(38vh, 340px)',
            height: 'min(38vh, 340px)',
            animation: 'detail-in 0.5s var(--ease-spring) both'
          }}
        >
          {/* Halo radial del acento */}
          <div
            style={{
              position: 'absolute',
              inset: '-24%',
              borderRadius: '50%',
              background:
                'radial-gradient(closest-side, color-mix(in srgb, var(--accent) 45%, transparent), transparent 70%)',
              filter: 'blur(40px)',
              pointerEvents: 'none'
            }}
          />
          {/* Disco de vinilo girando */}
          <img
            src={current.thumbnailUrl}
            alt=""
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: '50%',
              boxShadow:
                '0 30px 90px -20px var(--amb-glow, rgba(0,0,0,0.7)), inset 0 0 0 6px rgba(0,0,0,0.6)',
              animation: 'vinyl-spin 24s linear infinite',
              animationPlayState: isPlaying ? 'running' : 'paused'
            }}
          />
          {/* Agujero central */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: 'var(--amb-60, #111)',
              boxShadow: 'inset 0 0 0 3px rgba(255,255,255,0.15)'
            }}
          />
        </div>
      )}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 26, fontWeight: 800 }}>{current?.title ?? 'Nada sonando'}</div>
        <div style={{ fontSize: 16, color: 'var(--text-secondary)', marginTop: 6 }}>
          {current?.artists.map((a) => a.name).join(', ')}
        </div>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', maxWidth: 720, height: 140, flexShrink: 0 }}
      />
    </div>
  )
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}
