/**
 * Iconos SVG inline propios de ERO'S Music — estilo "trazo redondeado" (line
 * icons), a juego con la suavidad del logo café-crema. Reemplazan a los
 * anteriores (redibujos de Spotify). Todos comparten viewBox 24 y heredan el
 * color del contenedor vía `currentColor`; el tamaño se controla con `size`.
 *
 * Contrato estable: cada icono se exporta como `export function XxxIcon`
 * con las mismas firmas/props que antes (incl. `HeartIcon.filled`,
 * `VolumeIcon.muted`) para no romper a ninguno de sus consumidores.
 */

interface IconProps {
  size?: number
  className?: string
}

const S = ({ size = 24 }: IconProps): { width: number; height: number } => ({
  width: size,
  height: size
})

// Props comunes del trazo. Los hijos rellenos (puntos, variantes "filled")
// sobreescriben con fill="currentColor" stroke="none".
// `shapeRendering: geometricPrecision` mantiene curvas/diagonales suaves y
// consistentes a cualquier tamaño (evita el aspecto "sucio" del auto).
const L = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  shapeRendering: 'geometricPrecision' as const
}

export function HomeIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10.5V19a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-8.5" />
    </svg>
  )
}

export function SearchIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  )
}

// Forma de la propuesta "sólida" (tres tomos con el último ladeado) pero
// dibujada en trazo, según la elección del usuario.
export function LibraryIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <rect x="3.4" y="4" width="3.6" height="16" rx="1.5" />
      <rect x="9" y="4" width="3.6" height="16" rx="1.5" />
      <rect x="14.7" y="4.7" width="3.6" height="15" rx="1.5" transform="rotate(-13 16.5 12.2)" />
    </svg>
  )
}

// Play/Pausa en SÓLIDO a propósito: es el control central y en trazo se veía
// fino/borroso (sobre todo el triángulo hueco dentro del botón claro).
export function PlayIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11.5-6.86a1 1 0 0 0 0-1.72L9.5 4.28A1 1 0 0 0 8 5.14Z" />
    </svg>
  )
}

export function PauseIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4.5" width="4" height="15" rx="2" />
      <rect x="14" y="4.5" width="4" height="15" rx="2" />
    </svg>
  )
}

export function SkipNextIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <path d="M6.5 6.2v11.6a1 1 0 0 0 1.5.87L16 14" />
      <path d="M16 6v12" />
      <path d="M7 6.2 15.5 11a1 1 0 0 1 0 1.9" />
    </svg>
  )
}

export function SkipPrevIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <path d="M17.5 6.2v11.6a1 1 0 0 1-1.5.87L8 14" />
      <path d="M8 6v12" />
      <path d="M17 6.2 8.5 11a1 1 0 0 0 0 1.9" />
    </svg>
  )
}

export function ShuffleIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <path d="M3 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22" />
      <path d="m18.5 2.5 3.5 3.5-3.5 3.5" />
      <path d="M3 6h1.9c1.5 0 2.9.9 3.6 2.2" />
      <path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8" />
      <path d="m18.5 14.5 3.5 3.5-3.5 3.5" />
    </svg>
  )
}

export function RepeatIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <path d="m16.5 3.5 3 3-3 3" />
      <path d="M19.5 6.5H8a4 4 0 0 0-4 4v.5" />
      <path d="m7.5 20.5-3-3 3-3" />
      <path d="M4.5 17.5H16a4 4 0 0 0 4-4V13" />
    </svg>
  )
}

export function RepeatOneIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <path d="m16.5 3.5 3 3-3 3" />
      <path d="M19.5 6.5H8a4 4 0 0 0-4 4v.5" />
      <path d="m7.5 20.5-3-3 3-3" />
      <path d="M4.5 17.5H13" />
      <path fill="currentColor" stroke="none" d="M12.9 9.3v5.7h-1.15v-4.1l-1 .5-.32-.92 1.72-1.08z" />
    </svg>
  )
}

export function QueueIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <path d="M4 7h10M4 12h10M4 17h6" />
      <path d="M18 9.5v7.2" />
      <circle cx="16" cy="17" r="1.9" />
    </svg>
  )
}

export function VolumeIcon({
  size,
  className,
  muted
}: IconProps & { muted?: boolean }): React.JSX.Element {
  if (muted) {
    return (
      <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
        <path d="M4 9.5v5h3l4.5 3.5V6L7 9.5H4Z" />
        <path d="M16.5 10 21 14.5M21 10l-4.5 4.5" />
      </svg>
    )
  }
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <path d="M4 9.5v5h3l4.5 3.5V6L7 9.5H4Z" />
      <path d="M15.5 9.2a3.8 3.8 0 0 1 0 5.6" />
      <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  )
}

export function HeartIcon({
  size,
  className,
  filled
}: IconProps & { filled?: boolean }): React.JSX.Element {
  const d = 'M12 20.3s-7.2-4.35-9.5-8.3A5.1 5.1 0 0 1 12 6.1a5.1 5.1 0 0 1 9.5 5.9c-2.3 3.95-9.5 8.3-9.5 8.3Z'
  if (filled) {
    return (
      <svg {...S({ size })} className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d={d} />
      </svg>
    )
  }
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <path d={d} />
    </svg>
  )
}

export function MoreIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
    </svg>
  )
}

export function MoreVerticalIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="12" cy="19" r="1.7" />
    </svg>
  )
}

export function ShareIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <path d="M14 4h6v6" />
      <path d="M20 4 10.5 13.5" />
      <path d="M20 13.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4.5" />
    </svg>
  )
}

export function PlusIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function MinusIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <path d="M5 12h14" />
    </svg>
  )
}

export function EditIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <path d="M4 20h4L18.4 9.6a2 2 0 0 0 0-2.83l-1.17-1.17a2 2 0 0 0-2.83 0L4 16v4Z" />
      <path d="M13.5 6.5 17.5 10.5" />
    </svg>
  )
}

export function ChartIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <path d="M4 20h16" />
      <path d="M6 20v-6M11 20V5M16 20v-9M20.5 20V9" />
    </svg>
  )
}

export function SparkleIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <path d="M11 3.5l1.6 4.9a2 2 0 0 0 1.3 1.3l4.9 1.6-4.9 1.6a2 2 0 0 0-1.3 1.3L11 19.1l-1.6-4.9a2 2 0 0 0-1.3-1.3L3.2 11.3l4.9-1.6a2 2 0 0 0 1.3-1.3L11 3.5Z" />
      <path d="M18.5 3.5v3M20 5h-3" />
    </svg>
  )
}

export function MoveIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <path d="M12 3v18M3 12h18" />
      <path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
    </svg>
  )
}

export function CheckIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <path d="m4 12.5 5 5L20 6.5" />
    </svg>
  )
}

export function ChevronLeftIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <path d="m15 5-7 7 7 7" />
    </svg>
  )
}

export function ChevronRightIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  )
}

export function CloseIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

export function MinimizeIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <path d="M5 12h14" />
    </svg>
  )
}

export function MaximizeIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />
    </svg>
  )
}

// "Letras / karaoke": bocadillo con líneas de texto. Antes era un micrófono,
// que se leía como "grabar". Se usa solo para letras (menú ⋯, mini-player y el
// placeholder de LyricsPage), así que el bocadillo encaja en los tres.
export function MicIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <path d="M4 4.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4 3v-3H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z" />
      <path d="M7.5 9h9M7.5 12h5.5" />
    </svg>
  )
}

export function SettingsIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  )
}

export function DownloadIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v6" />
      <path d="m9 10.5 3 3 3-3" />
    </svg>
  )
}

export function ClockIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5l3.2 2" />
    </svg>
  )
}

export function MusicNoteIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <path d="M9 17V5l10-2v12" />
      <circle cx="6.5" cy="17" r="2.5" />
      <circle cx="16.5" cy="15" r="2.5" />
    </svg>
  )
}

export function HeadphonesIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
      <path d="M4 13h1a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1 2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2ZM20 13h-1a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1 2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2Z" />
    </svg>
  )
}

export function RadioIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <rect x="3" y="8" width="18" height="12" rx="2.5" />
      <path d="m16 4-8 4" />
      <circle cx="8" cy="14" r="2.5" />
      <path d="M14 12.5h4M14 16h4" />
    </svg>
  )
}

export function LightbulbIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <path d="M9.5 18h5M10.5 21h3" />
      <path d="M12 3a6 6 0 0 0-3.8 10.65c.5.45.8 1.05.8 1.85h6c0-.8.3-1.4.8-1.85A6 6 0 0 0 12 3Z" />
    </svg>
  )
}

export function PersonIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  )
}

// Barras de ecualizador — antes SVG inline en NowPlayingBar, ahora centralizado.
export function VisualizerIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <path d="M5 14.5v-5M10 18V6M15 15.5v-7M20 13v-2" />
    </svg>
  )
}

// Ventana con recuadro PiP — antes SVG inline en NowPlayingBar.
export function MiniPlayerIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" {...L}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <rect x="11.5" y="12" width="6.5" height="4.4" rx="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}
