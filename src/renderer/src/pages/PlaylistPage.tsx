import { useEffect, useMemo, useState } from 'react'
import type { GenreResolveResult, PlaylistDetail } from '@shared/types'
import { TrackTable } from '../components/TrackTable'
import { ListSearchInput } from '../components/ListSearchInput'
import { usePlayer } from '../player/store'
import { openContextMenu } from '../components/ContextMenu'
import { cardMenu, trackMenu, useLibrary } from '../app/libraryStore'
import { useArtworkColor } from '../app/artworkColor'
import { matchesTrack, useDebouncedValue } from '../app/listFilter'
import {
  EditIcon,
  HeartIcon,
  MoreVerticalIcon,
  MusicNoteIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  ShareIcon,
  ShuffleIcon
} from '../components/Icons'
import { TrackPickerModal } from '../components/TrackPickerModal'
import { PlaylistEditModal } from '../components/PlaylistEditModal'
import { pushToast } from '../components/Toast'
import { useT } from '../app/i18n'

/* F43 · agente E — normaliza el id (strip VL) para comparar con library.playlists. */
function normalizePlaylistId(id: string): string {
  return id.startsWith('VL') ? id.slice(2) : id
}

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
  const t = useT()
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
  // F43 · agente E — snapshot de biblioteca para saber si la playlist está
  // guardada. Nos suscribimos al store para que el heart reaccione en vivo.
  const library = useLibrary((s) => s.library)

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

  // F36 · Reactividad: si la biblioteca cambia por una escritura de playlist
  // (añadir/quitar canción, renombrar…) hecha desde cualquier punto de la app,
  // esta vista se recarga sola sin salir de ella.
  useEffect(() => {
    const off = window.api.library.onChanged(({ reason }) => {
      if (reason.startsWith('playlist')) void reload()
    })
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <div className="error-banner">{t('playlist.loadError', { msg: error })}</div>
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
      pushToast(t('toast.linkCopied'))
    } catch {
      pushToast(t('toast.linkCopyFailed'))
    }
  }

  // F43 · agente E — ¿está esta playlist (ajena) guardada ya en la biblioteca?
  // Sólo la mostramos cuando NO es propia y sí figura en `library.playlists`;
  // el borrado usa `playlistDelete` que en ajenas equivale a "quitar de la
  // biblioteca" (outcome === 'removedFromLibrary'). No hay API para guardar
  // desde el renderer, así que evitamos el estado "vacío → guardar".
  const nid = normalizePlaylistId(id)
  const isSavedFromLibrary = !!library?.playlists.some(
    (p) => normalizePlaylistId(p.id) === nid
  )
  const showRemoveFromLibrary = !isEditable && isSavedFromLibrary

  const removeFromLibrary = async (): Promise<void> => {
    try {
      await window.api.library.playlistDelete(id)
      pushToast(t('playlist.removedFromLibrary'))
      void refreshLibrary()
    } catch {
      pushToast(t('playlist.removeFromLibraryFailed'))
    }
  }

  // F43 · agente E — arranca shuffle. `playTracks` resetea `shuffle=false`,
  // por eso primero cargamos la cola y luego alternamos si aún no está activo.
  const playShuffled = async (): Promise<void> => {
    if (!pl.tracks.length) return
    await playTracks(pl.tracks, 0)
    if (!usePlayer.getState().shuffle) usePlayer.getState().toggleShuffle()
  }

  // F43 · agente E — abre el menú ⋯ reutilizando `cardMenu('playlist')`, que
  // ya filtra editar/renombrar/eliminar en función de si la playlist es propia.
  const openMoreMenu = (e: React.MouseEvent): void => {
    openContextMenu(
      e,
      cardMenu({
        kind: 'playlist',
        id,
        title: pl.title,
        thumbnailUrl: pl.thumbnailUrl
      })
    )
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
      await window.api.library.playlistCreate(t('playlist.genreName', { genres: label }), videoIds)
      pushToast(t('toast.playlistCreated'))
      void refreshLibrary()
    } catch {
      pushToast(t('toast.playlistCreateFailed'))
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
          <div className="kind">{t('media.playlist')}</div>
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
                      <span>{t('media.songCount', { n: pl.trackCount! })}</span>
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
            circulares (+ / compartir / ✎) justo tras el big-play.
            F43 · agente E — añade shuffle (44px), quitar-de-biblioteca (32px,
            sólo en ajenas guardadas) y el menú ⋯ (32px). El botón compartir
            estrena icono SVG en vez del carácter «↗». */}
        <div className="detail-actions">
          <button
            className={`big-play ${isThisPlaying ? 'is-playing' : ''}`}
            aria-label={t('playlist.playAria')}
            onClick={() => {
              if (isThisPlaying) togglePlay()
              else if (pl.tracks.length) void playTracks(pl.tracks)
            }}
          >
            {isThisPlaying ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
          </button>
          {/* F43 · agente E — Shuffle: reproduce la playlist en orden aleatorio */}
          {pl.tracks.length > 0 && (
            <button
              className="action-mini"
              aria-label={t('common.shufflePlay')}
              title={t('common.shufflePlay')}
              onClick={() => void playShuffled()}
            >
              <ShuffleIcon size={20} />
            </button>
          )}
          {/* F22 · Añadir canciones (solo playlists propias) */}
          {isEditable && (
            <button
              className="action-mini"
              aria-label={t('playlist.addSongsAria')}
              title={t('playlist.addSongs')}
              disabled={!canAdd}
              onClick={() => setShowPicker(true)}
            >
              {/* F44 · SVG en vez de "+" de texto para uniformidad con los demás iconos */}
              <PlusIcon size={20} />
            </button>
          )}
          {/* F43 · agente E — Quitar de biblioteca (solo playlists ajenas ya guardadas). */}
          {showRemoveFromLibrary && (
            <button
              className="action-mini"
              aria-label={t('playlist.removeFromLibrary')}
              title={t('playlist.removeFromLibrary')}
              onClick={() => void removeFromLibrary()}
            >
              <HeartIcon size={20} filled />
            </button>
          )}
          {/* F22 · Compartir enlace de la playlist (F43 con icono SVG). */}
          <button
            className="action-mini"
            aria-label={t('playlist.shareAria')}
            title={t('common.share')}
            onClick={() => void share()}
          >
            <ShareIcon size={18} />
          </button>
          {/* F22 · Editar título y carátula (solo playlists propias) */}
          {isEditable && (
            <button
              className="action-mini"
              aria-label={t('playlist.editAria')}
              title={t('common.edit')}
              onClick={() => setShowEdit(true)}
            >
              {/* F44 · SVG en vez de "✎" de texto para uniformidad con los demás iconos */}
              <EditIcon size={18} />
            </button>
          )}
          {/* F43 · agente E — Menú ⋯ con las acciones estándar de playlist. */}
          <button
            className="action-mini"
            aria-label={t('common.moreActions')}
            title={t('common.moreActions')}
            onClick={openMoreMenu}
          >
            <MoreVerticalIcon size={20} />
          </button>
          {pl.tracks.length > 0 && (
            <ListSearchInput
              value={filter}
              onChange={setFilter}
              ariaLabel={t('playlist.searchAria')}
            />
          )}
        </div>
        {/* F23/F22b · fila de chips de género + botón "Crear playlist con
            [Géneros]". F22b abre la selección a varios chips a la vez (OR
            lógico). Solo se pinta en "Canciones que me gustan" y solo
            cuando ya hay resolución (o un skeleton mientras se carga). */}
        {isLiked && pl.tracks.length > 0 && (
          <div className="genre-bar" aria-label={t('playlist.genreFilterAria')}>
            {genresLoading && !genres ? (
              <span className="chip is-loading" aria-busy="true">
                {t('playlist.loadingGenres')}
              </span>
            ) : (
              <>
                <button
                  className={`chip ${effectiveGenres.size === 0 ? 'active-accent' : ''}`}
                  onClick={() => toggleGenreChip(null)}
                  aria-pressed={effectiveGenres.size === 0}
                >
                  {t('playlist.allGenres')}
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
                    title={t('playlist.createGenreTitle', { n: filteredTracks.length })}
                  >
                    {t('playlist.createGenreBtn', { genres: Array.from(effectiveGenres).join(' + ') })}
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
        {!pl.tracks.length && <div className="empty-state">{t('playlist.empty')}</div>}
        {debounced && pl.tracks.length > 0 && filteredTracks.length === 0 && (
          <div className="empty-state">{t('search.empty', { q: filter })}</div>
        )}
        {isLiked &&
          !debounced &&
          effectiveGenres.size > 0 &&
          pl.tracks.length > 0 &&
          filteredTracks.length === 0 && (
            <div className="empty-state">
              {t('playlist.noGenreMatch', { genres: Array.from(effectiveGenres).join(' + ') })}
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
              pushToast(added === 1 ? t('playlist.addedOne') : t('playlist.addedMany', { n: added }))
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
              pushToast(t('toast.playlistUpdated'))
              void reload()
              void refreshLibrary()
            }
          }}
        />
      )}
    </>
  )
}
