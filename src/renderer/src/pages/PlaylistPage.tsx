import { useEffect, useMemo, useState } from 'react'
import type { GenreResolveResult, PlaylistDetail } from '@shared/types'
import { TrackTable } from '../components/TrackTable'
import { ListSearchInput } from '../components/ListSearchInput'
import { usePlayer } from '../player/store'
import { openContextMenu } from '../components/ContextMenu'
import { trackMenu, useLibrary } from '../app/libraryStore'
import { useArtworkColor } from '../app/artworkColor'
import { matchesTrack, useDebouncedValue } from '../app/listFilter'
import { MusicNoteIcon, PauseIcon, PlayIcon } from '../components/Icons'
import { TrackPickerModal } from '../components/TrackPickerModal'
import { PlaylistEditModal } from '../components/PlaylistEditModal'
import { pushToast } from '../components/Toast'

/** Género especial que indica "todas": chip siempre visible como reset. */
const ALL_GENRES = '__all__'
/** Timeout global del resolvedor de géneros — devuelve lo que haya llegado. */
const GENRE_RESOLVE_TIMEOUT_MS = 8_000

/**
 * ¿Es la playlist "Canciones que me gustan"? El id llega como `LM` (rating)
 * o `VLLM` (browse). En ambos casos empieza por `LM` o `VLLM`.
 * F23 solo pinta los chips de género en esta lista.
 */
function isLikedMusic(id: string): boolean {
  if (!id) return false
  return id.startsWith('LM') || id.startsWith('VLLM')
}

/** Clave localStorage para recordar el último chip por playlist. */
function activeGenreKey(id: string): string {
  return `ml.genres.lastActive.${id}`
}

export function PlaylistPage({ id }: { id: string }): React.JSX.Element {
  const [pl, setPl] = useState<PlaylistDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  // F21: filtro local (no persistente) con debounce de 150 ms.
  const [filter, setFilter] = useState('')
  const debounced = useDebouncedValue(filter, 150)
  // F22: modales de acción (añadir canciones / editar).
  const [showPicker, setShowPicker] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  // F23: género activo (chip). `ALL_GENRES` = sin filtro.
  const [activeGenre, setActiveGenre] = useState<string>(ALL_GENRES)
  // F23: mapa de géneros resueltos y estado de carga.
  const [genres, setGenres] = useState<GenreResolveResult | null>(null)
  const [genresLoading, setGenresLoading] = useState(false)
  const playTracks = usePlayer((s) => s.playTracks)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const togglePlay = usePlayer((s) => s.togglePlay)
  const current = usePlayer((s) => s.current())
  const refreshLibrary = useLibrary((s) => s.refresh)

  const isLiked = isLikedMusic(id)

  // Recarga la playlist actual (tras editar/añadir) sin salir de la vista.
  const reload = async (): Promise<void> => {
    try {
      const data = await window.api.music.playlist(id)
      setPl(data)
    } catch (err) {
      setError(String((err as Error)?.message ?? err))
    }
  }

  useEffect(() => {
    let cancelled = false
    setPl(null)
    setError(null)
    setFilter('') // limpia el filtro al cambiar de playlist
    setGenres(null)
    setGenresLoading(false)
    // Recupera el último chip usado para esta playlist (F23).
    try {
      const saved = localStorage.getItem(activeGenreKey(id))
      setActiveGenre(saved && saved.length ? saved : ALL_GENRES)
    } catch {
      setActiveGenre(ALL_GENRES)
    }
    void window.api.music
      .playlist(id)
      .then((data) => {
        if (!cancelled) setPl(data)
      })
      .catch((err) => {
        if (!cancelled) setError(String(err?.message ?? err))
      })
    return () => {
      cancelled = true
    }
  }, [id])

  // F23: al cargar las pistas de "Canciones que me gustan", resuelve géneros.
  // Timeout global de 8 s: si tarda más, mostramos lo que se haya podido
  // resolver (el backend responde con lo cacheado + lo que dio tiempo a
  // consultar; aquí el timeout es solo por si el IPC entero se cuelga).
  useEffect(() => {
    if (!isLiked || !pl?.tracks?.length) return
    let cancelled = false
    setGenresLoading(true)
    const tid = setTimeout(() => {
      if (!cancelled) setGenresLoading(false)
    }, GENRE_RESOLVE_TIMEOUT_MS)
    window.api.genre
      .resolve(pl.tracks)
      .then((res) => {
        if (cancelled) return
        setGenres(res)
        setGenresLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setGenres({ tracksToGenres: {}, availableGenres: [] })
        setGenresLoading(false)
      })
      .finally(() => clearTimeout(tid))
    return () => {
      cancelled = true
      clearTimeout(tid)
    }
  }, [isLiked, pl])

  // Persiste el chip elegido por playlist.
  useEffect(() => {
    if (!isLiked) return
    try {
      if (activeGenre === ALL_GENRES) localStorage.removeItem(activeGenreKey(id))
      else localStorage.setItem(activeGenreKey(id), activeGenre)
    } catch {
      /* localStorage sin permisos: silencio */
    }
  }, [activeGenre, id, isLiked])

  const isThisPlaying = isPlaying && pl?.tracks.some((t) => t.videoId === current?.videoId)
  const tint = useArtworkColor(pl?.thumbnailUrl)

  // Chips a pintar: solo los géneros que tienen ≥1 canción en la lista.
  // Si el género activo desaparece (p. ej. la playlist cambió), cae a ALL.
  const availableGenres = isLiked ? genres?.availableGenres ?? [] : []
  const effectiveGenre =
    activeGenre === ALL_GENRES || availableGenres.includes(activeGenre)
      ? activeGenre
      : ALL_GENRES

  // Lista efectiva que se pinta y que se usa para reproducir al hacer
  // click en una fila (cola = lo que ves). F23: primero filtra por género,
  // luego por texto.
  const filteredTracks = useMemo(() => {
    if (!pl) return []
    let list = pl.tracks
    if (isLiked && effectiveGenre !== ALL_GENRES && genres) {
      list = list.filter((t) => genres.tracksToGenres[t.videoId]?.includes(effectiveGenre))
    }
    if (debounced) list = list.filter((t) => matchesTrack(t, debounced))
    return list
  }, [pl, debounced, isLiked, effectiveGenre, genres])

  if (error) {
    return (
      <div className="page">
        <div className="error-banner">No se pudo cargar la playlist: {error}</div>
      </div>
    )
  }

  if (!pl) {
    return (
      <div className="detail-header">
        <div className="skeleton" style={{ width: 224, height: 224 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 14, width: 80, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 48, width: '60%', marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 14, width: 200 }} />
        </div>
      </div>
    )
  }

  // F22: ¿editable? Heurística permisiva. El backend a veces no marca
  // `isEditable=true` aunque la playlist sea del usuario (el parser de
  // youtubei.js no siempre reconoce el header editable), así que si el prefijo
  // es PL sin ser LM/OLAK, damos por editable y dejamos que el backend
  // devuelva error si de verdad no lo es (mostramos toast entonces).
  const rawId = id.startsWith('VL') ? id.slice(2) : id
  const canEditByPrefix =
    rawId.startsWith('PL') && !rawId.startsWith('PLLM') && !rawId.startsWith('OLAK')
  const isEditable = pl.isEditable === true || canEditByPrefix
  const canAdd = isEditable // añadir requiere ser dueño

  const shareUrl = `https://music.youtube.com/playlist?list=${rawId}`
  const share = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      pushToast('Enlace copiado')
    } catch {
      pushToast('No se pudo copiar el enlace')
    }
  }

  // F23: crea una playlist con el subconjunto filtrado por género.
  const createGenrePlaylist = async (): Promise<void> => {
    if (effectiveGenre === ALL_GENRES) return
    const videoIds = filteredTracks.map((t) => t.videoId)
    if (!videoIds.length) return
    try {
      await window.api.library.playlistCreate(`Me gusta · ${effectiveGenre}`, videoIds)
      pushToast('Playlist creada')
      void refreshLibrary()
    } catch {
      pushToast('No se pudo crear la playlist')
    }
  }

  return (
    <>
      <div
        className="detail-header"
        style={tint ? { ['--header-tint' as string]: `linear-gradient(${tint}, ${tint}55)` } : undefined}
      >
        {pl.thumbnailUrl ? (
          <img className="cover" src={pl.thumbnailUrl} alt="" />
        ) : (
          <div className="cover" style={{ display: 'grid', placeItems: 'center' }}>
            <MusicNoteIcon size={64} />
          </div>
        )}
        <div className="info">
          <div className="kind">Playlist</div>
          <h1 className="name">{pl.title}</h1>
          <div className="meta">
            {/* El backend ya suele meter «X canciones» dentro de author/durationText;
               evitamos duplicados quedándonos solo con el más informativo. */}
            {pl.author && <b>{pl.author}</b>}
            {(() => {
              const hasCountInAuthor = pl.author?.toLowerCase().includes('canci')
              const hasCountInDur = pl.durationText?.toLowerCase().includes('canci')
              // trackCount solo si nadie más lo lleva
              const showCount = pl.trackCount != null && !hasCountInAuthor && !hasCountInDur
              return (
                <>
                  {showCount && (
                    <>
                      <span>·</span>
                      <span>{pl.trackCount} canciones</span>
                    </>
                  )}
                  {pl.durationText && !hasCountInAuthor && (
                    <>
                      <span>·</span>
                      <span>{pl.durationText}</span>
                    </>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      </div>
      <div className="detail-body">
        {/* F21: la fila de acciones incluye ahora el buscador anclado a la
            derecha con `margin-left: auto`. F22 mete sus tres botones
            circulares (+ / ↗ / ✎) justo tras el big-play y el buscador
            se queda a la derecha por el margin-left auto. */}
        <div className="detail-actions">
          <button
            className={`big-play ${isThisPlaying ? 'is-playing' : ''}`}
            aria-label="Reproducir playlist"
            onClick={() => {
              if (isThisPlaying) togglePlay()
              else if (pl.tracks.length) void playTracks(pl.tracks)
            }}
          >
            {isThisPlaying ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
          </button>
          {/* F22 · Añadir canciones (solo playlists propias) */}
          <button
            className="action-circle"
            aria-label="Añadir canciones a la playlist"
            title="Añadir canciones"
            disabled={!canAdd}
            onClick={() => setShowPicker(true)}
          >
            +
          </button>
          {/* F22 · Compartir enlace de la playlist */}
          <button
            className="action-circle"
            aria-label="Compartir enlace de la playlist"
            title="Compartir"
            onClick={() => void share()}
          >
            ↗
          </button>
          {/* F22 · Editar título y carátula (solo playlists propias) */}
          {isEditable && (
            <button
              className="action-circle"
              aria-label="Editar título y carátula"
              title="Editar"
              onClick={() => setShowEdit(true)}
            >
              ✎
            </button>
          )}
          {pl.tracks.length > 0 && (
            <ListSearchInput
              value={filter}
              onChange={setFilter}
              ariaLabel="Buscar en la playlist"
            />
          )}
        </div>
        {/* F23: fila de chips de género + botón "Crear playlist con [Género]".
            Solo se pinta en "Canciones que me gustan" y solo cuando ya hay
            resolución (o un skeleton mientras se carga). */}
        {isLiked && pl.tracks.length > 0 && (
          <div className="genre-bar" aria-label="Filtro por género">
            {genresLoading && !genres ? (
              <span className="chip is-loading" aria-busy="true">
                Cargando géneros…
              </span>
            ) : (
              <>
                <button
                  className={`chip ${effectiveGenre === ALL_GENRES ? 'active-accent' : ''}`}
                  onClick={() => setActiveGenre(ALL_GENRES)}
                  aria-pressed={effectiveGenre === ALL_GENRES}
                >
                  Todos
                </button>
                {availableGenres.map((g) => (
                  <button
                    key={g}
                    className={`chip ${effectiveGenre === g ? 'active-accent' : ''}`}
                    onClick={() => setActiveGenre(g)}
                    aria-pressed={effectiveGenre === g}
                  >
                    {g}
                  </button>
                ))}
                {effectiveGenre !== ALL_GENRES && filteredTracks.length > 0 && (
                  <button
                    className="btn btn-secondary genre-create-btn"
                    onClick={() => void createGenrePlaylist()}
                    title={`Crear una playlist nueva con las ${filteredTracks.length} canciones de ${effectiveGenre}`}
                  >
                    Crear playlist con {effectiveGenre}
                  </button>
                )}
              </>
            )}
          </div>
        )}
        <TrackTable
          tracks={filteredTracks}
          showAlbum
          onPlayIndex={(i) => void playTracks(filteredTracks, i)}
          onContextMenu={(e, t) => openContextMenu(e, trackMenu(t, { playlistId: id }))}
        />
        {!pl.tracks.length && <div className="empty-state">Esta playlist está vacía</div>}
        {debounced && pl.tracks.length > 0 && filteredTracks.length === 0 && (
          <div className="empty-state">Sin resultados para «{filter}»</div>
        )}
        {isLiked &&
          !debounced &&
          effectiveGenre !== ALL_GENRES &&
          pl.tracks.length > 0 &&
          filteredTracks.length === 0 && (
            <div className="empty-state">
              Ninguna canción encaja en «{effectiveGenre}»
            </div>
          )}
      </div>

      {showPicker && (
        <TrackPickerModal
          playlistId={id}
          playlistTitle={pl.title}
          onClose={(added) => {
            setShowPicker(false)
            if (added > 0) {
              pushToast(added === 1 ? '1 canción añadida' : `${added} canciones añadidas`)
              void reload()
              void refreshLibrary()
            }
          }}
        />
      )}

      {showEdit && isEditable && (
        <PlaylistEditModal
          playlistId={id}
          currentTitle={pl.title}
          currentThumbnailUrl={pl.thumbnailUrl}
          onClose={(saved) => {
            setShowEdit(false)
            if (saved) {
              pushToast('Playlist actualizada')
              void reload()
              void refreshLibrary()
            }
          }}
        />
      )}
    </>
  )
}
