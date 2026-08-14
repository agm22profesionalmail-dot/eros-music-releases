import { useCallback, useRef } from 'react'
import { usePlayer } from '../player/store'
import { formatTime } from '../app/authStore'
import { useRouter } from '../app/router'
import { useLibrary } from '../app/libraryStore'
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
    </footer>
  )
}
