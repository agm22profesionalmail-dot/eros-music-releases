import { SearchIcon } from './Icons'

interface ListSearchInputProps {
  /** Valor del input controlado por el padre. */
  value: string
  /** Se dispara en cada tecla — el debounce lo hace el padre. */
  onChange: (next: string) => void
  /** Texto del placeholder. Por defecto: "Buscar en la lista…". */
  placeholder?: string
  /** aria-label del input (para lectores de pantalla). */
  ariaLabel?: string
  /** Clases extra aplicadas al wrapper (`.list-search` siempre está). */
  className?: string
}

/**
 * F21: input de búsqueda para filtrar el contenido visible de una lista
 * (playlist, biblioteca, álbum). Presentacional puro — el filtrado y el
 * debounce viven en el componente que lo usa.
 *
 * El icono de lupa es decorativo: va en un `<span aria-hidden>`, nunca en
 * un `<button>` (no debe recibir foco ni doblar la semántica).
 */
export function ListSearchInput({
  value,
  onChange,
  placeholder = 'Buscar en la lista…',
  ariaLabel = 'Buscar en la lista',
  className
}: ListSearchInputProps): React.JSX.Element {
  return (
    <div className={`list-search${className ? ' ' + className : ''}`}>
      <span className="icon" aria-hidden="true">
        <SearchIcon size={16} />
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  )
}
