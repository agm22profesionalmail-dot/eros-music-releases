import { useEffect, useState } from 'react'
import type { ArtistDetail, MediaCard } from '@shared/types'
import { ShelfRow } from '../components/Shelf'
import { usePlayer } from '../player/store'
import { useSettings } from '../app/settingsStore'
import { useLibrary } from '../app/libraryStore'
import { pushToast } from '../components/Toast'
import { cardToTrack } from './HomePage'
import { useT } from '../app/i18n'
import { PersonIcon, PlayIcon } from '../components/Icons'

/**
 * F43 · agente E — algunos backends devuelven literal "N/A" cuando la API de
 * YouTube Music no expone la cifra. Filtramos esos placeholders para no
 * imprimir "N/A" en la ficha del artista.
 */
function hasMeaningfulValue(value: string | undefined | null): value is string {
  if (!value) return false
  const trimmed = value.trim()
  if (!trimmed) return false
  return trimmed.toUpperCase() !== 'N/A'
}

export function ArtistPage({ id }: { id: string }): React.JSX.Element {
  const t = useT()
  const [artist, setArtist] = useState<ArtistDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [subscribing, setSubscribing] = useState(false)
  // F43 · agente E (fix doble clic) — la API de YT Music tiene consistencia
  // eventual: justo tras suscribirse, `refreshLibrary()` puede devolver un
  // snapshot que TODAVÍA no incluye al artista, así que el botón "rebota" a
  // "no sigues" tras el primer clic y hace falta un segundo para que cuadre.
  // Guardamos aquí el resultado optimista del último toggle y lo priorizamos
  // sobre el snapshot del store hasta que éste confirme el mismo valor.
  const [pendingFollow, setPendingFollow] = useState<boolean | null>(null)
  const playTracks = usePlayer((s) => s.playTracks)
  // F28 · toggles de visibilidad de descripción / suscriptores / oyentes
  const showDescription = useSettings((s) => s.settings.showArtistDescription)
  const showSubscribers = useSettings((s) => s.settings.showArtistSubscribers)
  const showMonthly = useSettings((s) => s.settings.showArtistMonthlyListeners)
  // F43 · agente E — biblioteca en vivo para deducir el estado "sigues/no".
  const library = useLibrary((s) => s.library)
  const refreshLibrary = useLibrary((s) => s.refresh)

  useEffect(() => {
    let cancelled = false
    setArtist(null)
    setError(null)
    void window.api.music
      .artist(id)
      .then((data) => {
        if (!cancelled) setArtist(data)
      })
      .catch((err) => {
        if (!cancelled) setError(String(err?.message ?? err))
      })
    return () => {
      cancelled = true
    }
  }, [id])

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

  const playTop = (): void => {
    // Reproduce la primera estantería de canciones del artista
    const songsShelf = artist?.shelves.find((s) => s.items.some((i) => i.kind === 'song'))
    if (!songsShelf) return
    const tracks = songsShelf.items.filter((i) => i.kind === 'song').map(cardToTrack)
    if (tracks.length) void playTracks(tracks)
  }

  // F43 · agente E — ¿el usuario ya sigue a este artista?
  // Preferimos la señal viva del snapshot de la biblioteca (funciona incluso
  // cuando `ArtistDetail.isSubscribed` viene undefined) y caemos a la señal
  // del propio detalle si el snapshot aún no ha cargado.
  const libraryFollowing = library
    ? library.artists.some((a) => a.id === id)
    : artist?.isSubscribed === true
  const isFollowing = pendingFollow !== null ? pendingFollow : libraryFollowing

  // Una vez el snapshot del store confirma el valor optimista, dejamos de
  // sustituirlo para que futuros toggles partan siempre del estado real.
  useEffect(() => {
    if (pendingFollow !== null && libraryFollowing === pendingFollow) {
      setPendingFollow(null)
    }
  }, [libraryFollowing, pendingFollow])

  const toggleFollow = async (): Promise<void> => {
    if (subscribing) return
    setSubscribing(true)
    const next = !isFollowing
    setPendingFollow(next)
    try {
      await window.api.library.subscribe(id, next)
      pushToast(next ? t('toast.nowFollowing') : t('toast.unfollowed'))
      void refreshLibrary()
    } catch {
      setPendingFollow(null)
      pushToast(t('toast.followChangeFailed'))
    } finally {
      setSubscribing(false)
    }
  }

  if (error) {
    return (
      <div className="page">
        <div className="error-banner">{t('artist.loadError', { msg: error })}</div>
      </div>
    )
  }

  if (!artist) {
    return (
      <div className="detail-header artist">
        <div className="skeleton" style={{ width: 224, height: 224, borderRadius: '50%' }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 14, width: 80, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 48, width: '50%' }} />
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="detail-header artist">
        {artist.thumbnailUrl ? (
          <img className="cover" src={artist.thumbnailUrl} alt="" />
        ) : (
          <div
            className="cover"
            style={{ display: 'grid', placeItems: 'center', borderRadius: '50%' }}
          >
            <PersonIcon size={64} />
          </div>
        )}
        <div className="info">
          <div className="kind">{t('media.artist')}</div>
          <h1 className="name">{artist.name}</h1>
          {/* F43 · agente E — descripción bajo el nombre, con line-clamp:3.
              Solo se muestra si hay texto real y el ajuste está activo. */}
          {showDescription && artist.description && (
            <p
              className="artist-header-description"
              data-testid="artist-description"
            >
              {artist.description}
            </p>
          )}
          {/* F43 · agente E — línea única "X suscriptores · Y oyentes mensuales":
              antes eran dos líneas separadas y podía imprimirse "N/A" plano. */}
          {(() => {
            const subs = showSubscribers && hasMeaningfulValue(artist.subscribers)
              ? artist.subscribers
              : null
            const monthly = showMonthly && hasMeaningfulValue(artist.monthlyListeners)
              ? artist.monthlyListeners
              : null
            if (!subs && !monthly) return null
            return (
              <div className="meta" data-testid="artist-stats">
                {subs && <span data-testid="artist-subscribers">{subs}</span>}
                {subs && monthly && <span>·</span>}
                {monthly && (
                  <span data-testid="artist-monthly-listeners">{monthly}</span>
                )}
              </div>
            )
          })()}
        </div>
      </div>
      <div className="detail-body">
        {/* F43 · agente E — Play grande + botón Seguir/Dejar de seguir. */}
        <div className="detail-actions">
          <button className="big-play" aria-label={t('artist.playAria')} onClick={playTop}>
            <PlayIcon size={22} />
          </button>
          <button
            className={`btn btn-secondary artist-follow-btn ${isFollowing ? 'is-following' : ''}`}
            aria-pressed={isFollowing}
            disabled={subscribing}
            onClick={() => void toggleFollow()}
          >
            {isFollowing ? t('menu.unfollow') : t('menu.follow')}
          </button>
        </div>
        <div className="page" style={{ padding: 0 }}>
          {artist.shelves.map((shelf, i) => (
            <ShelfRow key={i} shelf={shelf} onPlayItem={playCard} limit={6} />
          ))}
        </div>
      </div>
    </>
  )
}
