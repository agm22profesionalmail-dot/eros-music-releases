import { useEffect, useState } from 'react'
import type { MediaCard, Shelf, TrackSummary } from '@shared/types'
import { ShelfRow } from '../components/Shelf'
import { usePlayer } from '../player/store'
import { useAuth } from '../app/authStore'
import { useRouter } from '../app/router'
import { pushToast } from '../components/Toast'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 7) return 'Buenas noches'
  if (h < 14) return 'Buenos días'
  if (h < 21) return 'Buenas tardes'
  return 'Buenas noches'
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
        pushToast('Añade algunos artistas favoritos primero')
        navigate({ name: 'profile' })
        return
      }
      pushToast(s.reason)
      await playTracks([s.track])
    } catch {
      pushToast('No pude generar la sorpresa ahora')
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
        pushToast('Añade artistas favoritos o dale a "me gusta" a más canciones')
        return
      }
      pushToast(`Mix Personal: ${tracks.length} canciones`)
      await playTracks(tracks)
    } catch {
      pushToast('No pude generar el mix ahora')
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
        aria-label="Sorpréndeme: reproducir una canción inesperada"
      >
        <div className="hero-icon" aria-hidden="true">
          {/* Estrella brillante como icono de "sorpresa" */}
          <svg viewBox="0 0 24 24" width="52" height="52" fill="currentColor">
            <path d="M12 2l2.09 6.26L20.5 9.27l-4.75 4.63L16.88 21 12 17.77 7.12 21l1.13-7.1L3.5 9.27l6.41-1.01L12 2z" />
          </svg>
        </div>
        <div className="hero-body">
          <div className="hero-title">
            {surpriseLoading ? 'Preparando…' : 'Sorpréndeme'}
          </div>
          <div className="hero-sub">Reproduce algo inesperado</div>
        </div>
      </button>

      <button
        type="button"
        className="hero-card hero-card--mix"
        onClick={onMix}
        disabled={mixLoading}
        aria-label="Mix Personal: 25 canciones para ti"
      >
        <div className="hero-icon" aria-hidden="true">
          {/* Auriculares — mix personal */}
          <svg viewBox="0 0 24 24" width="52" height="52" fill="currentColor">
            <path d="M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h3v-8H5v-1a7 7 0 1 1 14 0v1h-3v8h3a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9z" />
          </svg>
        </div>
        <div className="hero-body">
          <div className="hero-title">
            {mixLoading ? 'Preparando…' : 'Mix Personal'}
          </div>
          <div className="hero-sub">25 canciones para ti</div>
        </div>
      </button>
    </div>
  )
}

export function HomePage(): React.JSX.Element {
  const [shelves, setShelves] = useState<Shelf[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const playTracks = usePlayer((s) => s.playTracks)
  const auth = useAuth((s) => s.state)

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
      <h1>{greeting()}</h1>
      {/* F24: tarjetas grandes SIEMPRE visibles, incluso mientras carga el resto */}
      <HomeHero />
      {error && <div className="error-banner">No se pudo cargar Inicio: {error}</div>}
      {!shelves && !error && (
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
      {shelves?.map((shelf, i) => <ShelfRow key={i} shelf={shelf} onPlayItem={playCard} />)}
      {shelves && !shelves.length && (
        <div className="empty-state">
          Inicio está vacío. Inicia sesión para ver tus recomendaciones.
        </div>
      )}
    </div>
  )
}
