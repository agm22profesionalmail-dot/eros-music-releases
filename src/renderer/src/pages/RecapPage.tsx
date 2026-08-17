import { useEffect, useState } from 'react'
import type { ArtistStats, StatsPeriod, TrackStats } from '@shared/types'
import { pushToast } from '../components/Toast'
import { useSettings } from '../app/settingsStore'
import { useLibrary } from '../app/libraryStore'
import { t as ti18n, useT } from '../app/i18n'

/**
 * F31 · Página Recap. Muestra un resumen tipo Wrapped configurable por
 * período (semana, mes, últimos 30 días) con métricas grandes y dos rejillas
 * (canciones y artistas). Un botón crea una playlist en la cuenta con el
 * Top del mes.
 *
 * La página lee las estadísticas del backend (agregación sobre el historial
 * local). Con historial vacío pinta ceros — nunca lanza.
 */

type RangeKey = 'week' | 'month' | 'last30'

// Genera el período localmente para poder pedir top al backend sin repetir
// lógica de fechas. El módulo main/stats/ tiene la misma implementación.
function periodOf(range: RangeKey): StatsPeriod {
  const now = Date.now()
  const d = new Date(now)
  if (range === 'week') {
    const dow = (d.getDay() + 6) % 7
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow, 0, 0, 0, 0)
    return { start: start.getTime(), end: now }
  }
  if (range === 'month') {
    const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0)
    return { start: start.getTime(), end: now }
  }
  return { start: now - 30 * 86400_000, end: now }
}

function rangeLabel(range: RangeKey): string {
  if (range === 'week') return ti18n('recap.range.week')
  if (range === 'month') return ti18n('recap.range.month')
  return ti18n('recap.range.last30')
}

function formatHours(sec: number): string {
  const h = sec / 3600
  return h < 1 ? `${Math.round(sec / 60)} min` : `${h.toFixed(1)} h`
}

export function RecapPage(): React.JSX.Element {
  const t = useT()
  const { settings } = useSettings()
  const loadLibrary = useLibrary((s) => s.load)
  const [range, setRange] = useState<RangeKey>('last30')
  const [tracks, setTracks] = useState<TrackStats[] | null>(null)
  const [artists, setArtists] = useState<ArtistStats[] | null>(null)
  const [creating, setCreating] = useState<boolean>(false)

  useEffect(() => {
    let cancelled = false
    setTracks(null)
    setArtists(null)
    const p = periodOf(range)
    const topN = Math.max(10, Math.min(500, settings.wrappedTopN ?? 50))
    Promise.all([window.api.stats.topTracks(p, topN), window.api.stats.topArtists(p, topN)])
      .then(([ts, as]) => {
        if (cancelled) return
        setTracks(ts)
        setArtists(as)
      })
      .catch(() => {
        if (cancelled) return
        setTracks([])
        setArtists([])
      })
    return () => {
      cancelled = true
    }
  }, [range, settings.wrappedTopN])

  const totalSec = (tracks ?? []).reduce((acc, t) => acc + t.totalSec, 0)
  const uniqueTracks = tracks?.length ?? 0
  const uniqueArtists = artists?.length ?? 0
  const topArtist = artists?.[0]

  const onCreatePlaylist = async (which: 'week' | 'month'): Promise<void> => {
    if (creating) return
    setCreating(true)
    try {
      const id = await window.api.stats.createTopPlaylist(
        which,
        Math.max(10, Math.min(500, settings.wrappedTopN ?? 50))
      )
      if (!id) {
        pushToast(t('recap.noHistoryForPlaylist'))
      } else {
        pushToast(which === 'week' ? t('recap.weeklyCreated') : t('recap.monthlyCreated'))
        void loadLibrary()
      }
    } catch {
      pushToast(t('toast.playlistCreateFailed'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="page recap-page">
      <h1>{t('recap.title')}</h1>
      <p className="recap-subtitle">
        {t('recap.subtitle', { range: rangeLabel(range) })}
      </p>

      {/* Selector de rango */}
      <div className="recap-range">
        {(
          [
            ['week', 'recap.chip.week'],
            ['month', 'recap.chip.month'],
            ['last30', 'recap.chip.last30']
          ] as const
        ).map(([value, labelKey]) => (
          <button
            key={value}
            className={`chip ${range === value ? 'active' : ''}`}
            onClick={() => setRange(value)}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {/* Métricas grandes */}
      <div className="recap-metrics">
        <div className="recap-metric">
          <div className="recap-metric-value">{formatHours(totalSec)}</div>
          <div className="recap-metric-label">{t('recap.listened')}</div>
        </div>
        <div className="recap-metric">
          <div className="recap-metric-value">{uniqueTracks}</div>
          <div className="recap-metric-label">{t('recap.uniqueTracks')}</div>
        </div>
        <div className="recap-metric">
          <div className="recap-metric-value">{uniqueArtists}</div>
          <div className="recap-metric-label">{t('recap.uniqueArtists')}</div>
        </div>
        <div className="recap-metric">
          <div className="recap-metric-value" title={topArtist?.name ?? ''}>
            {topArtist?.name ?? '—'}
          </div>
          <div className="recap-metric-label">{t('recap.topArtist')}</div>
        </div>
      </div>

      {/* Acciones: crear playlist automatica */}
      <div className="recap-actions">
        <button
          className="btn btn-primary"
          disabled={creating}
          onClick={() => void onCreatePlaylist('month')}
        >
          {creating ? t('recap.creating') : t('recap.createMonthly', { n: Math.max(10, Math.min(500, settings.wrappedTopN ?? 50)) })}
        </button>
        <button
          className="btn btn-secondary"
          disabled={creating}
          onClick={() => void onCreatePlaylist('week')}
        >
          {t('recap.createWeekly')}
        </button>
      </div>

      {/* Top canciones */}
      <h2>{t('recap.topSongs')}</h2>
      {!tracks && <div className="empty-state">{t('recap.calculating')}</div>}
      {tracks && !tracks.length && (
        <div className="empty-state">
          {t('recap.noHistory')}
        </div>
      )}
      {tracks && tracks.length > 0 && (
        <ol className="recap-list">
          {tracks.slice(0, 10).map((t, i) => (
            <li key={t.videoId} className="recap-row">
              <span className="recap-rank">{i + 1}</span>
              {t.thumbnailUrl ? (
                <img className="recap-thumb" src={t.thumbnailUrl} alt="" />
              ) : (
                <div className="recap-thumb recap-thumb--placeholder" aria-hidden="true" />
              )}
              <div className="recap-row-text">
                <div className="recap-row-title">{t.title}</div>
                <div className="recap-row-sub">{t.artists || '—'}</div>
              </div>
              <div className="recap-row-count">{t.playCount} ▶</div>
            </li>
          ))}
        </ol>
      )}

      {/* Top artistas */}
      <h2>{t('recap.topArtists')}</h2>
      {!artists && <div className="empty-state">{t('recap.calculating')}</div>}
      {artists && !artists.length && (
        <div className="empty-state">
          {t('recap.noArtists')}
        </div>
      )}
      {artists && artists.length > 0 && (
        <ol className="recap-list">
          {artists.slice(0, 5).map((a, i) => (
            <li key={a.name} className="recap-row">
              <span className="recap-rank">{i + 1}</span>
              {a.thumbnailUrl ? (
                <img className="recap-thumb recap-thumb--artist" src={a.thumbnailUrl} alt="" />
              ) : (
                <div className="recap-thumb recap-thumb--placeholder" aria-hidden="true" />
              )}
              <div className="recap-row-text">
                <div className="recap-row-title">{a.name}</div>
                <div className="recap-row-sub">{formatHours(a.totalSec)} · {t('recap.playCount', { n: a.playCount })}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
