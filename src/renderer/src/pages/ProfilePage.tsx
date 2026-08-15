import { useEffect, useMemo, useRef, useState } from 'react'
import type { MediaCard, ProfileArtistRef, SearchResults } from '@shared/types'
import { useProfile } from '../app/profileStore'
import { useAuth } from '../app/authStore'
import { useLibrary } from '../app/libraryStore'
import { PersonIcon, SearchIcon, CloseIcon, MusicNoteIcon } from '../components/Icons'

/**
 * Página de perfil personalizado (F20).
 *
 * Autoguardado: cada cambio se manda con debounce corto (300 ms). El botón
 * "Guardar cambios" del brief queda como respaldo visual, pero cuando el
 * autoguardado escupe "Guardado ✓" el usuario no necesita pulsarlo.
 */

const BIO_MAX = 200
const NAME_MAX = 40
const PHOTO_MAX_BYTES = 5 * 1024 * 1024 // 5 MB antes de redimensionar
const PHOTO_MAX_DIM = 512

/** Redimensiona una imagen a máx 512×512 y devuelve una data URL JPEG 0.85. */
async function readAndResize(file: File): Promise<string> {
  if (file.size > PHOTO_MAX_BYTES) {
    throw new Error(`La imagen es demasiado grande (${(file.size / 1e6).toFixed(1)} MB). Máx 5 MB.`)
  }
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (): void => resolve(String(reader.result))
    reader.onerror = (): void => reject(reader.error ?? new Error('No se pudo leer el archivo'))
    reader.readAsDataURL(file)
  })
  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const el = new Image()
    el.onload = (): void => resolve(el)
    el.onerror = (): void => reject(new Error('Formato de imagen no soportado'))
    el.src = dataUrl
  })
  const scale = Math.min(1, PHOTO_MAX_DIM / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('El navegador no soporta canvas 2D')
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', 0.85)
}

export function ProfilePage(): React.JSX.Element {
  const { profile, update } = useProfile()
  const auth = useAuth((s) => s.state)
  const library = useLibrary((s) => s.library)

  // Estado local editable — se sincroniza con el store para el autoguardado
  const [displayName, setDisplayName] = useState(profile.displayName ?? '')
  const [bio, setBio] = useState(profile.bio ?? '')
  const [savedFlash, setSavedFlash] = useState(false)
  const [photoErr, setPhotoErr] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<number>(0)

  // Rehidrata los campos locales si el perfil cambia por fuera (otra ventana, etc.)
  useEffect(() => {
    setDisplayName(profile.displayName ?? '')
    setBio(profile.bio ?? '')
  }, [profile.displayName, profile.bio])

  // Autoguardado de nombre/bio con debounce 300 ms
  useEffect(() => {
    window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      const patch: { displayName?: string; bio?: string } = {}
      if ((profile.displayName ?? '') !== displayName) patch.displayName = displayName
      if ((profile.bio ?? '') !== bio) patch.bio = bio
      if (Object.keys(patch).length === 0) return
      void update(patch).then(() => flashSaved())
    }, 300)
    return () => window.clearTimeout(debounceRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayName, bio])

  const flashSaved = (): void => {
    setSavedFlash(true)
    window.setTimeout(() => setSavedFlash(false), 1500)
  }

  const displayed = profile.enabled && profile.photoDataUrl
    ? profile.photoDataUrl
    : auth.accountPhotoUrl
  const displayedName = profile.enabled && (profile.displayName ?? '').trim()
    ? profile.displayName
    : auth.accountName ?? 'Invitado'

  // ---- Foto ----
  const onPickPhoto = (): void => fileInputRef.current?.click()
  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    setPhotoErr(null)
    const file = e.target.files?.[0]
    e.target.value = '' // permite subir la misma imagen dos veces
    if (!file) return
    try {
      const dataUrl = await readAndResize(file)
      await update({ photoDataUrl: dataUrl })
      flashSaved()
    } catch (err) {
      setPhotoErr(String((err as Error)?.message ?? err))
    }
  }
  const onClearPhoto = (): void => {
    void update({ photoDataUrl: '' }).then(() => flashSaved())
  }

  // ---- Artistas favoritos ----
  const [artistQuery, setArtistQuery] = useState('')
  const [artistResults, setArtistResults] = useState<MediaCard[]>([])
  const [searchingArtists, setSearchingArtists] = useState(false)
  const artistSeq = useRef(0)
  useEffect(() => {
    const q = artistQuery.trim()
    if (!q) {
      setArtistResults([])
      return
    }
    const seq = ++artistSeq.current
    setSearchingArtists(true)
    const t = window.setTimeout(() => {
      void window.api.music
        .search(q, 'artist')
        .then((res: SearchResults) => {
          if (seq !== artistSeq.current) return
          setArtistResults(res.artists.slice(0, 8))
          setSearchingArtists(false)
        })
        .catch(() => {
          if (seq !== artistSeq.current) return
          setSearchingArtists(false)
        })
    }, 300)
    return () => window.clearTimeout(t)
  }, [artistQuery])

  const addFavArtist = (card: MediaCard): void => {
    if (profile.favoriteArtists.some((a) => a.id === card.id)) return
    const next: ProfileArtistRef[] = [
      ...profile.favoriteArtists,
      { id: card.id, name: card.title, thumbnailUrl: card.thumbnailUrl }
    ]
    void update({ favoriteArtists: next }).then(() => flashSaved())
  }
  const removeFavArtist = (id: string): void => {
    const next = profile.favoriteArtists.filter((a) => a.id !== id)
    void update({ favoriteArtists: next }).then(() => flashSaved())
  }

  // ---- Playlists públicas ----
  const userPlaylists = useMemo(() => library?.playlists ?? [], [library])
  const publicIds = new Set(profile.publicPlaylistIds)
  const togglePublic = (id: string): void => {
    const next = publicIds.has(id)
      ? profile.publicPlaylistIds.filter((x) => x !== id)
      : [...profile.publicPlaylistIds, id]
    void update({ publicPlaylistIds: next }).then(() => flashSaved())
  }

  return (
    <div className="page profile-page" style={{ maxWidth: 780 }}>
      <h1>Perfil</h1>

      {/* Cabecera con foto grande, nombre y descripción */}
      <div className="profile-header">
        <div className="profile-avatar">
          {displayed ? (
            // F22c · `key` fuerza remount cuando cambia la fuente (perfil
            // custom on/off, foto nueva subida) — evita cache visual del <img>.
            <img key={displayed} src={displayed} alt="" />
          ) : (
            <span className="ph">
              <PersonIcon size={72} />
            </span>
          )}
        </div>
        <div className="profile-header-meta">
          <div className="eyebrow">
            {profile.enabled ? 'Perfil personalizado' : 'Usando datos de tu cuenta'}
          </div>
          <div className="profile-name">{displayedName}</div>
          {profile.bio && <div className="profile-bio">{profile.bio}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={onPickPhoto}>
              Cambiar foto
            </button>
            {profile.photoDataUrl && (
              <button className="btn btn-secondary" onClick={onClearPhoto}>
                Quitar foto
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onFileChange}
              style={{ display: 'none' }}
            />
          </div>
          {photoErr && (
            <div className="error-banner" style={{ marginTop: 10 }}>
              {photoErr}
            </div>
          )}
        </div>
      </div>

      {/* Toggle principal */}
      <h2>Ajustes del perfil</h2>
      <div className="profile-row">
        <div>
          <div style={{ fontWeight: 600 }}>Usar perfil personalizado en la app</div>
          <div style={{ color: 'var(--text-subdued)', fontSize: 12 }}>
            Cuando esté activo, tu foto y nombre sustituyen a los de Google en la barra
            superior y en Discord.
          </div>
          {/* F25 · nota informativa sobre Discord Rich Presence */}
          <div style={{ color: 'var(--text-subdued)', fontSize: 12, marginTop: 4 }}>
            Si activas Discord Rich Presence en Ajustes, se mostrará esta foto y este
            nombre en tu perfil de Discord mientras escuches música.
          </div>
        </div>
        <input
          type="checkbox"
          checked={profile.enabled}
          onChange={(e) => void update({ enabled: e.target.checked }).then(() => flashSaved())}
        />
      </div>

      <div className="profile-row">
        <label style={{ fontWeight: 600 }} htmlFor="pf-name">
          Nombre visible
        </label>
        <input
          id="pf-name"
          className="profile-input"
          maxLength={NAME_MAX}
          value={displayName}
          placeholder={auth.accountName ?? 'Tu nombre'}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>

      <div className="profile-block">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontWeight: 600 }} htmlFor="pf-bio">
            Descripción
          </label>
          <span style={{ color: 'var(--text-subdued)', fontSize: 12 }}>
            {bio.length}/{BIO_MAX}
          </span>
        </div>
        <textarea
          id="pf-bio"
          className="profile-textarea"
          maxLength={BIO_MAX}
          value={bio}
          placeholder="Cuenta algo sobre ti (200 caracteres)"
          rows={3}
          onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
        />
      </div>

      {/* Artistas favoritos */}
      <h2>Artistas favoritos</h2>
      <div className="profile-chips">
        {profile.favoriteArtists.length === 0 && (
          <span style={{ color: 'var(--text-subdued)', fontSize: 13 }}>
            Aún no has añadido ninguno.
          </span>
        )}
        {profile.favoriteArtists.map((a) => (
          <span key={a.id} className="profile-artist-chip" title={a.name}>
            {a.thumbnailUrl ? (
              <img src={a.thumbnailUrl} alt="" />
            ) : (
              <span className="ph">
                <PersonIcon size={16} />
              </span>
            )}
            <span className="txt">{a.name}</span>
            <button
              className="x"
              aria-label={`Quitar ${a.name}`}
              onClick={() => removeFavArtist(a.id)}
            >
              <CloseIcon size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="profile-artist-search">
        <span className="icon">
          <SearchIcon size={16} />
        </span>
        <input
          value={artistQuery}
          placeholder="Buscar artistas para añadir…"
          onChange={(e) => setArtistQuery(e.target.value)}
        />
      </div>
      {artistQuery.trim().length > 0 && (
        <div className="profile-artist-results">
          {searchingArtists && artistResults.length === 0 && (
            <div style={{ color: 'var(--text-subdued)', fontSize: 13, padding: 12 }}>
              Buscando…
            </div>
          )}
          {!searchingArtists && artistResults.length === 0 && (
            <div style={{ color: 'var(--text-subdued)', fontSize: 13, padding: 12 }}>
              Sin resultados.
            </div>
          )}
          {artistResults.map((a) => {
            const already = profile.favoriteArtists.some((x) => x.id === a.id)
            return (
              <button
                key={a.id}
                className="profile-artist-result"
                disabled={already}
                onClick={() => addFavArtist(a)}
                title={already ? 'Ya lo tienes' : `Añadir ${a.title}`}
              >
                {a.thumbnailUrl ? (
                  <img src={a.thumbnailUrl} alt="" />
                ) : (
                  <span className="ph">
                    <PersonIcon size={20} />
                  </span>
                )}
                <span className="meta">
                  <span className="t">{a.title}</span>
                  {a.subtitle && <span className="s">{a.subtitle}</span>}
                </span>
                <span className="plus">{already ? '✓' : '+'}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Playlists públicas */}
      <h2>Playlists públicas</h2>
      <p style={{ color: 'var(--text-subdued)', fontSize: 12, padding: '0 0 8px' }}>
        Elige qué playlists de tu biblioteca considerar públicas. Otras funciones futuras
        podrán compartirlas.
      </p>
      {userPlaylists.length === 0 && (
        <div className="empty-state" style={{ padding: 20 }}>
          No tienes playlists en tu biblioteca (o aún no ha cargado).
        </div>
      )}
      <div className="profile-playlist-list">
        {userPlaylists.map((p) => (
          <label key={p.id} className="profile-playlist-row">
            <input
              type="checkbox"
              checked={publicIds.has(p.id)}
              onChange={() => togglePublic(p.id)}
            />
            {p.thumbnailUrl ? (
              <img src={p.thumbnailUrl} alt="" loading="lazy" />
            ) : (
              <span className="ph">
                <MusicNoteIcon size={20} />
              </span>
            )}
            <span className="meta">
              <span className="t">{p.title}</span>
              {p.subtitle && <span className="s">{p.subtitle}</span>}
            </span>
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 0 8px' }}>
        <button
          className="btn btn-primary"
          onClick={() => {
            // Fuerza escritura del último estado por si el usuario prefiere el botón
            void update({
              displayName,
              bio,
              enabled: profile.enabled,
              photoDataUrl: profile.photoDataUrl,
              favoriteArtists: profile.favoriteArtists,
              publicPlaylistIds: profile.publicPlaylistIds
            }).then(() => flashSaved())
          }}
        >
          Guardar cambios
        </button>
        <span
          style={{
            color: 'var(--accent)',
            fontSize: 13,
            opacity: savedFlash ? 1 : 0,
            transition: 'opacity 0.25s var(--ease-out)'
          }}
        >
          Guardado ✓
        </span>
      </div>
    </div>
  )
}
