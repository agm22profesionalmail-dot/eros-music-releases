import { useCallback, useRef, useState } from 'react'
import { usePlayer } from '../player/store'
import { formatTime } from '../app/authStore'
import { useRouter } from '../app/router'
import { useLibrary } from '../app/libraryStore'
import { useSleepTimer } from '../app/sleepTimer'
import {
  HeartIcon,
  MicIcon,
  MusicNoteIcon,
  PauseIcon,
  PlayIcon,
  QueueIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  SkipNextIcon,
  SkipPrevIcon,
  VolumeIcon
} from '../components/Icons'

function Slider({
  value,
  max,
  onChange
}: {
  value: number
  max: number
  onChange: (v: number) => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0

  const handle = useCallback(
    (e: React.PointerEvent) => {
      const rect = ref.current?.getBoundingClientRect()
      if (!rect) return
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      onChange(ratio * max)
    },
    [max, onChange]
  )

  return (
    <div
      ref={ref}
      className="slider"
      style={{ ['--pct' as string]: `${pct}%` }}
      onPointerDown={(e) => {
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        handle(e)
      }}
      onPointerMove={(e) => {
        if (e.buttons & 1) handle(e)
      }}
    >
      <div className="rail">
        <div className="fill" />
        <div className="knob" />
      </div>
    </div>
  )
}

export function NowPlayingBar({
  queueOpen,
  onToggleQueue
}: {
  queueOpen: boolean
  onToggleQueue: () => void
}): React.JSX.Element {
  const current = usePlayer((s) => s.current())
  const isPlaying = usePlayer((s) => s.isPlaying)
  const isBuffering = usePlayer((s) => s.isBuffering)
  const currentTime = usePlayer((s) => s.currentTime)
  const duration = usePlayer((s) => s.duration)
  const volume = usePlayer((s) => s.volume)
  const repeat = usePlayer((s) => s.repeat)
  const shuffle = usePlayer((s) => s.shuffle)
  const togglePlay = usePlayer((s) => s.togglePlay)
  const next = usePlayer((s) => s.next)
  const previous = usePlayer((s) => s.previous)
  const seek = usePlayer((s) => s.seek)
  const setVolume = usePlayer((s) => s.setVolume)
  const toggleShuffle = usePlayer((s) => s.toggleShuffle)
  const cycleRepeat = usePlayer((s) => s.cycleRepeat)
  const navigate = useRouter((s) => s.navigate)
  const route = useRouter((s) => s.route())
  const likedIds = useLibrary((s) => s.likedIds)
  const toggleLike = useLibrary((s) => s.toggleLike)
  // F27 · Sleep timer: badge y modal
  const sleepActive = useSleepTimer((s) => s.active)
  const sleepMinutesLeft = useSleepTimer((s) => s.minutesLeft)
  const [sleepOpen, setSleepOpen] = useState(false)

  const effDuration = duration || current?.durationSec || 0
  const isLiked = current ? likedIds.has(current.videoId) : false

  return (
    <footer className="nowplaying">
      <div className="np-left">
        {current ? (
          <>
            {current.thumbnailUrl ? (
              <img
                key={current.videoId}
                src={current.thumbnailUrl}
                alt=""
                className="np-cover"
              />
            ) : (
              <span className="ph">
                <MusicNoteIcon size={24} />
              </span>
            )}
            <div className="meta">
              <div
                className="title"
                onClick={() => {
                  if (current.album?.id) navigate({ name: 'album', id: current.album.id })
                }}
              >
                {current.title}
              </div>
              <div className="artist">{current.artists.map((a) => a.name).join(', ')}</div>
            </div>
            <button
              className={`icon-btn ${isLiked ? 'accent' : ''}`}
              aria-label="Me gusta"
              onClick={() => void toggleLike(current)}
            >
              <span key={isLiked ? 'on' : 'off'} className={isLiked ? 'heart-liked' : undefined} style={{ display: 'grid' }}>
                <HeartIcon size={16} filled={isLiked} />
              </span>
            </button>
          </>
        ) : (
          <span style={{ color: 'var(--text-subdued)', fontSize: 13 }}>Nada en reproducción</span>
        )}
      </div>

      <div className="np-center">
        <div className="np-controls">
          <button
            className={`np-ctrl ${shuffle ? 'active' : ''}`}
            aria-label="Aleatorio"
            onClick={toggleShuffle}
          >
            <ShuffleIcon size={16} />
          </button>
          <button className="np-ctrl" aria-label="Anterior" onClick={() => void previous()}>
            <SkipPrevIcon size={17} />
          </button>
          <button className="np-play" aria-label="Reproducir/Pausar" onClick={togglePlay}>
            {isBuffering ? (
              <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            ) : isPlaying ? (
              <PauseIcon size={16} />
            ) : (
              <PlayIcon size={16} />
            )}
          </button>
          <button className="np-ctrl" aria-label="Siguiente" onClick={() => void next()}>
            <SkipNextIcon size={17} />
          </button>
          <button
            className={`np-ctrl ${repeat !== 'off' ? 'active' : ''}`}
            aria-label="Repetir"
            onClick={cycleRepeat}
          >
            {repeat === 'one' ? <RepeatOneIcon size={16} /> : <RepeatIcon size={16} />}
          </button>
        </div>
        <div className="np-progress">
          <span>{formatTime(currentTime)}</span>
          <Slider value={currentTime} max={effDuration} onChange={seek} />
          <span>{formatTime(effDuration)}</span>
        </div>
      </div>

      <div className="np-right">
        <button
          className={`np-ctrl ${route.name === 'lyrics' ? 'active' : ''}`}
          aria-label="Letra"
          onClick={() => navigate({ name: 'lyrics' })}
          disabled={!current}
        >
          <MicIcon size={16} />
        </button>
        <button
          className={`np-ctrl ${route.name === 'visualizer' ? 'active' : ''}`}
          aria-label="Visualizador"
          title="Visualizador"
          onClick={() =>
            navigate(route.name === 'visualizer' ? { name: 'home' } : { name: 'visualizer' })
          }
          disabled={!current}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <rect x="1" y="6" width="2.4" height="4" rx="1.2" />
            <rect x="5" y="2" width="2.4" height="12" rx="1.2" />
            <rect x="9" y="4" width="2.4" height="8" rx="1.2" />
            <rect x="13" y="7" width="2.4" height="2" rx="1" />
          </svg>
        </button>
        <button
          className={`np-ctrl ${sleepActive ? 'active' : ''}`}
          aria-label="Temporizador de apagado"
          title={
            sleepActive
              ? `Apagará en ${sleepMinutesLeft} min`
              : 'Temporizador de apagado'
          }
          onClick={() => setSleepOpen(true)}
          data-testid="sleep-timer-btn"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 1a7 7 0 1 0 7 7 7 7 0 0 0-7-7zm0 12.5A5.5 5.5 0 1 1 13.5 8 5.5 5.5 0 0 1 8 13.5zm.75-9h-1.5v4.09l3.24 1.87.75-1.3-2.49-1.43z" />
          </svg>
          {sleepActive && (
            <span className="sleep-badge" aria-hidden="true">
              {sleepMinutesLeft}
            </span>
          )}
        </button>
        <button
          className={`np-ctrl ${queueOpen ? 'active' : ''}`}
          aria-label="Cola"
          onClick={onToggleQueue}
        >
          <QueueIcon size={16} />
        </button>
        <button
          className="np-ctrl"
          aria-label="Mini-player"
          title="Mini-player flotante"
          onClick={() => void window.api.mini.toggle()}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 3.75A1.75 1.75 0 0 1 2.75 2h10.5A1.75 1.75 0 0 1 15 3.75v8.5A1.75 1.75 0 0 1 13.25 14H2.75A1.75 1.75 0 0 1 1 12.25v-8.5zm1.75-.25a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25H2.75z" />
            <rect x="8" y="8" width="5" height="4" rx="0.75" />
          </svg>
        </button>
        <button
          className="np-ctrl"
          aria-label="Silenciar"
          onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
        >
          <VolumeIcon size={16} muted={volume === 0} />
        </button>
        <div className="volume">
          <Slider value={volume} max={1} onChange={setVolume} />
        </div>
      </div>
      {sleepOpen && <SleepTimerModal onClose={() => setSleepOpen(false)} />}
    </footer>
  )
}

/**
 * F27 · Modal accesible del temporizador de apagado. Input de minutos +
 * toggles de "detener al finalizar canción actual" y "desvanecer último minuto".
 * Se cierra con Escape o clic fuera. No roba el foco de la app cuando está
 * cerrado (solo cuando el usuario lo abre).
 */
function SleepTimerModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const active = useSleepTimer((s) => s.active)
  const minutesLeft = useSleepTimer((s) => s.minutesLeft)
  const endWithSong = useSleepTimer((s) => s.endWithSong)
  const fadeOutLastMinute = useSleepTimer((s) => s.fadeOutLastMinute)
  const start = useSleepTimer((s) => s.start)
  const stop = useSleepTimer((s) => s.stop)
  const [minutes, setMinutes] = useState<number>(15)
  const [ends, setEnds] = useState<boolean>(endWithSong)
  const [fade, setFade] = useState<boolean>(fadeOutLastMinute)

  return (
    <div
      className="sleep-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Temporizador de apagado"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 2000
      }}
    >
      <div
        className="sleep-modal login-card"
        style={{
          width: 380,
          padding: 24,
          gap: 8,
          textAlign: 'left',
          maxWidth: 380
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>Temporizador de apagado</h3>
        {active ? (
          <p style={{ color: 'var(--text-secondary)' }}>
            Activo — quedan {minutesLeft} min.
          </p>
        ) : (
          <p style={{ color: 'var(--text-secondary)' }}>
            La reproducción se pausará al terminar el tiempo indicado.
          </p>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0' }}>
          <span style={{ flex: 1 }}>Minutos</span>
          <input
            type="number"
            min={1}
            max={600}
            step={1}
            value={minutes}
            onChange={(e) => setMinutes(Math.max(1, Math.min(600, Number(e.target.value) || 1)))}
            style={{ width: 80 }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
          <input
            type="checkbox"
            checked={ends}
            onChange={(e) => setEnds(e.target.checked)}
          />
          <span>Detener al finalizar la canción actual</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
          <input
            type="checkbox"
            checked={fade}
            onChange={(e) => setFade(e.target.checked)}
          />
          <span>Desvanecer el último minuto</span>
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 12 }}>
          {active && (
            <button
              className="btn btn-secondary"
              onClick={() => {
                stop()
                onClose()
              }}
            >
              Cancelar temporizador
            </button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>
            Cerrar
          </button>
          <button
            className="btn"
            onClick={() => {
              start(minutes, { endWithSong: ends, fadeOutLastMinute: fade })
              onClose()
            }}
          >
            {active ? 'Reiniciar' : 'Iniciar'}
          </button>
        </div>
      </div>
    </div>
  )
}
