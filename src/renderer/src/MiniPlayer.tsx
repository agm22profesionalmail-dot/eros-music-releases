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
  SkipPrevIcon,
  VolumeIcon
} from './components/Icons'
import { formatTime } from './app/authStore'
import { extractAccent } from './app/artworkColor'
import { applyThemeDom } from './app/themeDom'
import { computeLineFill } from './app/karaoke'
import { resolveLocale, useI18n, useT } from './app/i18n'

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
  /** F56 · Volumen actual del reproductor (0-1) */
  volume?: number
  /** F56 · Crossfade en curso: el mini funde carátula/texto en sincronía */
  crossfading?: {
    fromTitle: string
    fromArtists: string
    fromThumbnailUrl?: string
    durationMs: number
    token: number
  } | null
}

/**
 * F56/F52 · Congela el valor del primer render: la animación de una capa se
 * decide al MONTAR y los cambios de props posteriores no la reinician (si
 * cambiara, el navegador re-animaría desde opacity 0 → "reaparición").
 * Copia local del helper de CrossfadeVisual — importar aquel módulo desde
 * esta ventana instanciaría el engine de audio del reproductor principal.
 */
function useMountConst<T>(v: T): T {
  return useState(v)[0]
}

/** Carátula del mini con animación congelada al montar. */
function MiniCover({
  src,
  enterMs
}: {
  src: string
  enterMs: number | null
}): React.JSX.Element {
  const animation = useMountConst(
    enterMs != null ? `np-cover-fade-in ${enterMs}ms linear both` : 'none'
  )
  return (
    <img
      src={src}
      alt=""
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        animation,
        zIndex: 2
      }}
    />
  )
}

export default function MiniPlayer(): React.JSX.Element {
  const t = useT()
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
    // F58 · Esta ventana no pasa por settingsStore: aplica el idioma aquí.
    useI18n.getState().setLocale(resolveLocale(s.uiLanguage))
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

  // F56 · Crossfade en curso (llega del reproductor principal por IPC)
  const cx = state?.crossfading ?? null

  // F56 · Control de volumen: icono (clic = mute/restaurar) + slider
  // desplegable hacia la izquierda que persiste 800 ms tras salir (mismo
  // patrón que el popover de la barra cuando no cabe el slider inline).
  const [volOpen, setVolOpen] = useState(false)
  const [dragVol, setDragVol] = useState<number | null>(null)
  const volCloseTimer = useRef(0)
  const lastNonZeroVol = useRef(0.8)
  const vol = dragVol ?? state?.volume ?? 0.8
  useEffect(() => {
    if ((state?.volume ?? 0) > 0.001) lastNonZeroVol.current = state!.volume!
  }, [state?.volume])
  const openVol = (): void => {
    window.clearTimeout(volCloseTimer.current)
    setVolOpen(true)
  }
  const scheduleCloseVol = (): void => {
    window.clearTimeout(volCloseTimer.current)
    volCloseTimer.current = window.setTimeout(() => setVolOpen(false), 800)
  }
  const sendVolume = (v: number): void => {
    void window.api.mini.command(`volume:${Math.max(0, Math.min(1, v)).toFixed(2)}`)
  }
  const toggleMute = (): void => {
    if (vol > 0.001) sendVolume(0)
    else sendVolume(lastNonZeroVol.current || 0.8)
  }

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
        background: 'var(--bg-base)',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {/* F56 · Tinte de la carátula con fundido REAL: el gradiente usa
          `currentcolor`, y `color` sí interpola con transition (un gradiente
          en `background` cambia de golpe). Duración = crossfade si hay. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          color: tint ? `${tint}40` : 'transparent',
          background: 'linear-gradient(90deg, currentcolor, transparent 55%)',
          transition: `color ${cx ? cx.durationMs : 400}ms linear`
        }}
      />
      {/* Agarre de puntitos (solo en posición libre) */}
      {corner === 'free' && (
        <div
          title={t('mini.dragToMove')}
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
          title={karaoke ? t('mini.exitKaraoke') : t('mini.karaokeMode')}
          style={{ width: 20, height: 20, color: karaoke ? 'var(--accent)' : undefined }}
          onClick={() => void window.api.settings.set({ miniKaraoke: !karaoke })}
        >
          <MicIcon size={12} />
        </button>
        <button
          className="icon-btn"
          title={t('mini.settings')}
          style={{ width: 20, height: 20 }}
          onClick={() => void window.api.mini.openSettings()}
        >
          <SettingsIcon size={13} />
        </button>
        <button
          className="icon-btn"
          title={t('mini.close')}
          style={{ width: 20, height: 20 }}
          onClick={() => void window.api.mini.toggle()}
        >
          <CloseIcon size={12} />
        </button>
      </div>

      {/* Carátula — F56: doble capa durante el crossfade, en sincronía con
          el fade de audio del reproductor principal */}
      {state?.thumbnailUrl ? (
        <div style={{ position: 'relative', width: 84, height: 84 }}>
          {cx?.fromThumbnailUrl && (
            <img
              key={`from-${cx.token}`}
              src={cx.fromThumbnailUrl}
              alt=""
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                animation: `np-cover-fade-out ${cx.durationMs}ms linear both`,
                zIndex: 1
              }}
            />
          )}
          <MiniCover
            key={state.videoId}
            src={state.thumbnailUrl}
            enterMs={cx ? cx.durationMs : null}
          />
        </div>
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
            cursor: 'pointer',
            position: 'relative',
            zIndex: 1
          }}
          title={t('mini.openApp')}
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
        <div
          style={{
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
            position: 'relative',
            zIndex: 1
          }}
        >
          {/* F56 · Título con fade secuencial (out → in) durante el crossfade */}
          <div
            style={{
              position: 'relative',
              minWidth: 0,
              cursor: 'pointer',
              ['--xfade-visual-ms' as string]: cx ? `${cx.durationMs}ms` : undefined
            }}
            title={t('mini.openApp')}
            onClick={() => void window.api.mini.showMain()}
          >
            {cx && (
              <div
                className="np-text-out"
                aria-hidden="true"
                style={{
                  fontSize: 13,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                <b>{cx.fromTitle}</b>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {cx.fromArtists ? ` · ${cx.fromArtists}` : ''}
                </span>
              </div>
            )}
            <div
              key={state?.videoId ?? 'none'}
              className={cx ? 'np-text-in' : undefined}
              style={{
                fontSize: 13,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              <b>{state?.title ?? "ERO'S Music"}</b>
              <span style={{ color: 'var(--text-secondary)' }}>
                {state?.artists ? ` · ${state.artists}` : ''}
              </span>
              {karaoke && !synced?.length && (
                <span style={{ color: 'var(--text-subdued)', fontSize: 11 }}>{` · ${t('mini.noLyrics')} ♪`}</span>
              )}
            </div>
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

      {/* Derecha: volumen + los 3 botones */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          paddingRight: 2,
          position: 'relative',
          zIndex: 1
        }}
      >
        {/* F56 · Volumen: clic = mute/restaurar; hover = slider desplegable
            a la izquierda; rueda del ratón = ajuste fino */}
        <div
          style={{ position: 'relative', display: 'grid', placeItems: 'center' }}
          onMouseEnter={openVol}
          onMouseLeave={scheduleCloseVol}
        >
          <button
            className="np-ctrl"
            data-testid="mini-volume"
            title={vol > 0.001 ? t('np.mute') : t('mini.unmute')}
            onClick={toggleMute}
            onWheel={(e) => sendVolume(vol + (e.deltaY < 0 ? 0.05 : -0.05))}
            style={{ color: vol > 0.001 ? undefined : 'var(--accent)' }}
          >
            <VolumeIcon size={15} muted={vol < 0.001} />
          </button>
          {volOpen && (
            <div
              data-testid="mini-volume-popover"
              style={{
                position: 'absolute',
                right: '100%',
                top: '50%',
                transform: 'translateY(-50%)',
                marginRight: 8,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--divider)',
                borderRadius: 8,
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                boxShadow: 'var(--shadow-card)',
                zIndex: 7
              }}
            >
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(vol * 100)}
                aria-label={t('mini.volume')}
                onChange={(e) => {
                  const nv = Number(e.target.value) / 100
                  setDragVol(nv)
                  sendVolume(nv)
                }}
                onPointerUp={() => {
                  window.setTimeout(() => setDragVol(null), 300)
                }}
                style={{ width: 90 }}
              />
            </div>
          )}
        </div>
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
