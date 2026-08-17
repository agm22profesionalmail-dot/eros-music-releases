import { useEffect, useMemo, useRef, useState } from 'react'
import type { TrackSummary } from '@shared/types'
import { ListSearchInput } from './ListSearchInput'
import { CloseIcon, MusicNoteIcon } from './Icons'
import { useT } from '../app/i18n'

/**
 * F22 · Modal para elegir canciones y añadirlas a una playlist. La selección
 * es **acumulada**: cambiar la búsqueda no borra lo ya marcado, así el usuario
 * puede añadir 3 canciones de tres búsquedas distintas sin perder el hilo.
 *
 * No consulta backend en el render — cada nueva `query` (con debounce 250ms)
 * dispara `window.api.music.search`. Los resultados nuevos se muestran con su
 * checkbox reflejando si la canción ya está en la lista acumulada.
 */

interface Props {
  playlistId: string
  playlistTitle: string
  /** Se llama al cerrar. Si `added > 0` conviene refrescar biblioteca+playlist. */
  onClose: (added: number) => void
}

export function TrackPickerModal({ playlistId, playlistTitle, onClose }: Props): React.JSX.Element {
  const t = useT()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TrackSummary[]>([])
  const [loading, setLoading] = useState(false)
  // Selección acumulada: `Map<videoId, TrackSummary>` para preservar orden y
  // tener la carátula/artistas aunque la canción salga del listado actual.
  const [selected, setSelected] = useState<Map<string, TrackSummary>>(new Map())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Nº de petición: descartamos respuestas obsoletas si el usuario tecleó rápido.
  const seqRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Debounce 250 ms para la búsqueda.
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setLoading(false)
      seqRef.current++
      return
    }
    const seq = ++seqRef.current
    setLoading(true)
    const t = setTimeout(() => {
      void window.api.music
        .search(query.trim(), 'song')
        .then((res) => {
          if (seq !== seqRef.current) return
          setResults(res.songs ?? [])
          setLoading(false)
        })
        .catch((err) => {
          if (seq !== seqRef.current) return
          setError(String((err as Error)?.message ?? err))
          setLoading(false)
        })
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  // Escape cierra el modal (sin añadir nada).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose(0)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const selectedList = useMemo(() => Array.from(selected.values()), [selected])

  const toggle = (t: TrackSummary): void => {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(t.videoId)) next.delete(t.videoId)
      else next.set(t.videoId, t)
      return next
    })
  }

  const clearSelection = (): void => setSelected(new Map())

  const confirm = async (): Promise<void> => {
    if (!selected.size) return
    setSaving(true)
    setError(null)
    try {
      const ids = Array.from(selected.keys())
      await window.api.library.playlistAdd(playlistId, ids)
      onClose(ids.length)
    } catch (err) {
      setError(String((err as Error)?.message ?? err))
      setSaving(false)
    }
  }

  return (
    <div className="picker-overlay" onClick={() => onClose(0)}>
      <div
        className="picker-card"
        role="dialog"
        aria-label={t('picker.aria', { title: playlistTitle })}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="picker-head">
          <div className="picker-title">
            <div className="eyebrow">{t('picker.addTo')}</div>
            <div className="name">{playlistTitle}</div>
          </div>
          <button className="picker-x" onClick={() => onClose(0)} aria-label={t('btn.close')}>
            <CloseIcon size={16} />
          </button>
        </header>

        <div className="picker-search">
          <ListSearchInput
            value={query}
            onChange={setQuery}
            placeholder={t('picker.searchPlaceholder')}
            ariaLabel={t('picker.searchAria')}
          />
        </div>

        {selected.size > 0 && (
          <div className="picker-chip" role="status">
            <span>
              {selected.size === 1
                ? t('picker.selectedOne')
                : t('picker.selectedMany', { n: selected.size })}
            </span>
            <button
              type="button"
              className="picker-chip-x"
              onClick={clearSelection}
              aria-label={t('picker.clearSelection')}
              title={t('picker.clearSelection')}
            >
              <CloseIcon size={12} />
            </button>
          </div>
        )}

        <div className="picker-list">
          {loading && (
            <div className="picker-loading">
              <div className="spinner" style={{ width: 22, height: 22, borderWidth: 2 }} />
            </div>
          )}
          {!loading && !query.trim() && selectedList.length === 0 && (
            <div className="picker-empty">{t('picker.typeToSearch')}</div>
          )}
          {!loading && !query.trim() && selectedList.length > 0 && (
            <>
              <div className="picker-section">{t('picker.alreadySelected')}</div>
              {selectedList.map((t) => (
                <PickerRow key={t.videoId} track={t} selected onToggle={() => toggle(t)} />
              ))}
            </>
          )}
          {!loading &&
            query.trim() &&
            results.length === 0 &&
            !error && (
              <div className="picker-empty">{t('search.empty', { q: query.trim() })}</div>
            )}
          {!loading && error && <div className="picker-empty">{t('picker.searchError', { msg: error })}</div>}
          {!loading &&
            query.trim() &&
            results.map((t) => (
              <PickerRow
                key={t.videoId}
                track={t}
                selected={selected.has(t.videoId)}
                onToggle={() => toggle(t)}
              />
            ))}
        </div>

        <footer className="picker-foot">
          <button className="btn btn-secondary" onClick={() => onClose(0)}>
            {t('btn.cancel')}
          </button>
          <button
            className="btn btn-primary"
            disabled={saving || selected.size === 0}
            onClick={() => void confirm()}
          >
            {saving
              ? t('picker.adding')
              : selected.size === 0
                ? t('picker.addSongs')
                : selected.size === 1
                  ? t('picker.addOne')
                  : t('picker.addMany', { n: selected.size })}
          </button>
        </footer>

        {/* Foco inicial en el buscador — se hace fuera del JSX por temas de refs */}
        <FocusOnMount inputRef={inputRef} />
      </div>
    </div>
  )
}

/** Fila individual del picker con checkbox, carátula 40×40, título/artistas. */
function PickerRow({
  track,
  selected,
  onToggle
}: {
  track: TrackSummary
  selected: boolean
  onToggle: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`picker-row ${selected ? 'is-selected' : ''}`}
      onClick={onToggle}
    >
      <span className="picker-check" aria-hidden="true">
        <input type="checkbox" checked={selected} readOnly tabIndex={-1} />
      </span>
      {track.thumbnailUrl ? (
        <img src={track.thumbnailUrl} alt="" loading="lazy" />
      ) : (
        <span className="ph">
          <MusicNoteIcon size={20} />
        </span>
      )}
      <span className="picker-meta">
        <span className="t">{track.title}</span>
        <span className="s">
          {track.artists.map((a) => a.name).filter(Boolean).join(', ') || '—'}
        </span>
      </span>
    </button>
  )
}

/** Foco al buscador al montar sin recurrir a un `useLayoutEffect` en el padre. */
function FocusOnMount({
  inputRef
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
}): null {
  useEffect(() => {
    const el = document.querySelector<HTMLInputElement>('.picker-search .list-search input')
    inputRef.current = el ?? null
    setTimeout(() => el?.focus(), 40)
  }, [inputRef])
  return null
}
