import loadingWebm from '../assets/loading.webm'

/**
 * F61 · Icono de carga de la casa (`loading.webm`, nota musical animada).
 *
 * El vídeo trae el dibujo morado sobre negro puro (yuv420p, sin alfa), así que
 * el recolorado es 100% CSS y sigue al tema activo:
 *   1. `grayscale(1) brightness(3)` — el glifo pasa a blanco, el fondo sigue negro.
 *   2. Una capa `background: var(--accent)` con `mix-blend-mode: multiply`
 *      (aislada con `isolation: isolate`) tiñe SOLO el glifo del acento actual.
 *   3. El disco negro con anillo del acento garantiza contraste sobre
 *      cualquier fondo, claro u oscuro.
 */
export function LoadingSpinner({
  size = 72,
  label
}: {
  size?: number
  label?: string
}): React.JSX.Element {
  return (
    <div className="loading-spinner" role="status" aria-live="polite" aria-label={label}>
      <span className="loading-spinner-glyph" style={{ width: size, height: size }} aria-hidden="true">
        <video src={loadingWebm} autoPlay loop muted playsInline disablePictureInPicture />
        <span className="loading-spinner-tint" />
      </span>
      {label && <span className="loading-spinner-label">{label}</span>}
    </div>
  )
}
