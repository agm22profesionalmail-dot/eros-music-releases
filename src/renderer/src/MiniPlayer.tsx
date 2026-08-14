import { useEffect, useRef, useState } from 'react'
import type { AppSettings, MiniCorner } from '@shared/types'
import {
  CloseIcon,
  MusicNoteIcon,
  PauseIcon,
  PlayIcon,
  SettingsIcon,
  SkipNextIcon,
  SkipPrevIcon
} from './components/Icons'
import { formatTime } from './app/authStore'
import { extractAccent } from './app/artworkColor'

/** Aplica tema + acento fijo al DOM del mini (misma apariencia que la app). */
function applyThemeDom(s: AppSettings): void {
  const root = document.documentElement
  root.dataset.theme = s.theme
  if (s.accentMode === 'fixed') {
    root.style.setProperty('--accent', s.accent)
    root.style.setProperty('--accent-hover', s.accent + 'dd')
  }
}

/**
 * Mini-player flotante.
 * Layout: [carátula] [título · artista / línea de tiempo] [◀ ⏯ ▶]
 * - Ruedita de ajustes en la tarjeta: 4 esquinas o posición libre.
 * - En posición libre aparece un agarre de puntitos arriba-centro para arrastrar.
 */

interface MiniState {
  title: string
  artists: string
  thumbnailUrl?: string
  isPlaying: boolean
  positionSec: number
  durationSec: number
}

const CORNERS: { key: MiniCorner; label: string; glyph: string }[] = [
  { key: 'tl', label: 'Arriba izquierda', glyph: '◤' },
  { key: 'tr', label: 'Arriba derecha', glyph: '◥' },
  { key: 'bl', label: 'Abajo izquierda', glyph: '◣' },
  { key: 'br', label: 'Abajo derecha', glyph: '◢' },
  { key: 'free', label: 'Posición libre', glyph: '✥' }
]

export default function MiniPlayer(): React.JSX.Element {
  const [state, setState] = useState<MiniState | null>(null)
  const [corner, setCorner] = useState<MiniCorner>('br')
  const [gearOpen, setGearOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const [accentMode, setAccentMode] = useState<AppSettings['accentMode']>('fixed')
  const [tint, setTint] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void window.api.settings.get().then((s) => {
      setCorner(s.miniCorner)
      setAccentMode(s.accentMode)
      applyThemeDom(s)
    })
    const offState = window.api.mini.onState((s) => setState(s as MiniState))
    // Cambios de tema/acento en la app principal -> se reflejan aquí en vivo
    const offSettings = window.api.settings.onChanged((s) => {
      setCorner(s.miniCorner)
      setAccentMode(s.accentMode)
      applyThemeDom(s)
    })
    return () => {
      offState()
      offSettings()
    }
  }, [])

  // Acento dinámico + tinte de fondo a partir de la carátula (como la app)
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

  const pct =
    state && state.durationSec > 0
      ? Math.min(100, (state.positionSec / state.durationSec) * 100)
      : 0

  const seekTo = (e: React.PointerEvent): void => {
    if (!state || state.durationSec <= 0) return
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect) return
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    void window.api.mini.command(`seek:${(ratio * state.durationSec).toFixed(1)}`)
  }

  const pickCorner = (c: MiniCorner): void => {
    setCorner(c)
    setGearOpen(false)
    void window.api.mini.setCorner(c)
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false)
        setGearOpen(false)
      }}
      style={{
        height: '100vh',
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
              style={{
                width: 3,
                height: 3,
                borderRadius: '50%',
                background: 'var(--text-secondary)'
              }}
            />
          ))}
        </div>
      )}

      {/* Ruedita + cerrar (aparecen al pasar el ratón) */}
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
          title="Posición del mini-player"
          style={{ width: 20, height: 20 }}
          onClick={() => setGearOpen((v) => !v)}
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

      {/* Popover de posición */}
      {gearOpen && (
        <div
          className="context-menu"
          style={{ position: 'absolute', top: 26, right: 6, minWidth: 170, zIndex: 10 }}
        >
          {CORNERS.map((c) => (
            <button key={c.key} onClick={() => pickCorner(c.key)}>
              <span style={{ width: 18, textAlign: 'center' }}>{c.glyph}</span>
              {c.label}
              {corner === c.key && (
                <span style={{ marginLeft: 'auto', color: 'var(--accent)' }}>●</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Carátula */}
      {state?.thumbnailUrl ? (
        <img
          src={state.thumbnailUrl}
          alt=""
          style={{ width: 84, height: 84, objectFit: 'cover' }}
        />
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

      {/* Centro: título · artista (línea de arriba) + línea de tiempo (abajo) */}
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
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--text-subdued)', fontVariantNumeric: 'tabular-nums' }}>
            {formatTime(state?.positionSec ?? 0)}
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
                  background: 'var(--accent)'
                }}
              />
            </div>
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-subdued)', fontVariantNumeric: 'tabular-nums' }}>
            {formatTime(state?.durationSec ?? 0)}
          </span>
        </div>
      </div>

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
