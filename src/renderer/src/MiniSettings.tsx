import { useEffect, useState } from 'react'
import type { AppSettings, MiniCorner } from '@shared/types'
import { CloseIcon, MoveIcon } from './components/Icons'
import { applyThemeDom } from './app/themeDom'
import { resolveLocale, useI18n, useT } from './app/i18n'

/**
 * Ventana independiente de ajustes del mini-player.
 * Diagrama de la pantalla con las 4 esquinas clicables + posición libre.
 * Los cambios se aplican en vivo (el mini se mueve al instante).
 */

export default function MiniSettings(): React.JSX.Element {
  const t = useT()
  const [corner, setCorner] = useState<MiniCorner>('br')
  const [karaoke, setKaraoke] = useState(false)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const apply = (s: AppSettings): void => {
      setCorner(s.miniCorner)
      setKaraoke(s.miniKaraoke)
      setScale(s.miniScale || 1)
      applyThemeDom(s)
      // F58 · Esta ventana no pasa por settingsStore: aplica el idioma aquí.
      useI18n.getState().setLocale(resolveLocale(s.uiLanguage))
    }
    void window.api.settings.get().then(apply)
    return window.api.settings.onChanged(apply)
  }, [])

  const pick = (c: MiniCorner): void => {
    setCorner(c)
    void window.api.mini.setCorner(c)
  }

  const cornerBtn = (c: Exclude<MiniCorner, 'free'>, pos: React.CSSProperties): React.JSX.Element => (
    <button
      onClick={() => pick(c)}
      title={
        { tl: t('mini.cornerTl'), tr: t('mini.cornerTr'), bl: t('mini.cornerBl'), br: t('mini.cornerBr') }[c]
      }
      style={{
        position: 'absolute',
        width: 44,
        height: 28,
        borderRadius: 6,
        border: `2px solid ${corner === c ? 'var(--accent)' : 'var(--text-subdued)'}`,
        background: corner === c ? 'var(--accent)' : 'var(--bg-tinted)',
        transition: 'all 0.15s',
        ...pos
      }}
    />
  )

  return (
    <div
      style={{
        height: '100vh',
        background: 'var(--bg-base)',
        display: 'flex',
        flexDirection: 'column',
        padding: 16,
        gap: 12,
        userSelect: 'none'
      }}
    >
      {/* Barra de título arrastrable */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          ['WebkitAppRegion' as string]: 'drag'
        }}
      >
        <b style={{ fontSize: 15 }}>{t('mini.settings')}</b>
        <button
          className="icon-btn"
          style={{ ['WebkitAppRegion' as string]: 'no-drag' }}
          onClick={() => void window.api.mini.openSettings()}
          aria-label={t('btn.close')}
        >
          <CloseIcon size={14} />
        </button>
      </div>

      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        {t('mini.pickCorner')}
      </span>

      {/* Diagrama de pantalla */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          borderRadius: 10,
          border: '2px solid var(--divider)',
          background: 'var(--bg-highlight)',
          minHeight: 150
        }}
      >
        {cornerBtn('tl', { top: 8, left: 8 })}
        {cornerBtn('tr', { top: 8, right: 8 })}
        {cornerBtn('bl', { bottom: 8, left: 8 })}
        {cornerBtn('br', { bottom: 8, right: 8 })}
        <button
          onClick={() => pick('free')}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            padding: '10px 16px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            border: `2px solid ${corner === 'free' ? 'var(--accent)' : 'var(--text-subdued)'}`,
            background: corner === 'free' ? 'var(--accent)' : 'var(--bg-tinted)',
            color: corner === 'free' ? '#000' : 'var(--text-primary)',
            transition: 'all 0.15s'
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <MoveIcon size={13} /> {t('mini.free')}
          </span>
        </button>
        {/* Barra de tareas simulada */}
        <div
          style={{
            position: 'absolute',
            left: 2,
            right: 2,
            bottom: 2,
            height: 4,
            borderRadius: 2,
            background: 'var(--bg-tinted)'
          }}
        />
      </div>

      <span style={{ fontSize: 12, color: 'var(--text-subdued)', lineHeight: 1.5 }}>
        {corner === 'free' ? t('mini.freeHint') : t('mini.cornerHint')}
      </span>

      {/* Tamaño de la tarjeta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
          {t('mini.size')} <b>{Math.round(scale * 100)}%</b>
        </span>
        <input
          type="range"
          min={0.8}
          max={1.6}
          step={0.05}
          value={scale}
          style={{ flex: 1 }}
          onChange={(e) => {
            const v = Number(e.target.value)
            setScale(v)
            void window.api.mini.setScale(v)
          }}
        />
      </div>

      {/* Modo karaoke */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13 }}>
          {t('mini.karaokeMode')} <span style={{ color: 'var(--text-subdued)' }}>{t('mini.karaokeHint')}</span>
        </span>
        <input
          type="checkbox"
          checked={karaoke}
          onChange={(e) => void window.api.settings.set({ miniKaraoke: e.target.checked })}
        />
      </div>
    </div>
  )
}
