import { useEffect, useRef, useState } from 'react'
import type { LyricsData } from '@shared/types'
import { usePlayer } from '../player/store'
import { engine } from '../player/engine'
import { computeLineFill } from '../app/karaoke'

/**
 * Vista de letras a pantalla completa: línea activa resaltada con
 * desplazamiento suave y ajuste manual de desfase.
 */

export function LyricsPage(): React.JSX.Element {
  const current = usePlayer((s) => s.current())
  const currentTime = usePlayer((s) => s.currentTime)
  const seek = usePlayer((s) => s.seek)
  const [lyrics, setLyrics] = useState<LyricsData | null | 'loading'>('loading')
  const [offsetMs, setOffsetMs] = useState(0)
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!current) {
      setLyrics(null)
      return
    }
    let cancelled = false
    setLyrics('loading')
    setOffsetMs(0)
    void window.api.music
      .lyrics({
        videoId: current.videoId,
        title: current.title,
        artists: current.artists.map((a) => a.name),
        album: current.album?.name,
        durationSec: current.durationSec
      })
      .then((data) => {
        if (!cancelled) setLyrics(data)
      })
      .catch(() => {
        if (!cancelled) setLyrics(null)
      })
    return () => {
      cancelled = true
    }
  }, [current?.videoId])

  const timeMs = currentTime * 1000 + offsetMs
  const synced = lyrics !== 'loading' && lyrics?.synced?.length ? lyrics.synced : null
  let activeIndex = -1
  if (synced) {
    for (let i = 0; i < synced.length; i++) {
      if (synced[i].timeMs <= timeMs) activeIndex = i
      else break
    }
  }

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeIndex])

  // Animación fluida de karaoke: rellena la línea activa siguiendo el reloj
  // real del audio (rAF), sin pasar por re-renders de React.
  const offsetRef = useRef(offsetMs)
  offsetRef.current = offsetMs
  const syncedRef = useRef(synced)
  syncedRef.current = synced
  const activeIndexRef = useRef(activeIndex)
  activeIndexRef.current = activeIndex

  useEffect(() => {
    let raf = 0
    const tick = (): void => {
      const el = activeRef.current
      const lines = syncedRef.current
      const idx = activeIndexRef.current
      if (el && lines && idx >= 0) {
        const line = lines[idx]
        const nextStart = lines[idx + 1]?.timeMs ?? line.timeMs + 6000
        const nowMs = engine.currentTime * 1000 + offsetRef.current
        const pct = computeLineFill(line, nextStart, nowMs)
        el.style.setProperty('--fill', `${pct.toFixed(1)}%`)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  if (!current) {
    return <div className="empty-state">Reproduce algo para ver su letra</div>
  }

  return (
    <div style={{ position: 'relative', minHeight: '100%' }}>
      {/* Carátula gigante difuminada como fondo (Apple Music "concert mode") */}
      {current.thumbnailUrl && (
        <div
          key={current.videoId}
          className="lyrics-bg"
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${current.thumbnailUrl.replace(/=w\d+-h\d+/, '=w1080-h1080')})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(72px) saturate(1.35) brightness(0.55)',
            transform: 'scale(1.25)',
            opacity: 0,
            animation: 'lyrics-bg-in 1.2s var(--ease-out) forwards',
            zIndex: 0
          }}
        />
      )}
      <div
        className="page"
        style={{
          maxWidth: 820,
          margin: '0 auto',
          position: 'relative',
          zIndex: 1,
          overflowX: 'hidden'
        }}
      >
      <h1 style={{ fontSize: 20, display: 'flex', flexWrap: 'wrap', gap: '0 8px' }}>
        <span>{current.title}</span>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>
          · {current.artists.map((a) => a.name).join(', ')}
        </span>
      </h1>

      {lyrics === 'loading' && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 60 }}>
          <div className="spinner" />
        </div>
      )}

      {lyrics !== 'loading' && !lyrics && (
        <div className="empty-state">No se encontró letra para esta canción</div>
      )}

      {synced && (
        <>
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              color: 'var(--text-subdued)',
              fontSize: 12,
              padding: '4px 0 16px'
            }}
          >
            <span>Fuente: {lyrics !== 'loading' && lyrics ? lyrics.source : ''}</span>
            <span style={{ marginLeft: 'auto' }}>Desfase: {(offsetMs / 1000).toFixed(1)} s</span>
            <button className="chip" onClick={() => setOffsetMs((v) => v - 500)}>
              −0,5 s
            </button>
            <button className="chip" onClick={() => setOffsetMs((v) => v + 500)}>
              +0,5 s
            </button>
            {offsetMs !== 0 && (
              <button className="chip" onClick={() => setOffsetMs(0)}>
                Reset
              </button>
            )}
          </div>
          <div style={{ padding: '2vh 0 40vh' }}>
            {synced.map((line, i) => (
              <button
                key={i}
                ref={i === activeIndex ? activeRef : undefined}
                className={i === activeIndex ? 'karaoke-fill' : undefined}
                onClick={() => seek(Math.max(0, (line.timeMs - offsetMs) / 1000))}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 0',
                  fontSize: 30,
                  fontWeight: 800,
                  lineHeight: 1.25,
                  letterSpacing: '-0.01em',
                  // Cantadas: iluminadas; futuras: apagadas; la activa la pinta .karaoke-fill
                  color: i === activeIndex ? undefined : i < activeIndex ? 'var(--text-primary)' : 'var(--text-subdued)',
                  transition: 'color 0.3s',
                  cursor: 'pointer',
                  ...(i === activeIndex ? { transition: 'none' } : {})
                }}
              >
                {line.text || '♪'}
              </button>
            ))}
          </div>
        </>
      )}

      {lyrics !== 'loading' && lyrics && !synced && lyrics.plain && (
        <div
          style={{
            whiteSpace: 'pre-wrap',
            fontSize: 18,
            lineHeight: 1.7,
            color: 'var(--text-secondary)',
            padding: '12px 0 40px',
            userSelect: 'text'
          }}
        >
          {lyrics.plain}
          <p style={{ fontSize: 12, color: 'var(--text-subdued)', paddingTop: 24 }}>
            Fuente: {lyrics.source} (sin sincronizar)
          </p>
        </div>
      )}
      </div>
    </div>
  )
}
