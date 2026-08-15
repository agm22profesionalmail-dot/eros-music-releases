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

/** Clave localStorage para recordar los chips activos por playlist. */
function activeGenreKey(id: string): string {
  return `ml.genres.lastActive.${id}`
}

/**
 * F22b · Lee del localStorage la selección persistida de géneros. Acepta
 * tanto el formato nuevo (array JSON de F22b) como el formato legado de F23
 * (string suelto con un único género), y devuelve siempre un `Set`.
 */
function readPersistedGenres(id: string): Set<string> {
  try {
    const saved = localStorage.getItem(activeGenreKey(id))
    if (!saved) return new Set()
    if (saved.startsWith('[')) {
      const arr = JSON.parse(saved) as unknown
      if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === 'string'))
      return new Set()
    }
    // Legado F23: un único género como string suelto.
    return new Set([saved])
  } catch {
    return new Set()
  }
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
  // F22b · Multi-selección de chips de género. Vacío = mostrar TODAS.
  // Un `Set` permite alternar chips sin gestionar índices y compone bien
  // con los helpers de React (`new Set(prev)` al actualizar).
  const [activeGenres, setActiveGenres] = useState<Set<string>>(new Set())
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
    // F22b · Recupera la selección de chips (Set) persistida para esta
    // playlist. Convierte formato legado F23 (string) a Set automáticamente.
    setActiveGenres(readPersistedGenres(id))
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

  // F22b · Persiste el Set completo de géneros activos por playlist. Vacío
  // = borramos la clave para evitar dejar `[]` residual entre sesiones.
  useEffect(() => {
    if (!isLiked) return
    try {
      if (activeGenres.size === 0) localStorage.removeItem(activeGenreKey(id))
      else localStorage.setItem(activeGenreKey(id), JSON.stringify(Array.from(activeGenres)))
    } catch {
      /* localStorage sin permisos: silencio */
    }
  }, [activeGenres, id, isLiked])

  const isThisPlaying = isPlaying && pl?.tracks.some((t) => t.videoId === current?.videoId)
  const tint = useArtworkColor(pl?.thumbnailUrl)

  // Chips a pintar: solo los géneros que tienen ≥1 canción en la lista.
  // Los géneros activos que ya no existen (playlist cambió) se descartan.
  const availableGenres = isLiked ? genres?.availableGenres ?? [] : []
  // F22b · Set efectivo: intersección de lo persistido con lo disponible.
  // El `.join('|')` en la dep list evita rehacerlo si la lista de géneros
  // disponibles no cambió realmente aunque sí la referencia.
  const effectiveGenres = useMemo(() => {
    if (!isLiked) return new Set<string>()
    const set = new Set<string>()
    for (const g of activeGenres) {
      if (availableGenres.includes(g)) set.add(g)
    }
    return set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLiked, activeGenres, availableGenres.join('|')])

  // Lista efectiva que se pinta y que se usa para reproducir al hacer click
  // en una fila (cola = lo que ves). F22b: filtro de género en OR lógico
  // (una canción pasa si tiene AL MENOS UNO de los géneros seleccionados).
  // F21: combina con el filtro de texto en AND.
  const filteredTracks = useMemo(() => {
    if (!pl) return []
    let list = pl.tracks
    if (isLiked && effectiveGenres.size > 0 && genres) {
      list = list.filter((t) => {
        const gs = genres.tracksToGenres[t.videoId]
        if (!gs || gs.length === 0) return false
        for (const g of gs) if (effectiveGenres.has(g)) return true
        return false
      })
    }
    if (debounced) list = list.filter((t) => matchesTrack(t, debounced))
    return list
  }, [pl, debounced, isLiked, effectiveGenres, genres])

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

  // F22b · Crea una playlist con el subconjunto filtrado por los géneros
  // activos. El nombre concatena los géneros con ` + ` — ej. "Me gusta ·
  // Rock + Pop + Chill".
  const createGenrePlaylist = async (): Promise<void> => {
    if (effectiveGenres.size === 0) return
    const videoIds = filteredTracks.map((t) => t.videoId)
    if (!videoIds.length) return
    const label = Array.from(effectiveGenres).join(' + ')
    try {
      await window.api.library.playlistCreate(`Me gusta · ${label}`, videoIds)
      pushToast('Playlist creada')
      void refreshLibrary()
    } catch {
      pushToast('No se pudo crear la playlist')
    }
  }

  // F22b · Alterna un chip en el Set. "Todos" (null) vacía la selección;
  // los demás se añaden o quitan del Set (multi-select).
  const toggleGenreChip = (g: string | null): void => {
    if (g === null) {
      setActiveGenres(new Set())
      return
    }
    setActiveGenres((prev) => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      return next
    })
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
        {/* F23/F22b · fila de chips de género + botón "Crear playlist con
            [Géneros]". F22b abre la selección a varios chips a la vez (OR
            lógico). Solo se pinta en "Canciones que me gustan" y solo
            cuando ya hay resolución (o un skeleton mientras se carga). */}
        {isLiked && pl.tracks.length > 0 && (
          <div className="genre-bar" aria-label="Filtro por género">
            {genresLoading && !genres ? (
              <span className="chip is-loading" aria-busy="true">
                Cargando géneros…
              </span>
            ) : (
              <>
                <button
                  className={`chip ${effectiveGenres.size === 0 ? 'active-accent' : ''}`}
                  onClick={() => toggleGenreChip(null)}
                  aria-pressed={effectiveGenres.size === 0}
                >
                  Todos
                </button>
                {availableGenres.map((g) => (
                  <button
                    key={g}
                    className={`chip ${effectiveGenres.has(g) ? 'active-accent' : ''}`}
                    onClick={() => toggleGenreChip(g)}
                    aria-pressed={effectiveGenres.has(g)}
                  >
                    {g}
                  </button>
                ))}
                {effectiveGenres.size > 0 && filteredTracks.length > 0 && (
                  <button
                    className="btn btn-secondary genre-create-btn"
                    onClick={() => void createGenrePlaylist()}
                    title={`Crear una playlist nueva con las ${filteredTracks.length} canciones seleccionadas`}
                  >
                    Crear playlist con {Array.from(effectiveGenres).join(' + ')}
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
          effectiveGenres.size > 0 &&
          pl.tracks.length > 0 &&
          filteredTracks.length === 0 && (
            <div className="empty-state">
              Ninguna canción encaja en «{Array.from(effectiveGenres).join(' + ')}»
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
