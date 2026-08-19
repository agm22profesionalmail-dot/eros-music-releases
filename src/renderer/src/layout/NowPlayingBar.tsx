import { useCallback, useEffect, useRef, useState } from 'react'
import type { QueueItem } from '@shared/types'
import { usePlayer } from '../player/store'
import { formatTime } from '../app/authStore'
import { useRouter } from '../app/router'
import { useLibrary } from '../app/libraryStore'
import { useSleepTimer } from '../app/sleepTimer'
import { useT } from '../app/i18n'
import {
  ClockIcon,
  HeartIcon,
  MicIcon,
  MiniPlayerIcon,
  MoreIcon,
  MusicNoteIcon,
  PauseIcon,
  PlayIcon,
  QueueIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  SkipNextIcon,
  SkipPrevIcon,
  VisualizerIcon,
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

/**
 * F46 · Carátula con doble capa para crossfade visual sincronizado con el
 * fade de audio. Cuando `crossfading` está activo, renderiza la carátula
 * saliente ABAJO (fadeOut) y la entrante ARRIBA (fadeIn), ambas con la
 * misma `--xfade-visual-ms` que dura el audio. Fuera del crossfade cae al
 * comportamiento normal (una sola `<img>` con `key`).
 */
function CrossfadeArt({ current }: { current: QueueItem }): React.JSX.Element {
  const crossfading = usePlayer((s) => s.crossfading)
  const from = crossfading?.fromTrack
  const dur = crossfading?.durationMs ?? 500
  const style = { ['--xfade-visual-ms' as string]: `${dur}ms` }
  return (
    <div className="np-cover-wrap" style={style}>
      {from && from.videoId !== current.videoId && from.thumbnailUrl && (
        <img
          key={`from-${from.videoId}`}
          src={from.thumbnailUrl}
          alt=""
          aria-hidden="true"
          className="np-cover np-cover-out"
        />
      )}
      {current.thumbnailUrl ? (
        <img
          // F47b · sin token en la key: cuando el token se limpia (fin del
          // crossfade), React NO debe remontar el wrapper (la anim fade-in
          // volvería a arrancar desde opacity 0 y la carátula queda vacía
          // un instante). Key = videoId estable.
          key={`to-${current.videoId}`}
          src={current.thumbnailUrl}
          alt=""
          className={`np-cover ${from ? 'np-cover-in' : ''}`}
        />
      ) : (
        <span className={`np-cover ph ${from ? 'np-cover-in' : ''}`}>
          <MusicNoteIcon size={24} />
        </span>
      )}
    </div>
  )
}

/**
 * F46 · Título+artista con fade secuencial (out → in) durante el crossfade.
 * A diferencia de la carátula, el texto no se superpone: la anterior primero
 * desaparece completamente (~55 % del tiempo) y solo entonces aparece la
 * nueva (~45 %) — leer dos títulos solapados sería confuso.
 */
function CrossfadeText({
  current,
  children
}: {
  current: QueueItem
  children: React.ReactNode
}): React.JSX.Element {
  const crossfading = usePlayer((s) => s.crossfading)
  const from = crossfading?.fromTrack
  const dur = crossfading?.durationMs ?? 500
  const style = { ['--xfade-visual-ms' as string]: `${dur}ms` }
  if (!from || from.videoId === current.videoId) return <>{children}</>
  return (
    <div className="np-text-wrap" style={style}>
      <div className="np-text-out" aria-hidden="true">
        <div className="title">{from.title}</div>
        <div className="artist">{from.artists.map((a) => a.name).join(', ')}</div>
      </div>
      <div className="np-text-in">{children}</div>
    </div>
  )
}

/**
 * F44 · Control de volumen con popover persistente en ventana estrecha.
 * En ventana ancha se comporta como antes (slider inline visible siempre;
 * el popover queda inerte porque el `.volume-popover` está `display:none`
 * fuera del media query).
 *
 * En ventana estrecha (`@media max-width: 960`) el CSS puro con `:hover`
 * cerraba el popover en cuanto el ratón salía del botón para ir hacia la
 * barra flotante — no daba tiempo a alcanzarla. Aquí el estado `open` se
 * gestiona en JS: `mouseenter` sobre el botón O sobre el popover cancela
 * cualquier cierre pendiente y abre. `mouseleave` programa un cierre a
 * `HOVER_HIDE_MS` (800 ms). Foco (`focus-within`) también mantiene abierto.
 */
const HOVER_HIDE_MS = 800

function VolumeControl({
  volume,
  setVolume
}: {
  volume: number
  setVolume: (v: number) => void
}): React.JSX.Element {
  const t = useT()
  const [open, setOpen] = useState(false)
  const hideTimer = useRef<number>(0)

  const cancelHide = useCallback((): void => {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current)
      hideTimer.current = 0
    }
  }, [])
  const scheduleHide = useCallback((): void => {
    cancelHide()
    hideTimer.current = window.setTimeout(() => setOpen(false), HOVER_HIDE_MS)
  }, [cancelHide])
  const openNow = useCallback((): void => {
    cancelHide()
    setOpen(true)
  }, [cancelHide])

  useEffect(() => {
    return () => cancelHide()
  }, [cancelHide])

  return (
    <div
      className={`np-volume-group ${open ? 'is-open' : ''}`}
      onMouseEnter={openNow}
      onMouseLeave={scheduleHide}
      onFocus={openNow}
      onBlur={scheduleHide}
    >
      <button
        className="np-ctrl"
        aria-label={t('np.mute')}
        onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
      >
        <VolumeIcon size={18} muted={volume === 0} />
      </button>
      <div className="volume">
        <Slider value={volume} max={1} onChange={setVolume} />
      </div>
      <div className="volume-popover">
        <Slider value={volume} max={1} onChange={setVolume} />
      </div>
    </div>
  )
}

/**
 * Menú "Más opciones" (⋯): agrupa las acciones secundarias que antes vivían
 * sueltas a la derecha de la barra (Letras, Temporizador de apagado y
 * Mini-player) en un popover, para dejar la zona derecha limpia junto al
 * volumen. Reutiliza el mismo patrón de apertura persistente de
 * `VolumeControl` (hover/click con cierre diferido a `HOVER_HIDE_MS`).
 *
 * Lee sus propios stores (router, sleepTimer, player) igual que el resto del
 * archivo; solo recibe `onOpenSleep` porque el estado del modal vive en el
 * componente padre.
 */
function MoreMenu({ onOpenSleep }: { onOpenSleep: () => void }): React.JSX.Element {
  const t = useT()
  const navigate = useRouter((s) => s.navigate)
  const route = useRouter((s) => s.route())
  const current = usePlayer((s) => s.current())
  const sleepActive = useSleepTimer((s) => s.active)
  const sleepMinutesLeft = useSleepTimer((s) => s.minutesLeft)
  const [open, setOpen] = useState(false)
  const hideTimer = useRef<number>(0)

  const cancelHide = useCallback((): void => {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current)
      hideTimer.current = 0
    }
  }, [])
  const scheduleHide = useCallback((): void => {
    cancelHide()
    hideTimer.current = window.setTimeout(() => setOpen(false), HOVER_HIDE_MS)
  }, [cancelHide])
  const openNow = useCallback((): void => {
    cancelHide()
    setOpen(true)
  }, [cancelHide])

  useEffect(() => {
    return () => cancelHide()
  }, [cancelHide])

  const lyricsActive = route.name === 'lyrics'
  const anyActive = lyricsActive || sleepActive

  // Ejecuta la acción y cierra el menú de inmediato.
  const runAndClose = (fn: () => void) => (): void => {
    fn()
    cancelHide()
    setOpen(false)
  }

  return (
    <div
      className={`np-more-group ${open ? 'is-open' : ''}`}
      onMouseEnter={openNow}
      onMouseLeave={scheduleHide}
      onFocus={openNow}
      onBlur={scheduleHide}
    >
      <button
        className={`np-ctrl ${anyActive ? 'active' : ''}`}
        aria-label={t('np.more')}
        title={t('np.more')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openNow())}
      >
        <MoreIcon size={18} />
        {sleepActive && (
          <span className="sleep-badge" aria-hidden="true">
            {sleepMinutesLeft}
          </span>
        )}
      </button>
      <div className="np-more-popover" role="menu">
        <button
          role="menuitem"
          className={`np-more-item ${lyricsActive ? 'active' : ''}`}
          disabled={!current}
          onClick={runAndClose(() => navigate({ name: 'lyrics' }))}
        >
          <MicIcon size={16} />
          <span>{t('np.lyrics')}</span>
        </button>
        <button
          role="menuitem"
          className={`np-more-item ${sleepActive ? 'active' : ''}`}
          onClick={runAndClose(onOpenSleep)}
          data-testid="sleep-timer-btn"
        >
          <ClockIcon size={16} />
          <span>{t('sleep.title')}</span>
          {sleepActive && (
            <span className="np-more-badge">{t('sleep.willStopIn', { m: sleepMinutesLeft })}</span>
          )}
        </button>
        <button
          role="menuitem"
          className="np-more-item"
          onClick={runAndClose(() => void window.api.mini.toggle())}
        >
          <MiniPlayerIcon size={16} />
          <span>{t('np.miniPlayer')}</span>
        </button>
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
  const t = useT()
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
  // F27 · Sleep timer: el estado (activo/minutos) lo lee ahora MoreMenu; aquí
  // solo queda el control del modal.
  const [sleepOpen, setSleepOpen] = useState(false)

  const effDuration = duration || current?.durationSec || 0
  const isLiked = current ? likedIds.has(current.videoId) : false

  return (
    <footer className="nowplaying">
      <div className="np-left">
        {current ? (
          <>
            {/* F46 · Capas de crossfade visual: durante el fade audio la
                carátula anterior queda debajo desvaneciéndose y la nueva
                entra por encima con opacity 0→1, con la misma duración que
                el audio. El texto usa animación desfasada (fade-out primero,
                luego fade-in) — más legible que superponer dos títulos. */}
            <CrossfadeArt current={current} />
            <div className="meta">
              <CrossfadeText current={current}>
                <div
                  className="title"
                  onClick={() => {
                    if (current.album?.id) navigate({ name: 'album', id: current.album.id })
                  }}
                >
                  {current.title}
                </div>
                <div className="artist">
                  {/* F60 · Siempre clicables: con id van directos al perfil;
                      sin id (pistas de radio antiguas en cola) caen a la
                      búsqueda con el nombre, que siempre encuentra al artista. */}
                  {current.artists.map((a, i) => (
                    <span key={`${a.id ?? a.name}-${i}`}>
                      {i > 0 && ', '}
                      <a
                        title={t('np.goToArtist')}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (a.id) navigate({ name: 'artist', id: a.id })
                          else navigate({ name: 'search', query: a.name })
                        }}
                      >
                        {a.name}
                      </a>
                    </span>
                  ))}
                </div>
              </CrossfadeText>
            </div>
            <button
              className={`icon-btn ${isLiked ? 'accent' : ''}`}
              aria-label={t('np.like')}
              onClick={() => void toggleLike(current)}
            >
              <span key={isLiked ? 'on' : 'off'} className={isLiked ? 'heart-liked' : undefined} style={{ display: 'grid' }}>
                <HeartIcon size={18} filled={isLiked} />
              </span>
            </button>
          </>
        ) : (
          <span style={{ color: 'var(--text-subdued)', fontSize: 13 }}>{t('np.nothingPlaying')}</span>
        )}
      </div>

      <div className="np-center">
        <div className="np-controls">
          <button
            className={`np-ctrl ${route.name === 'visualizer' ? 'active' : ''}`}
            aria-label={t('np.visualizer')}
            title={t('np.visualizer')}
            onClick={() =>
              navigate(route.name === 'visualizer' ? { name: 'home' } : { name: 'visualizer' })
            }
            disabled={!current}
          >
            <VisualizerIcon size={18} />
          </button>
          <button
            className={`np-ctrl ${shuffle ? 'active' : ''}`}
            aria-label={t('np.shuffle')}
            onClick={toggleShuffle}
          >
            <ShuffleIcon size={18} />
          </button>
          <button className="np-ctrl" aria-label={t('np.previous')} onClick={() => void previous()}>
            <SkipPrevIcon size={18} />
          </button>
          <button className="np-play" aria-label={t('np.playPause')} onClick={togglePlay}>
            {isBuffering ? (
              <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            ) : isPlaying ? (
              <PauseIcon size={18} />
            ) : (
              <PlayIcon size={18} />
            )}
          </button>
          <button className="np-ctrl" aria-label={t('np.next')} onClick={() => void next()}>
            <SkipNextIcon size={18} />
          </button>
          <button
            className={`np-ctrl ${repeat !== 'off' ? 'active' : ''}`}
            aria-label={t('np.repeat')}
            onClick={cycleRepeat}
          >
            {repeat === 'one' ? <RepeatOneIcon size={18} /> : <RepeatIcon size={18} />}
          </button>
          <button
            className={`np-ctrl ${queueOpen ? 'active' : ''}`}
            aria-label={t('queue.title')}
            onClick={onToggleQueue}
          >
            <QueueIcon size={18} />
          </button>
        </div>
        <div className="np-progress">
          <span>{formatTime(currentTime)}</span>
          <Slider value={currentTime} max={effDuration} onChange={seek} />
          <span>{formatTime(effDuration)}</span>
        </div>
      </div>

      <div className="np-right">
        {/* Acciones secundarias agrupadas en ⋯ (Letras · Temporizador · Mini).
            El botón muestra el badge de minutos del sleep cuando está activo,
            para no perder el aviso al esconderlo dentro del menú. */}
        <MoreMenu onOpenSleep={() => setSleepOpen(true)} />
        {/* F42/F44 · Grupo relative: en ventana ancha se ve el slider inline
            de siempre; en ventana estrecha (donde no cabe) NO desaparece —
            aparece como popover flotante. El estado abierto se gestiona en
            JS con delay al ocultar (~800ms): un CSS `:hover` puro perdía el
            popover en cuanto el ratón salía del botón hacia arriba (antes
            de llegar al popover). Ahora mientras el ratón está sobre el
            grupo (botón o popover) sigue abierto; al salir, cierra a los
            800ms — margen de sobra para que el usuario alcance la barra. */}
        <VolumeControl volume={volume} setVolume={setVolume} />
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
  const t = useT()
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
      aria-label={t('sleep.title')}
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
        <h3 style={{ marginTop: 0 }}>{t('sleep.title')}</h3>
        {active ? (
          <p style={{ color: 'var(--text-secondary)' }}>
            {t('sleep.activeLeft', { m: minutesLeft })}
          </p>
        ) : (
          <p style={{ color: 'var(--text-secondary)' }}>
            {t('sleep.explain')}
          </p>
        )}
        {/* F43 · agente C · task #22: presets rápidos. Al pulsar 10/20/30/60 se
            rellena el input Minutos y se apaga "al final de la canción" (son
            modos mutuamente excluyentes). "Al final de la canción" solo enciende
            el checkbox ends, que es lo que de verdad manda al sleepTimer store. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '4px 0 8px' }}>
          {[10, 20, 30, 60].map((v) => (
            <button
              key={v}
              type="button"
              className={`chip ${minutes === v && !ends ? 'active' : ''}`}
              onClick={() => {
                setMinutes(v)
                setEnds(false)
              }}
            >
              {v} min
            </button>
          ))}
          <button
            type="button"
            className={`chip ${ends ? 'active' : ''}`}
            onClick={() => setEnds(!ends)}
          >
            {t('sleep.endOfSong')}
          </button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0' }}>
          <span style={{ flex: 1 }}>{t('sleep.minutes')}</span>
          {/* F43 · agente C · task #22: type="text" + inputMode="numeric" para
              quitar los spinners nativos (feos y saltarines) sin perder el
              teclado numérico en móvil ni la sanitización a enteros 1..600. */}
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={minutes}
            onChange={(e) => {
              const raw = e.target.value.replace(/\D+/g, '')
              const n = raw === '' ? 1 : Number(raw)
              setMinutes(Math.max(1, Math.min(600, n || 1)))
            }}
            style={{ width: 80, textAlign: 'right' }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
          <input
            type="checkbox"
            checked={ends}
            onChange={(e) => setEnds(e.target.checked)}
          />
          <span>{t('sleep.stopAfterCurrent')}</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
          <input
            type="checkbox"
            checked={fade}
            onChange={(e) => setFade(e.target.checked)}
          />
          <span>{t('sleep.fadeLastMinute')}</span>
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
              {t('sleep.cancelTimer')}
            </button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>
            {t('btn.close')}
          </button>
          <button
            className="btn"
            onClick={() => {
              start(minutes, { endWithSong: ends, fadeOutLastMinute: fade })
              onClose()
            }}
          >
            {active ? t('sleep.restart') : t('sleep.start')}
          </button>
        </div>
      </div>
    </div>
  )
}
