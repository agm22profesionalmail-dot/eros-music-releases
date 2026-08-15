import { useEffect, useMemo, useState } from 'react'
import type { MediaCard, RecapData, Shelf, TrackSummary } from '@shared/types'
import { ShelfRow } from '../components/Shelf'
import { HomeQuickPicks } from '../components/HomeQuickPicks'
import { shelfId } from '@shared/homeShelfCategorize'
import { usePlayer } from '../player/store'
import { useAuth } from '../app/authStore'
import { useRouter } from '../app/router'
import { pushToast } from '../components/Toast'
import { useSettings } from '../app/settingsStore'
import { useT } from '../app/i18n'

function greetingKey(): string {
  const h = new Date().getHours()
  if (h < 7) return 'home.greeting.evening'
  if (h < 14) return 'home.greeting.morning'
  if (h < 21) return 'home.greeting.afternoon'
  return 'home.greeting.evening'
}

/** Convierte una tarjeta reproducible en TrackSummary mínimo para la cola. */
export function cardToTrack(card: MediaCard): TrackSummary {
  return {
    kind: card.kind === 'video' ? 'video' : 'song',
    videoId: card.id,
    title: card.title,
    artists: card.subtitle ? [{ name: card.subtitle }] : [],
    thumbnailUrl: card.thumbnailUrl
  }
}

/**
 * F24 · Dos tarjetas grandes arriba de las estanterías: "Sorpréndeme" y
 * "Mix Personal". Se pintan al instante (no dependen de red) para que la
 * Home nunca aparezca en blanco. El estado por tarjeta guarda si está
 * cargando y evita doble click accidental.
 */
function HomeHero(): React.JSX.Element {
  const t = useT()
  const playTracks = usePlayer((s) => s.playTracks)
  const navigate = useRouter((s) => s.navigate)
  const [surpriseLoading, setSurpriseLoading] = useState(false)
  const [mixLoading, setMixLoading] = useState(false)

  const onSurprise = async (): Promise<void> => {
    if (surpriseLoading) return
    setSurpriseLoading(true)
    try {
      const s = await window.api.discovery.surprise()
      if (!s || !s.track) {
        pushToast(t('home.toast.surpriseNoSeeds'))
        navigate({ name: 'profile' })
        return
      }
      pushToast(s.reason)
      await playTracks([s.track])
    } catch {
      pushToast(t('home.toast.surpriseError'))
    } finally {
      setSurpriseLoading(false)
    }
  }

  const onMix = async (): Promise<void> => {
    if (mixLoading) return
    setMixLoading(true)
    try {
      const tracks = await window.api.discovery.mix()
      if (!tracks?.length) {
        pushToast(t('home.toast.mixNoSeeds'))
        return
      }
      pushToast(t('home.toast.mixCount', { n: tracks.length }))
      await playTracks(tracks)
    } catch {
      pushToast(t('home.toast.mixError'))
    } finally {
      setMixLoading(false)
    }
  }

  return (
    <div className="home-hero">
      <button
        type="button"
        className="hero-card hero-card--surprise"
        onClick={onSurprise}
        disabled={surpriseLoading}
        aria-label={t('home.hero.surpriseAria')}
      >
        <div className="hero-icon" aria-hidden="true">
          {/* Estrella brillante como icono de "sorpresa" */}
          <svg viewBox="0 0 24 24" width="52" height="52" fill="currentColor">
            <path d="M12 2l2.09 6.26L20.5 9.27l-4.75 4.63L16.88 21 12 17.77 7.12 21l1.13-7.1L3.5 9.27l6.41-1.01L12 2z" />
          </svg>
        </div>
        <div className="hero-body">
          <div className="hero-title">
            {surpriseLoading ? t('home.hero.preparing') : t('home.hero.surprise')}
          </div>
          <div className="hero-sub">{t('home.hero.surpriseSub')}</div>
        </div>
      </button>

      <button
        type="button"
        className="hero-card hero-card--mix"
        onClick={onMix}
        disabled={mixLoading}
        aria-label={t('home.hero.mixAria')}
      >
        <div className="hero-icon" aria-hidden="true">
          {/* Auriculares — mix personal */}
          <svg viewBox="0 0 24 24" width="52" height="52" fill="currentColor">
            <path d="M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h3v-8H5v-1a7 7 0 1 1 14 0v1h-3v8h3a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9z" />
          </svg>
        </div>
        <div className="hero-body">
          <div className="hero-title">
            {mixLoading ? t('home.hero.preparing') : t('home.hero.mix')}
          </div>
          <div className="hero-sub">{t('home.hero.mixSub')}</div>
        </div>
      </button>
    </div>
  )
}

/**
 * F31 · Tarjeta Recap + accesos rápidos al Top semanal/mensual.
 * Se pintan bajo el HomeHero y llevan a `/recap` (única página con detalle).
 * Cada tarjeta puede desactivarse desde Ajustes → Estadísticas.
 */
function HomeRecap(): React.JSX.Element | null {
  const t = useT()
  const { settings } = useSettings()
  const navigate = useRouter((s) => s.navigate)
  const [recap, setRecap] = useState<RecapData | null>(null)

  const anyEnabled =
    settings.showWrappedRecapCard || settings.showTopWeekly || settings.showTopMonthly

  useEffect(() => {
    if (!anyEnabled) return
    let cancelled = false
    window.api.stats
      .recap(30)
      .then((r) => {
        if (!cancelled) setRecap(r)
      })
      .catch(() => {
        if (!cancelled) setRecap(null)
      })
    return () => {
      cancelled = true
    }
  }, [anyEnabled])

  if (!anyEnabled) return null

  const topArtist = recap?.topArtists?.[0]?.name ?? '—'
  const uniqueTracks = recap?.uniqueTracks ?? 0
  const hours = recap?.hoursListened ?? 0

  return (
    <div className="home-recap">
      {settings.showWrappedRecapCard && (
        <button
          type="button"
          className="recap-card recap-card--wrapped"
          onClick={() => navigate({ name: 'recap' })}
          aria-label={t('home.recap.openAria')}
        >
          <div className="recap-card-icon" aria-hidden="true">
            {/* Icono de barras — estadísticas */}
            <svg viewBox="0 0 24 24" width="44" height="44" fill="currentColor">
              <path d="M5 10h3v10H5V10zm5-6h3v16h-3V4zm5 9h3v7h-3v-7z" />
            </svg>
          </div>
          <div className="recap-card-body">
            <div className="recap-card-title">{t('home.recap.title')}</div>
            <div className="recap-card-sub">
              {t('home.recap.sub', { tracks: uniqueTracks, hours, artist: topArtist })}
            </div>
          </div>
        </button>
      )}
      {settings.showTopWeekly && (
        <button
          type="button"
          className="recap-card recap-card--week"
          onClick={() => navigate({ name: 'recap' })}
          aria-label={t('home.recap.week.aria')}
        >
          <div className="recap-card-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor">
              <path d="M7 2h10v2H7V2zm-2 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm7 4l-1.5 4H8l3 2-1 4 3-2 3 2-1-4 3-2h-3.5L12 10z" />
            </svg>
          </div>
          <div className="recap-card-body">
            <div className="recap-card-title">{t('home.recap.week.title')}</div>
            <div className="recap-card-sub">{t('home.recap.week.sub')}</div>
          </div>
        </button>
      )}
      {settings.showTopMonthly && (
        <button
          type="button"
          className="recap-card recap-card--month"
          onClick={() => navigate({ name: 'recap' })}
          aria-label={t('home.recap.month.aria')}
        >
          <div className="recap-card-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor">
              <path d="M4 4h16a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 5v10h14V9H5zm2-6h2v3H7V3zm8 0h2v3h-2V3z" />
            </svg>
          </div>
          <div className="recap-card-body">
            <div className="recap-card-title">{t('home.recap.month.title')}</div>
            <div className="recap-card-sub">{t('home.recap.month.sub')}</div>
          </div>
        </button>
      )}
    </div>
  )
}

export function HomePage(): React.JSX.Element {
  const t = useT()
  const [shelves, setShelves] = useState<Shelf[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const playTracks = usePlayer((s) => s.playTracks)
  const auth = useAuth((s) => s.state)
  const { settings } = useSettings()

  useEffect(() => {
    let cancelled = false
    setShelves(null)
    setError(null)
    void window.api.music
      .home()
      .then((data) => {
        if (!cancelled) setShelves(data)
      })
      .catch((err) => {
        if (!cancelled) setError(String(err?.message ?? err))
      })
    return () => {
      cancelled = true
    }
  }, [auth.status])

  /**
   * F32 · Aplica el filtro/orden/shuffle sobre las estanterías crudas.
   * - Filtro: elimina las que estén en `homeHiddenShelves`.
   * - Orden: pone primero las del orden custom (respetando ese orden) y
   *   deja detrás el resto en orden natural.
   * - Shuffle: mezcla el resultado con `Math.random()` (no persistente).
   * El shuffle se recalcula cada vez que cambian los shelves o el toggle.
   */
  const displayedShelves = useMemo<Shelf[] | null>(() => {
    if (!shelves) return null
    const hidden = new Set(settings.homeHiddenShelves ?? [])
    let out = shelves.filter((s) => !hidden.has(shelfId(s.title)))

    const orderIds = settings.homeShelvesOrder ?? []
    if (orderIds.length > 0) {
      const positionById = new Map(orderIds.map((id, i) => [id, i] as const))
      const known: { shelf: Shelf; pos: number }[] = []
      const rest: Shelf[] = []
      for (const s of out) {
        const p = positionById.get(shelfId(s.title))
        if (p !== undefined) known.push({ shelf: s, pos: p })
        else rest.push(s)
      }
      known.sort((a, b) => a.pos - b.pos)
      out = [...known.map((k) => k.shelf), ...rest]
    }

    if (settings.homeShuffleShelves) {
      // Fisher-Yates
      const arr = [...out]
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      out = arr
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelves, settings.homeHiddenShelves, settings.homeShelvesOrder, settings.homeShuffleShelves])

  const playCard = (card: MediaCard): void => {
    if (card.kind === 'song' || card.kind === 'video') {
      void playTracks([cardToTrack(card)])
    } else if (card.kind === 'playlist') {
      void window.api.music.playlist(card.id).then((pl) => {
        if (pl.tracks.length) void playTracks(pl.tracks)
      })
    } else if (card.kind === 'album') {
      void window.api.music.album(card.id).then((al) => {
        if (al.tracks.length) void playTracks(al.tracks)
      })
    }
  }

  return (
    <div className="page">
      <h1>{t(greetingKey())}</h1>
      {/* F32: fila de chips de selecciones rápidas — antes del HomeHero */}
      <HomeQuickPicks shelves={displayedShelves} />
      {/* F24: tarjetas grandes SIEMPRE visibles, incluso mientras carga el resto */}
      <HomeHero />
      {/* F31: tarjetas Recap + accesos rápidos al top semanal/mensual */}
      <HomeRecap />
      {error && <div className="error-banner">{t('home.error', { msg: error })}</div>}
      {!displayedShelves && !error && (
        <div className="card-grid">
          {[...Array(7)].map((_, i) => (
            <div key={i}>
              <div className="skeleton" style={{ aspectRatio: '1', marginBottom: 10 }} />
              <div className="skeleton" style={{ height: 14, width: '75%', marginBottom: 6 }} />
              <div className="skeleton" style={{ height: 12, width: '50%' }} />
            </div>
          ))}
        </div>
      )}
      {displayedShelves?.map((shelf, i) => (
        <ShelfRow key={`${shelfId(shelf.title)}-${i}`} shelf={shelf} onPlayItem={playCard} />
      ))}
      {displayedShelves && !displayedShelves.length && (
        <div className="empty-state">{t('home.empty')}</div>
      )}
    </div>
  )
}
