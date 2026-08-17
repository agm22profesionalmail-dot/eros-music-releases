import { useEffect, useMemo, useState } from 'react'
import type { MediaCard, Shelf, TrackSummary } from '@shared/types'
import { ShelfRow } from '../components/Shelf'
import { HomeQuickPicks } from '../components/HomeQuickPicks'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { shelfId } from '@shared/homeShelfCategorize'
import { usePlayer } from '../player/store'
import { useRouter } from '../app/router'
import { pushToast } from '../components/Toast'
import { useSettings } from '../app/settingsStore'
import { useT } from '../app/i18n'
import { HomeSpiral } from '../components/HomeSpiral'
import { useHome } from '../app/homeStore'

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
 * F24 · Tres tarjetas iguales arriba: "Sorpréndeme", "Mix Personal" y
 * "Lo más escuchado". Se pintan al instante para que la Home nunca
 * aparezca en blanco. El estado por tarjeta evita doble click accidental.
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
          <svg viewBox="0 0 24 24" width="52" height="52" fill="currentColor">
            <path d="M10.5 5.5c.5 3.9 3.5 6.9 7.4 7.4-3.9.5-6.9 3.5-7.4 7.4-.5-3.9-3.5-6.9-7.4-7.4 3.9-.5 6.9-3.5 7.4-7.4z" />
            <path
              opacity=".8"
              d="M18.5 2c.25 1.9 1.75 3.4 3.65 3.65-1.9.25-3.4 1.75-3.65 3.65-.25-1.9-1.75-3.4-3.65-3.65 1.9-.25 3.4-1.75 3.65-3.65z"
            />
            <circle cx="18.8" cy="13.5" r="1.1" opacity=".55" />
            <circle cx="5" cy="3.8" r="1" opacity=".45" />
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
          <svg viewBox="0 0 24 24" width="52" height="52" fill="currentColor">
            <path
              opacity=".95"
              d="M12 2.5A8.5 8.5 0 0 0 3.5 11v2h2v-2a6.5 6.5 0 0 1 13 0v2h2v-2A8.5 8.5 0 0 0 12 2.5z"
            />
            <rect x="3" y="12.5" width="4.2" height="8" rx="2" />
            <rect x="16.8" y="12.5" width="4.2" height="8" rx="2" />
            <path
              opacity=".85"
              d="M15.6 11.9l-3.4 1v4.9a2.1 2.1 0 1 0 1.2 1.9v-4.6l2.2-.65v-2.55z"
            />
          </svg>
        </div>
        <div className="hero-body">
          <div className="hero-title">
            {mixLoading ? t('home.hero.preparing') : t('home.hero.mix')}
          </div>
          <div className="hero-sub">{t('home.hero.mixSub')}</div>
        </div>
      </button>

      <button
        type="button"
        className="hero-card hero-card--hot"
        onClick={() => navigate({ name: 'recap' })}
        aria-label={t('home.hero.hotAria')}
      >
        <div className="hero-icon" aria-hidden="true">
          {/* Llama — lo más escuchado */}
          <svg viewBox="0 0 24 24" width="52" height="52" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M13.2 2c3.4 2.8 5.8 6.5 5.8 10.2a7 7 0 0 1-14 0c0-2.3 1-4.5 2.4-6.1.3 1.3 1 2.4 2 3.2C9 6.7 10.1 3.8 13.2 2zM12 11.2c1.7 1.3 3 2.8 3 4.6a3 3 0 0 1-6 0c0-1.8 1.3-3.3 3-4.6z"
            />
            <circle cx="20.7" cy="4.6" r="1.2" opacity=".65" />
            <circle cx="3.6" cy="8.8" r="1" opacity=".45" />
          </svg>
        </div>
        <div className="hero-body">
          <div className="hero-title">{t('home.hero.hot')}</div>
          <div className="hero-sub">{t('home.hero.hotSub')}</div>
        </div>
      </button>
    </div>
  )
}

export function HomePage(): React.JSX.Element {
  const t = useT()
  const shelves = useHome((s) => s.shelves)
  const error = useHome((s) => s.error)
  const fetchIfNeeded = useHome((s) => s.fetchIfNeeded)
  const refresh = useHome((s) => s.refresh)
  const playTracks = usePlayer((s) => s.playTracks)
  const { settings } = useSettings()

  // F88 · Carga inicial: solo la primera vez (luego queda en caché).
  useEffect(() => {
    fetchIfNeeded()
  }, [fetchIfNeeded])

  // F36 · Reactividad: crear/borrar playlists refresca la Home.
  useEffect(() => {
    const off = window.api.library.onChanged(({ reason }) => {
      if (!reason.startsWith('playlist') && reason !== 'subscribe') return
      refresh()
    })
    return off
  }, [refresh])

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
      {/* F24: tarjetas SIEMPRE visibles, incluso mientras carga el resto */}
      <HomeHero />
      {error && <div className="error-banner">{t('home.error', { msg: error })}</div>}
      {/* Spinner + skeleton de estanterías mientras carga. El spinner indica
          actividad y los placeholders grises dan la sensación de que el
          contenido ya existe. */}
      {!displayedShelves && !error && (
        <div className="home-skeleton">
          <div className="home-skeleton-spinner">
            <LoadingSpinner size={48} label={t('home.loadingLibrary')} />
          </div>
          {Array.from({ length: 3 }, (_, shelfIdx) => (
            <section className="shelf" key={`skel-shelf-${shelfIdx}`}>
              <div className="shelf-header">
                <div className="skel-shelf-title" />
              </div>
              <div className="card-grid">
                {Array.from({ length: 5 }, (__, cardIdx) => (
                  <div className="skel-card" key={`skel-card-${shelfIdx}-${cardIdx}`} style={{ '--i': cardIdx } as React.CSSProperties}>
                    <div className="skel-card-art">
                      <div className="skel-shimmer" />
                    </div>
                    <div className="skel-card-line" style={{ width: '80%' }} />
                    <div className="skel-card-line skel-card-line--short" />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {displayedShelves?.map((shelf, i) => (
        <ShelfRow key={`${shelfId(shelf.title)}-${i}`} shelf={shelf} onPlayItem={playCard} />
      ))}
      {displayedShelves && !displayedShelves.length && (
        <div className="empty-state">{t('home.empty')}</div>
      )}
      {/* F80 · Espiral Musical — siempre al final, siempre activa */}
      <HomeSpiral />
    </div>
  )
}
