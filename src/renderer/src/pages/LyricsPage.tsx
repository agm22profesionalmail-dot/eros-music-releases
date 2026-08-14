import { useEffect, useRef, useState } from 'react'
import type { LyricsData } from '@shared/types'
import { usePlayer } from '../player/store'

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

  if (!current) {
    return <div className="empty-state">Reproduce algo para ver su letra</div>
  }

  return (
    <div className="page" style={{ maxWidth: 820, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20 }}>
        {current.title}
        <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>
          {' '}
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
          <div style={{ padding: '20vh 0 30vh' }}>
            {synced.map((line, i) => (
              <button
                key={i}
                ref={i === activeIndex ? activeRef : undefined}
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
                  color: i === activeIndex ? 'var(--text-primary)' : 'var(--text-subdued)',
                  transition: 'color 0.3s',
                  cursor: 'pointer'
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
  )
}
