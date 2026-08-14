import { useEffect, useState } from 'react'
import { CloseIcon, MusicNoteIcon, PauseIcon, PlayIcon, SkipNextIcon, SkipPrevIcon } from './components/Icons'

/**
 * Mini-player flotante: ventana compacta siempre visible.
 * No reproduce nada por sí mismo: recibe el estado de la ventana principal
 * vía IPC y devuelve comandos de control.
 */

interface MiniState {
  title: string
  artists: string
  thumbnailUrl?: string
  isPlaying: boolean
  positionSec: number
  durationSec: number
}

export default function MiniPlayer(): React.JSX.Element {
  const [state, setState] = useState<MiniState | null>(null)

  useEffect(() => {
    return window.api.mini.onState((s) => setState(s as MiniState))
  }, [])

  const pct =
    state && state.durationSec > 0
      ? Math.min(100, (state.positionSec / state.durationSec) * 100)
      : 0

  return (
    <div
      style={{
        height: '100vh',
        display: 'grid',
        gridTemplateColumns: '84px 1fr auto',
        alignItems: 'center',
        gap: 12,
        padding: '0 12px 0 0',
        background: 'var(--bg-base)',
        overflow: 'hidden',
        ['WebkitAppRegion' as string]: 'drag',
        position: 'relative'
      }}
    >
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

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            cursor: 'pointer',
            ['WebkitAppRegion' as string]: 'no-drag'
          }}
          title="Abrir Metrolist"
          onClick={() => void window.api.mini.showMain()}
        >
          {state?.title ?? 'Metrolist'}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {state?.artists ?? 'Nada en reproducción'}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          ['WebkitAppRegion' as string]: 'no-drag'
        }}
      >
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
        <button
          className="np-ctrl"
          style={{ marginLeft: 4 }}
          title="Cerrar mini-player"
          onClick={() => void window.api.mini.toggle()}
        >
          <CloseIcon size={13} />
        </button>
      </div>

      {/* Barra de progreso pegada al borde inferior */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 3,
          background: 'var(--bg-tinted)'
        }}
      >
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)' }} />
      </div>
    </div>
  )
}
