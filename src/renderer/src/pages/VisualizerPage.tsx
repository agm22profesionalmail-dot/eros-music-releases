import { useEffect, useRef } from 'react'
import { usePlayer } from '../player/store'
import { engine } from '../player/engine'
import { useT } from '../app/i18n'
import { CoverLayer, CrossfadeBlurBg, hiRes, useCrossfadeFrom } from '../components/CrossfadeVisual'

/**
 * Visualizador "plumas de tinta" (F36, rediseño con /impeccable + /taste):
 * carátula cuadrada centrada y, a cada lado, una pluma simétrica de barras
 * redondeadas que reacciona al espectro FFT.
 *
 * Decisiones de diseño (por qué así y no ondas):
 * - Las barras NUNCA tocan la carátula ni los bordes: envolvente de lente
 *   sin(π·t) que nace en cero a 32 px del arte, culmina a media distancia y
 *   muere antes del borde. Nada de líneas clavadas en las esquinas del álbum.
 * - Barras con remate redondeado, 32 por lado, finas (2.5–8 px según hueco
 *   disponible) en vez de curvas: más detalle, menos "bloque genérico".
 * - Ataque rápido / caída lenta (0.55/0.12): el golpe de bombo entra seco y
 *   se desvanece como tinta, en lugar del parpadeo nervioso del FFT crudo.
 * - Altura máxima capada al 42 % del alto de la carátula: la energía vive en
 *   la franja central, lejos de las esquinas.
 * - Fondo: la carátula difuminada (misma técnica que LyricsPage) + capa oscura.
 * - Respeta `prefers-reduced-motion`: dibuja un frame estático y no anima.
 * - F38 · El tamaño del canvas se resincroniza con ResizeObserver + un watch
 *   de devicePixelRatio (no solo `window.resize`): así no se desalinea al
 *   mover la ventana a un monitor con otro factor de escala o al maximizar.
 */

export function VisualizerPage(): React.JSX.Element {
  const t = useT()
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

    // F38 · El buffer del canvas (canvas.width/height) solo se recalcula
    // aquí — si se desincroniza del tamaño CSS real, todo el dibujo queda
    // desplazado/estirado ("el espacio se ve mal"). `window.resize` NO basta:
    // mover la ventana a un monitor con otro factor de escala (DPI) cambia
    // `devicePixelRatio` sin que el viewport cambie de tamaño, así que ese
    // evento no siempre dispara. Usamos ResizeObserver (reacciona al tamaño
    // real del propio elemento, con o sin evento de window) + un watcher de
    // DPI con matchMedia (patrón estándar para detectar cambios de escala).
    const resize = (): void => {
      const dpr = Math.max(1, window.devicePixelRatio || 1)
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
    }
    resize()

    const ro = new ResizeObserver(() => resize())
    ro.observe(canvas)

    let dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    const onDprChange = (): void => {
      resize()
      dprQuery.removeEventListener('change', onDprChange)
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      dprQuery.addEventListener('change', onDprChange)
    }
    dprQuery.addEventListener('change', onDprChange)
    // Red de seguridad: sigue escuchando el resize de window por si acaso.
    window.addEventListener('resize', resize)

    const readVar = (n: string, f: string): string => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim()
      return v || f
    }

    /**
     * Dibuja una pluma de barras simétricas desde `startX` (junto a la
     * carátula) hacia `endX` (hacia el borde). La envolvente de lente
     * sin(π·t)^0.85 vale 0 en ambos extremos: la primera barra nace plana al
     * lado del arte y la última muere antes del borde — nada toca nada.
     */
    const drawSide = (
      startX: number,
      endX: number,
      midY: number,
      maxAmp: number,
      accent: string,
      glow: string
    ): void => {
      const N = 32 // barras por lado (+6 a petición: hay sitio de sobra)
      const bins = freqSmooth.current
      const usable = Math.min(bins.length, 96) // primeros ~96 bins = grave/medio
      const dpr = window.devicePixelRatio || 1
      const span = endX - startX // puede ser negativo en el lado izquierdo
      const step = span / N
      // Más finas: antes ocupaban 55% del hueco (tope 14px), ahora 34% (tope 8px)
      const barW = Math.max(2.5 * dpr, Math.min(8 * dpr, Math.abs(step) * 0.34))
      const minH = 2 * dpr // latido mínimo en silencio

      // Degradado horizontal: acento junto a la carátula, glow ambiental lejos
      const grad = ctx.createLinearGradient(startX, 0, endX, 0)
      grad.addColorStop(0, accent)
      grad.addColorStop(1, glow)
      ctx.fillStyle = grad
      ctx.shadowColor = accent
      ctx.shadowBlur = 10 * dpr

      ctx.beginPath()
      for (let i = 0; i < N; i++) {
        const t = (i + 0.5) / N // centro de la barra, 0..1 hacia el borde
        // Muestreo del espectro con distribución logarítmica: agudos comprimidos
        const binF = Math.pow(t, 1.35) * (usable - 1)
        const b0 = Math.floor(binF)
        const b1 = Math.min(usable - 1, b0 + 1)
        const frac = binF - b0
        const v = (bins[b0] * (1 - frac) + bins[b1] * frac) / 255
        // Envolvente de lente: cero en ambos extremos, plena a media distancia.
        // También modula el latido mínimo para que la fila de puntos en
        // silencio se desvanezca en las puntas en lugar de cortarse seca.
        const env = Math.pow(Math.sin(Math.PI * t), 0.85)
        const amp = Math.max(minH * (0.35 + 0.65 * env), v * maxAmp * env)
        const cx = startX + (i + 0.5) * step
        const r = barW / 2
        ctx.roundRect(cx - r, midY - amp, barW, amp * 2, r)
      }
      ctx.fill()
      ctx.shadowBlur = 0
    }

    const step = (): void => {
      engine.getFrequencyData(freqRaw.current)
      // Ataque rápido / caída lenta: el golpe entra seco (0.55 de lo nuevo)
      // y se desvanece con inercia (0.12) — pegada de tinta, no parpadeo.
      const raw = freqRaw.current
      const sm = freqSmooth.current
      for (let i = 0; i < sm.length; i++) {
        sm[i] =
          raw[i] > sm[i] ? sm[i] * 0.45 + raw[i] * 0.55 : sm[i] * 0.88 + raw[i] * 0.12
      }

      const W = canvas.width
      const H = canvas.height
      ctx.clearRect(0, 0, W, H)

      const accent = readVar('--accent', '#f43f4f')
      const glow = readVar('--amb-glow', accent)
      const dpr = window.devicePixelRatio || 1

      // Zona ocupada por la carátula (las plumas parten de su vecindad)
      const art = artRef.current
      let leftEdge = W / 2
      let rightEdge = W / 2
      let midY = H / 2
      let artH = H / 2
      if (art) {
        const cr = canvas.getBoundingClientRect()
        const ar = art.getBoundingClientRect()
        const scaleX = W / Math.max(1, cr.width)
        const scaleY = H / Math.max(1, cr.height)
        leftEdge = (ar.left - cr.left) * scaleX
        rightEdge = (ar.right - cr.left) * scaleX
        midY = (ar.top - cr.top + ar.height / 2) * scaleY
        artH = ar.height * scaleY
      }
      // Aire entre carátula y primera barra (sistema de 4 px: 32 px)
      const gap = 32 * dpr
      // Y aire con el borde de pantalla: la pluma acaba antes de llegar (48 px)
      const edgePad = 48 * dpr

      // Altura máxima: 42 % del alto de la carátula — la energía queda en la
      // franja central, lejos de las esquinas del arte
      const maxAmp = Math.min(artH * 0.42, 220 * dpr)

      // Lado izquierdo: desde junto a la carátula hacia x=edgePad
      drawSide(leftEdge - gap, edgePad, midY, maxAmp, accent, glow)
      // Lado derecho: desde junto a la carátula hacia x=W-edgePad
      drawSide(rightEdge + gap, W - edgePad, midY, maxAmp, accent, glow)

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
      ro.disconnect()
      dprQuery.removeEventListener('change', onDprChange)
      window.removeEventListener('resize', resize)
    }
  }, [])

  // El bucle sigue corriendo aunque isPlaying=false para que la onda se
  // aplane suavemente (los bins caen por sí solos vía smoothingTimeConstant
  // del AnalyserNode + nuestro suavizado 0.7). `isPlaying` se referencia
  // para que React vuelva a mostrar el estado correcto si cambia.
  void isPlaying

  // F51 · Crossfade visual: pista saliente + duración (= fade de audio)
  const { from, durMs } = useCrossfadeFrom(current)

  // F41 · `52vh` sola solo mira el ALTO del viewport — en una ventana
  // estrecha (mitad de pantalla) la carátula no se encogía y se comía el
  // sitio de las barras laterales. Con `cqw` (Container Query width) el
  // tamaño depende del ancho real de ESTA página (ver `containerType` más
  // abajo), no del viewport completo (que además incluye el sidebar) — así
  // la carátula se encoge de verdad en ventanas estrechas.
  const artSize = 'min(52vh, 42cqw, 480px)'

  return (
    <div
      data-testid="visualizer-root"
      style={{ position: 'relative', height: '100%', overflow: 'hidden', containerType: 'inline-size' }}
    >
      {/* Fondo: carátula gigante difuminada — F51: doble capa durante el
          crossfade, con la MISMA duración que el fade de audio */}
      {current && (
        <CrossfadeBlurBg
          current={current}
          from={from}
          durMs={durMs}
          filter="blur(80px) saturate(1.3) brightness(0.4)"
          scale={1.2}
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
        data-testid="visualizer-content"
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
          // F51 · Doble capa: la carátula saliente se desvanece mientras la
          // nueva aparece, con la duración exacta del crossfade de audio.
          // El ref pasa al wrapper (mismo rect que medía la <img> antes).
          <div
            ref={artRef as React.RefObject<HTMLDivElement>}
            data-testid="visualizer-art"
            style={{ position: 'relative', width: artSize, height: artSize, flexShrink: 0 }}
          >
            {from?.thumbnailUrl && (
              <img
                key={`from-${from.videoId}`}
                aria-hidden="true"
                src={hiRes(from.thumbnailUrl)}
                alt=""
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: 12,
                  boxShadow: '0 30px 90px -20px var(--amb-glow, rgba(0,0,0,0.7))',
                  animation: `np-cover-fade-out ${durMs}ms linear both`,
                  zIndex: 1
                }}
              />
            )}
            {/* F52 · CoverLayer congela la animación en el montaje: al
                terminar el crossfade el estilo no cambia → sin "reaparición" */}
            <CoverLayer
              key={current.videoId}
              src={hiRes(current.thumbnailUrl)}
              enterFadeMs={from ? durMs : null}
              idleAnim="detail-in 0.5s var(--ease-spring) both"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRadius: 12,
                boxShadow: '0 30px 90px -20px var(--amb-glow, rgba(0,0,0,0.7))',
                zIndex: 2
              }}
            />
          </div>
        ) : (
          // Placeholder invisible para que el canvas sepa dónde "estaría" el arte
          <div
            ref={artRef as React.RefObject<HTMLDivElement>}
            data-testid="visualizer-art"
            style={{ width: artSize, height: artSize }}
          />
        )}
        <div
          data-testid="visualizer-title-block"
          style={{
            textAlign: 'center',
            maxWidth: 720,
            position: 'relative',
            ['--xfade-visual-ms' as string]: `${durMs}ms`
          }}
        >
          {/* F51 · Texto con fade secuencial (out → in) durante el crossfade,
              igual que en la barra inferior */}
          {from && (
            <div className="np-text-out" aria-hidden="true">
              <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.15 }}>{from.title}</div>
              <div style={{ fontSize: 16, color: 'var(--text-secondary)', marginTop: 6 }}>
                {from.artists.map((a) => a.name).join(', ')}
              </div>
            </div>
          )}
          <div key={current?.videoId ?? 'none'} className={from ? 'np-text-in' : undefined}>
            <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.15 }}>
              {current?.title ?? t('visualizer.nothing')}
            </div>
            <div style={{ fontSize: 16, color: 'var(--text-secondary)', marginTop: 6 }}>
              {current?.artists.map((a) => a.name).join(', ')}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
