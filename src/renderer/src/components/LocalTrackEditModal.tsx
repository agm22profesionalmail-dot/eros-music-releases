import { useEffect, useRef, useState } from 'react'
import { CloseIcon, MusicNoteIcon } from './Icons'
import { t as ti18n, useT } from '../app/i18n'
import appIconUrl from '../assets/icon-256.png'

/**
 * F82 · Modal para editar metadatos de un track de música local.
 *
 * - Título, Artista, Álbum: inputs de texto.
 * - Carátula: `<input type=file accept="image/*">` → recorte cuadrado centrado
 *   y reescalado a 512×512 en un `<canvas>` (JPEG 0.85). Se guarda como data
 *   URL en la BD (cover_path).
 * - "Quitar carátula" limpia el override (vuelve al icono de la app).
 * - Guardar llama a `window.api.localMusic.editMeta(id, patch)`.
 */

interface Props {
  trackId: number
  currentTitle: string
  currentArtist: string
  currentAlbum: string
  currentCoverPath?: string | null
  onClose: (saved: boolean) => void
}

const MAX_LEN = 200
const OUT_SIZE = 512
const JPEG_QUALITY = 0.85

export function LocalTrackEditModal({
  trackId,
  currentTitle,
  currentArtist,
  currentAlbum,
  currentCoverPath,
  onClose
}: Props): React.JSX.Element {
  const t = useT()
  const [title, setTitle] = useState(currentTitle)
  const [artist, setArtist] = useState(currentArtist)
  const [album, setAlbum] = useState(currentAlbum)
  // `cover` puede ser: undefined (sin cambio), string (nueva data URL),
  // null (quitar override → vuelve al icono de la app).
  const [cover, setCover] = useState<string | null | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const previewSrc =
    cover === undefined
      ? (currentCoverPath || appIconUrl)
      : cover === null
        ? appIconUrl
        : cover

  const pickFile = (): void => fileInputRef.current?.click()

  const handleFile = async (file: File): Promise<void> => {
    setError(null)
    try {
      const dataUrl = await fileToDataUrl(file)
      const cropped = await cropAndResize(dataUrl, OUT_SIZE, JPEG_QUALITY)
      setCover(cropped)
    } catch (err) {
      setError(t('edit.imgError', { msg: String((err as Error)?.message ?? err) }))
    }
  }

  const save = async (): Promise<void> => {
    const cleanTitle = title.trim().slice(0, MAX_LEN)
    if (!cleanTitle.length) {
      setError(t('edit.emptyTitle'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const patch: { title?: string; artist?: string; album?: string; coverPath?: string | null } = {}
      if (cleanTitle !== currentTitle) patch.title = cleanTitle
      const cleanArtist = artist.trim().slice(0, MAX_LEN)
      if (cleanArtist !== currentArtist) patch.artist = cleanArtist
      const cleanAlbum = album.trim().slice(0, MAX_LEN)
      if (cleanAlbum !== currentAlbum) patch.album = cleanAlbum
      if (cover !== undefined) patch.coverPath = cover // string o null

      // Si nada cambió, cerramos sin llamar al backend
      if (
        patch.title === undefined &&
        patch.artist === undefined &&
        patch.album === undefined &&
        patch.coverPath === undefined
      ) {
        onClose(false)
        return
      }
      await window.api.localMusic.editMeta(trackId, patch)
      onClose(true)
    } catch (err) {
      setError(String((err as Error)?.message ?? err))
      setSaving(false)
    }
  }

  const disabled = saving || !title.trim().length

  return (
    <div className="picker-overlay" onClick={() => onClose(false)}>
      <div
        className="edit-card"
        role="dialog"
        aria-label={t('library.localMusic.editMeta')}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="picker-head">
          <div className="picker-title">
            <div className="eyebrow">{t('library.localMusic.editMeta')}</div>
            <div className="name">{title || '—'}</div>
          </div>
          <button className="picker-x" onClick={() => onClose(false)} aria-label={t('btn.close')}>
            <CloseIcon size={16} />
          </button>
        </header>

        <div className="edit-body">
          <div className="edit-cover">
            <img src={previewSrc} alt="" />
            <div className="edit-cover-actions">
              <button className="btn btn-secondary edit-cover-btn" onClick={pickFile}>
                {t('edit.changeCover')}
              </button>
              {(cover || (cover === undefined && currentCoverPath)) && (
                <button
                  className="btn btn-secondary edit-cover-btn"
                  onClick={() => setCover(null)}
                  title={t('edit.removeCoverTitle')}
                >
                  {t('edit.removeCover')}
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleFile(file)
                e.target.value = ''
              }}
            />
          </div>

          <div className="edit-fields">
            <label className="edit-title-block">
              <span className="edit-label">{t('edit.title')}</span>
              <input
                className="edit-title-input"
                value={title}
                maxLength={MAX_LEN}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !disabled) void save()
                }}
                autoFocus
              />
            </label>

            <label className="edit-title-block">
              <span className="edit-label">{t('localEdit.artist')}</span>
              <input
                className="edit-title-input"
                value={artist}
                maxLength={MAX_LEN}
                onChange={(e) => setArtist(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !disabled) void save()
                }}
              />
            </label>

            <label className="edit-title-block">
              <span className="edit-label">{t('localEdit.album')}</span>
              <input
                className="edit-title-input"
                value={album}
                maxLength={MAX_LEN}
                onChange={(e) => setAlbum(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !disabled) void save()
                }}
              />
            </label>
          </div>

          {error && <div className="error-banner">{error}</div>}
        </div>

        <footer className="picker-foot">
          <button className="btn btn-secondary" onClick={() => onClose(false)}>
            {t('btn.cancel')}
          </button>
          <button className="btn btn-primary" disabled={disabled} onClick={() => void save()}>
            {saving ? t('edit.saving') : t('btn.save')}
          </button>
        </footer>
      </div>
    </div>
  )
}

// ---------- Helpers de imagen ----------

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(new Error(ti18n('edit.fileReadError')))
    fr.readAsDataURL(file)
  })
}

function cropAndResize(dataUrl: string, size: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const min = Math.min(img.width, img.height)
      const sx = (img.width - min) / 2
      const sy = (img.height - min) / 2
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas no disponible'))
        return
      }
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, size, size)
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => reject(new Error('imagen ilegible'))
    img.src = dataUrl
  })
}
