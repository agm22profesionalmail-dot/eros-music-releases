import { useEffect, useRef, useState } from 'react'
import { CloseIcon, MusicNoteIcon } from './Icons'

/**
 * F22 · Modal para editar título y carátula de una playlist propia.
 *
 * - Título: input con contador de 100 caracteres.
 * - Carátula: `<input type=file accept="image/*">` → recorte cuadrado centrado
 *   y reescalado a 512×512 en un `<canvas>` (JPEG 0.85). Se guarda como data
 *   URL — YT Music no admite cambio de carátula por API, así que vive solo en
 *   el override local (BD).
 * - "Quitar carátula" limpia el override (vuelve a la original del backend).
 * - Guardar llama a `window.api.library.playlistEdit(id, patch)`.
 *
 * El padre se encarga de refrescar la vista al terminar.
 */

interface Props {
  playlistId: string
  currentTitle: string
  currentThumbnailUrl?: string
  onClose: (saved: boolean) => void
}

const MAX_TITLE = 100
const OUT_SIZE = 512
const JPEG_QUALITY = 0.85

export function PlaylistEditModal({
  playlistId,
  currentTitle,
  currentThumbnailUrl,
  onClose
}: Props): React.JSX.Element {
  const [title, setTitle] = useState(currentTitle)
  // `thumb` puede ser: undefined (sin cambio), string (nueva data URL),
  // null (quitar override → vuelve a la original).
  const [thumb, setThumb] = useState<string | null | undefined>(undefined)
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
    thumb === undefined ? currentThumbnailUrl : thumb === null ? currentThumbnailUrl : thumb
  const previewIsPlaceholder = thumb === null || !previewSrc

  const pickFile = (): void => fileInputRef.current?.click()

  const handleFile = async (file: File): Promise<void> => {
    setError(null)
    try {
      const dataUrl = await fileToDataUrl(file)
      const cropped = await cropAndResize(dataUrl, OUT_SIZE, JPEG_QUALITY)
      setThumb(cropped)
    } catch (err) {
      setError('No se pudo procesar la imagen: ' + String((err as Error)?.message ?? err))
    }
  }

  const save = async (): Promise<void> => {
    const cleanTitle = title.trim().slice(0, MAX_TITLE)
    if (!cleanTitle.length) {
      setError('El título no puede estar vacío')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const patch: { title?: string; thumbnailDataUrl?: string | null } = {}
      if (cleanTitle !== currentTitle) patch.title = cleanTitle
      if (thumb !== undefined) patch.thumbnailDataUrl = thumb // string o null
      // Si nada cambió, cerramos sin llamar al backend (rápido y no ensucia caché)
      if (patch.title === undefined && patch.thumbnailDataUrl === undefined) {
        onClose(false)
        return
      }
      await window.api.library.playlistEdit(playlistId, patch)
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
        aria-label="Editar playlist"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="picker-head">
          <div className="picker-title">
            <div className="eyebrow">Editar</div>
            <div className="name">Playlist</div>
          </div>
          <button className="picker-x" onClick={() => onClose(false)} aria-label="Cerrar">
            <CloseIcon size={16} />
          </button>
        </header>

        <div className="edit-body">
          <div className="edit-cover">
            {previewIsPlaceholder ? (
              <div className="edit-cover-ph">
                <MusicNoteIcon size={64} />
              </div>
            ) : (
              <img src={previewSrc} alt="" />
            )}
            <div className="edit-cover-actions">
              <button className="btn btn-secondary edit-cover-btn" onClick={pickFile}>
                Cambiar carátula
              </button>
              {(thumb || (thumb === undefined && currentThumbnailUrl)) && (
                <button
                  className="btn btn-secondary edit-cover-btn"
                  onClick={() => setThumb(null)}
                  title="Vuelve a la carátula original"
                >
                  Quitar carátula
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
                // Reset para que subir el mismo fichero dos veces también dispare change
                e.target.value = ''
              }}
            />
          </div>

          <label className="edit-title-block">
            <span className="edit-label">Título</span>
            <input
              className="edit-title-input"
              value={title}
              maxLength={MAX_TITLE}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !disabled) void save()
              }}
              autoFocus
            />
            <span className="edit-counter">
              {title.length}/{MAX_TITLE}
            </span>
          </label>

          {error && <div className="error-banner">{error}</div>}
        </div>

        <footer className="picker-foot">
          <button className="btn btn-secondary" onClick={() => onClose(false)}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={disabled} onClick={() => void save()}>
            {saving ? 'Guardando…' : 'Guardar'}
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
    fr.onerror = () => reject(new Error('No se pudo leer el fichero'))
    fr.readAsDataURL(file)
  })
}

/**
 * Recorta centrado a cuadrado y reescala a `size`×`size`.
 * Devuelve un data URL JPEG con la calidad indicada.
 */
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
