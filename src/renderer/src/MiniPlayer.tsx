import { useEffect, useRef, useState } from 'react'
import type { AppSettings, LyricsData, MiniCorner } from '@shared/types'
import {
  CloseIcon,
  MicIcon,
  MusicNoteIcon,
  PauseIcon,
  PlayIcon,
  SettingsIcon,
  SkipNextIcon,
  SkipPrevIcon
} from './components/Icons'
import { formatTime } from './app/authStore'
import { extractAccent } from './app/artworkColor'
import { applyThemeDom } from './app/themeDom'
import { computeLineFill } from './app/karaoke'

/**
 * Mini-player flotante.
 * Normal:  [carátula] [título · artista / línea de tiempo] [◀ ⏯ ▶]
 * Karaoke: [carátula] [ letra sincronizada en vivo        ] [◀ ⏯ ▶]
 * La ruedita abre una ventana de ajustes independiente (esquinas, tamaño, karaoke).
 */

interface MiniState {
  videoId: string
  title: string
  artists: string
  album?: string
  thumbnailUrl?: string
  isPlaying: boolean
  positionSec: number
  durationSec: number
}

export default function MiniPlayer(): React.JSX.Element {
  const [state, setState] = useState<MiniState | null>(null)
  const [corner, setCorner] = useState<MiniCorner>('br')
  const [karaoke, setKaraoke] = useState(false)
  const [scale, setScale] = useState(1)
  const [hover, setHover] = useState(false)
  const [accentMode, setAccentMode] = useState<AppSettings['accentMode']>('fixed')
  const [tint, setTint] = useState<string | null>(null)
  const [lyrics, setLyrics] = useState<LyricsData | null>(null)
  const [smoothPos, setSmoothPos] = useState(0)
  const barRef = useRef<HTMLDivElement>(null)
  const lastSync = useRef<{ pos: number; at: number; playing: boolean }>({
    pos: 0,
    at: Date.now(),
    playing: false
  })

  const applySettings = (s: AppSettings): void => {
    setCorner(s.miniCorner)
    setKaraoke(s.miniKaraoke)
    setScale(s.miniScale || 1)
    setAccentMode(s.accentMode)
    applyThemeDom(s)
  }

  useEffect(() => {
    void window.api.settings.get().then(applySettings)
    const offState = window.api.mini.onState((raw) => {
      const s = raw as MiniState
      setState(s)
      lastSync.current = { pos: s.positionSec, at: Date.now(), playing: s.isPlaying }
    })
    const offSettings = window.api.settings.onChanged(applySettings)
    return () => {
      offState()
      offSettings()
    }
  }, [])

  // Posición interpolada (el estado llega a 1 Hz; el karaoke necesita fluidez)
  useEffect(() => {
    const t = window.setInterval(() => {
      const { pos, at, playing } = lastSync.current
      setSmoothPos(playing ? pos + (Date.now() - at) / 1000 : pos)
    }, 100)
    return () => window.clearInterval(t)
  }, [])

  // Acento dinámico + tinte de fondo desde la carátula
  useEffect(() => {
    const url = state?.thumbnailUrl
    if (!url) {
      setTint(null)
      return
    }
    let cancelled = false
    void extractAccent(url).then((c) => {
      if (cancelled || !c) return
      setTint(c)
      if (accentMode === 'dynamic') {
        document.documentElement.style.setProperty('--accent', c)
        document.documentElement.style.setProperty('--accent-hover', c + 'dd')
      }
    })
    return () => {
      cancelled = true
    }
  }, [state?.thumbnailUrl, accentMode])

  // Letra para el modo karaoke (cacheada en el main por canción)
  useEffect(() => {
    if (!karaoke || !state?.videoId) {
      setLyrics(null)
      return
    }
    let cancelled = false
    void window.api.music
      .lyrics({
        videoId: state.videoId,
        title: state.title,
        artists: state.artists.split(', '),
        album: state.album,
        durationSec: state.durationSec
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
  }, [karaoke, state?.videoId])

  const pct =
    state && state.durationSec > 0
      ? Math.min(100, (smoothPos / state.durationSec) * 100)
      : 0

  const seekTo = (e: React.PointerEvent): void => {
    if (!state || state.durationSec <= 0) return
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect) return
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    void window.api.mini.command(`seek:${(ratio * state.durationSec).toFixed(1)}`)
  }

  // Línea activa del karaoke + progreso de relleno (iluminación fluida)
  const synced = lyrics?.synced
  let activeLine = ''
  let nextLine = ''
  let linePct = 0
  if (synced?.length) {
    const timeMs = smoothPos * 1000
    let idx = -1
    for (let i = 0; i < synced.length; i++) {
      if (synced[i].timeMs <= timeMs) idx = i
      else break
    }
    activeLine = idx >= 0 ? synced[idx].text || '♪' : '♪'
    nextLine = synced[idx + 1]?.text ?? ''
    if (idx >= 0) {
      const end = synced[idx + 1]?.timeMs ?? synced[idx].timeMs + 6000
      linePct = computeLineFill(synced[idx], end, timeMs)
    }
  }

  const karaokeActive = karaoke && Boolean(synced?.length)

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 400,
        height: 84,
        zoom: scale,
        display: 'grid',
        gridTemplateColumns: '84px 1fr auto',
        alignItems: 'center',
        gap: 12,
        padding: '0 10px 0 0',
        background: tint
          ? `linear-gradient(90deg, ${tint}40, var(--bg-base) 55%)`
          : 'var(--bg-base)',
        overflow: 'hidden',
        position: 'relative',
        transition: 'background 0.4s'
      }}
    >
      {/* Agarre de puntitos (solo en posición libre) */}
      {corner === 'free' && (
        <div
          title="Arrastra para mover"
          style={{
            position: 'absolute',
            top: 2,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '2px 14px',
            borderRadius: 4,
            display: 'flex',
            gap: 3,
            zIndex: 5,
            cursor: 'grab',
            opacity: hover ? 1 : 0.35,
            transition: 'opacity 0.15s',
            ['WebkitAppRegion' as string]: 'drag'
          }}
        >
          {[...Array(6)].map((_, i) => (
            <span
              key={i}
              style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--text-secondary)' }}
            />
          ))}
        </div>
      )}

      {/* Micro (karaoke) + ruedita + cerrar (al pasar el ratón) */}
      <div
        style={{
          position: 'absolute',
          top: 4,
          right: 6,
          display: 'flex',
          gap: 4,
          zIndex: 6,
          opacity: hover ? 1 : 0,
          transition: 'opacity 0.15s'
        }}
      >
        <button
          className="icon-btn"
          title={karaoke ? 'Salir del karaoke' : 'Modo karaoke'}
          style={{ width: 20, height: 20, color: karaoke ? 'var(--accent)' : undefined }}
          onClick={() => void window.api.settings.set({ miniKaraoke: !karaoke })}
        >
          <MicIcon size={12} />
        </button>
        <button
          className="icon-btn"
          title="Ajustes del mini-player"
          style={{ width: 20, height: 20 }}
          onClick={() => void window.api.mini.openSettings()}
        >
          <SettingsIcon size={13} />
        </button>
        <button
          className="icon-btn"
          title="Cerrar mini-player"
          style={{ width: 20, height: 20 }}
          onClick={() => void window.api.mini.toggle()}
        >
          <CloseIcon size={12} />
        </button>
      </div>

      {/* Carátula */}
      {state?.thumbnailUrl ? (
        <img src={state.thumbnailUrl} alt="" style={{ width: 84, height: 84, objectFit: 'cover' }} />
      ) : (
        <div
          style={{
            width: 84,
            height: 84,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--bg-elevated)',
            color: 'var(--text-subdued)'
          }}
        >
          <MusicNoteIcon size={32} />
        </div>
      )}

      {/* Centro */}
      {karaokeActive ? (
        <div
          style={{
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 3,
            cursor: 'pointer'
          }}
          title="Abrir Metrolist"
          onClick={() => void window.api.mini.showMain()}
        >
          <div
            className="karaoke-fill"
            style={{
              fontSize: 15,
              fontWeight: 800,
              lineHeight: 1.25,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              ['--fill' as string]: `${linePct.toFixed(1)}%`,
              transition: 'background-size 0.12s linear'
            }}
          >
            {activeLine}
          </div>
          {nextLine && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-subdued)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {nextLine}
            </div>
          )}
        </div>
      ) : (
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div
            style={{
              fontSize: 13,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              cursor: 'pointer'
            }}
            title="Abrir Metrolist"
            onClick={() => void window.api.mini.showMain()}
          >
            <b>{state?.title ?? 'Metrolist'}</b>
            <span style={{ color: 'var(--text-secondary)' }}>
              {state?.artists ? ` · ${state.artists}` : ''}
            </span>
            {karaoke && !synced?.length && (
              <span style={{ color: 'var(--text-subdued)', fontSize: 11 }}> · sin letra ♪</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{ fontSize: 10, color: 'var(--text-subdued)', fontVariantNumeric: 'tabular-nums' }}
            >
              {formatTime(smoothPos)}
            </span>
            <div
              ref={barRef}
              onPointerDown={seekTo}
              style={{ flex: 1, height: 12, display: 'flex', alignItems: 'center', cursor: 'pointer' }}
            >
              <div
                style={{
                  width: '100%',
                  height: 4,
                  borderRadius: 2,
                  background: 'var(--bg-tinted)',
                  position: 'relative'
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    borderRadius: 2,
                    background: 'linear-gradient(90deg, var(--accent-press), var(--accent))',
                    boxShadow: '0 0 8px -1px var(--amb-glow, transparent)'
                  }}
                />
              </div>
            </div>
            <span
              style={{ fontSize: 10, color: 'var(--text-subdued)', fontVariantNumeric: 'tabular-nums' }}
            >
              {formatTime(state?.durationSec ?? 0)}
            </span>
          </div>
        </div>
      )}

      {/* Derecha: los 3 botones */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 2 }}>
        <button className="np-ctrl" onClick={() => void window.api.mini.command('previous')}>
          <SkipPrevIcon size={16} />
        </button>
        <button
          className="np-play"
          style={{ width: 32, height: 32 }}
          onClick={() => void window.api.mini.command('playpause')}
        >
          {state?.isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
        </button>
        <button className="np-ctrl" onClick={() => void window.api.mini.command('next')}>
          <SkipNextIcon size={16} />
        </button>
      </div>
    </div>
  )
}
