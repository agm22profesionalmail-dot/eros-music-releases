import { useEffect, useRef } from 'react'
import { usePlayer } from '../player/store'
import { engine } from '../player/engine'

/**
 * Visualizador estilo Tuneform "Album Art Dual Mirrored Line Spectrum":
 * carátula cuadrada centrada con dos ondas de línea espejadas que salen a
 * izquierda y derecha, reaccionando al espectro FFT del audio actual.
 *
 * - Fondo: la carátula difuminada (misma técnica que LyricsPage) + capa oscura.
 * - Carátula: <img> normal, no se dibuja en el canvas (evita reescalar cada frame).
 * - Canvas a pantalla completa detrás de la carátula: dibuja dos curvas suaves
 *   espejadas (arriba y abajo del eje horizontal) por cada lado.
 * - Suavizado temporal para que la línea no parpadee (interpolación con el
 *   frame previo, factor 0.7).
 * - Envolvente de amplitud que decae hacia los bordes del canvas → las ondas
 *   se desvanecen de la carátula hacia fuera.
 * - Respeta `prefers-reduced-motion`: dibuja un frame estático y no anima.
 */

export function VisualizerPage(): React.JSX.Element {
  const current = usePlayer((s) => s.current())
  const isPlaying = usePlayer((s) => s.isPlaying)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const artRef = useRef<HTMLElement>(null)
  // Buffer de espectro crudo del engine + versión suavizada temporalmente
  const freqRaw = useRef(new Uint8Array(engine.analyserBins))
  const freqSmooth = useRef(new Float32Array(engine.analyserBins))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let raf = 0
    let disposed = false

    const resize = (): void => {
      const dpr = Math.max(1, window.devicePixelRatio || 1)
      canvas.width = Math.max(1, canvas.clientWidth * dpr)
      canvas.height = Math.max(1, canvas.clientHeight * dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    const readVar = (n: string, f: string): string => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim()
      return v || f
    }

    /** Dibuja una curva suave (quadraticCurveTo con puntos medios) por N vértices. */
    const strokeSmooth = (xs: number[], ys: number[]): void => {
      if (xs.length < 2) return
      ctx.beginPath()
      ctx.moveTo(xs[0], ys[0])
      for (let i = 1; i < xs.length - 1; i++) {
        const cx = (xs[i] + xs[i + 1]) / 2
        const cy = (ys[i] + ys[i + 1]) / 2
        ctx.quadraticCurveTo(xs[i], ys[i], cx, cy)
      }
      ctx.lineTo(xs[xs.length - 1], ys[xs.length - 1])
      ctx.stroke()
    }

    /**
     * Dibuja un espectro (línea + reflejo espejo vertical) desde `startX` hasta
     * `endX` a lo largo del eje horizontal `midY`. Ambos extremos pueden estar
     * en cualquier orden: la envolvente decae hacia el que esté más lejos de
     * la carátula (definido por `fadeToEnd = true` → decae hacia `endX`).
     */
    const drawSide = (
      startX: number,
      endX: number,
      midY: number,
      maxAmp: number,
      accent: string,
      glow: string
    ): void => {
      const N = 64 // vértices en la curva
      const bins = freqSmooth.current
      const usable = Math.min(bins.length, 96) // primeros ~96 bins = grave/medio
      const xs: number[] = new Array(N + 1)
      const yTop: number[] = new Array(N + 1)
      const yBot: number[] = new Array(N + 1)
      for (let i = 0; i <= N; i++) {
        const t = i / N // 0..1 desde startX (carátula) hacia endX (borde)
        const x = startX + t * (endX - startX)
        // Muestreo del espectro con distribución logarítmica: agudos comprimidos
        const binF = Math.pow(t, 1.35) * (usable - 1)
        const b0 = Math.floor(binF)
        const b1 = Math.min(usable - 1, b0 + 1)
        const frac = binF - b0
        const v = (bins[b0] * (1 - frac) + bins[b1] * frac) / 255
        // Envolvente: máxima junto a la carátula (t=0), se apaga hacia el borde
        const env = Math.pow(1 - t, 0.85)
        const amp = v * maxAmp * env
        xs[i] = x
        yTop[i] = midY - amp
        yBot[i] = midY + amp
      }

      // Degradado horizontal: opaco junto a la carátula, transparente al borde
      const grad = ctx.createLinearGradient(startX, 0, endX, 0)
      grad.addColorStop(0, accent)
      grad.addColorStop(0.55, glow)
      grad.addColorStop(1, 'rgba(0,0,0,0)')

      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = grad
      ctx.lineWidth = Math.max(2, 2.5 * (window.devicePixelRatio || 1))
      // Brillo sutil (glow) que refuerza la reactividad
      ctx.shadowColor = accent
      ctx.shadowBlur = 12 * (window.devicePixelRatio || 1)

      strokeSmooth(xs, yTop)
      strokeSmooth(xs, yBot)

      ctx.shadowBlur = 0
    }

    const step = (): void => {
      engine.getFrequencyData(freqRaw.current)
      // Suavizado temporal: mezcla frame previo (0.7) con nuevo (0.3)
      const raw = freqRaw.current
      const sm = freqSmooth.current
      for (let i = 0; i < sm.length; i++) sm[i] = sm[i] * 0.7 + raw[i] * 0.3

      const W = canvas.width
      const H = canvas.height
      ctx.clearRect(0, 0, W, H)

      const accent = readVar('--accent', '#f43f4f')
      const glow = readVar('--amb-glow', accent)

      // Zona ocupada por la carátula (para arrancar las líneas ahí)
      const art = artRef.current
      let leftEdge = W / 2
      let rightEdge = W / 2
      let midY = H / 2
      if (art) {
        const cr = canvas.getBoundingClientRect()
        const ar = art.getBoundingClientRect()
        const scaleX = W / Math.max(1, cr.width)
        const scaleY = H / Math.max(1, cr.height)
        leftEdge = (ar.left - cr.left) * scaleX
        rightEdge = (ar.right - cr.left) * scaleX
        midY = (ar.top - cr.top + ar.height / 2) * scaleY
      }
      // Margen para no rozar el borde exacto de la carátula
      const pad = 14 * (window.devicePixelRatio || 1)
      leftEdge -= pad
      rightEdge += pad

      // Amplitud máxima: un tercio de la altura, tope para no salirse
      const maxAmp = Math.min(H / 3, 260 * (window.devicePixelRatio || 1))

      // Lado izquierdo: desde el borde izq. de la carátula hacia x=0
      drawSide(leftEdge, 0, midY, maxAmp, accent, glow)
      // Lado derecho: desde el borde der. de la carátula hacia x=W
      drawSide(rightEdge, W, midY, maxAmp, accent, glow)

      if (!disposed && !reduced) raf = requestAnimationFrame(step)
    }

    if (reduced) {
      // Un único frame estático (línea plana) — respeta reduced-motion
      step()
    } else {
      raf = requestAnimationFrame(step)
    }

    return () => {
      disposed = true
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  // El bucle sigue corriendo aunque isPlaying=false para que la onda se
  // aplane suavemente (los bins caen por sí solos vía smoothingTimeConstant
  // del AnalyserNode + nuestro suavizado 0.7). `isPlaying` se referencia
  // para que React vuelva a mostrar el estado correcto si cambia.
  void isPlaying

  const artSize = 'min(52vh, 480px)'
  const bgUrl = current?.thumbnailUrl?.replace(/=w\d+-h\d+/, '=w1080-h1080')

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      {/* Fondo: carátula gigante difuminada */}
      {bgUrl && (
        <div
          key={current?.videoId}
          className="lyrics-bg"
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${bgUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(80px) saturate(1.3) brightness(0.4)',
            transform: 'scale(1.2)',
            opacity: 0,
            animation: 'lyrics-bg-in 1.2s var(--ease-out) forwards',
            zIndex: 0
          }}
        />
      )}
      {/* Capa oscura para dar contraste a las líneas */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 1,
          pointerEvents: 'none'
        }}
      />
      {/* Canvas del espectro (cubre toda la página) */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 2,
          pointerEvents: 'none'
        }}
      />
      {/* Contenido: carátula + título centrados */}
      <div
        style={{
          position: 'relative',
          zIndex: 3,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 28,
          padding: 32
        }}
      >
        {current?.thumbnailUrl ? (
          <img
            ref={artRef as React.RefObject<HTMLImageElement>}
            src={current.thumbnailUrl.replace(/=w\d+-h\d+/, '=w1080-h1080')}
            alt=""
            style={{
              width: artSize,
              height: artSize,
              objectFit: 'cover',
              borderRadius: 12,
              boxShadow: '0 30px 90px -20px var(--amb-glow, rgba(0,0,0,0.7))',
              animation: 'detail-in 0.5s var(--ease-spring) both'
            }}
          />
        ) : (
          // Placeholder invisible para que el canvas sepa dónde "estaría" el arte
          <div
            ref={artRef as React.RefObject<HTMLDivElement>}
            style={{ width: artSize, height: artSize }}
          />
        )}
        <div style={{ textAlign: 'center', maxWidth: 720 }}>
          <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.15 }}>
            {current?.title ?? 'Nada sonando'}
          </div>
          <div style={{ fontSize: 16, color: 'var(--text-secondary)', marginTop: 6 }}>
            {current?.artists.map((a) => a.name).join(', ')}
          </div>
        </div>
      </div>
    </div>
  )
}
