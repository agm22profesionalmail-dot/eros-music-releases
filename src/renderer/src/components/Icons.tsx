/** Iconos SVG inline (trazo/relleno según el original de Spotify, redibujados). */

interface IconProps {
  size?: number
  className?: string
}

const S = ({ size = 24 }: IconProps): { width: number; height: number } => ({
  width: size,
  height: size
})

export function HomeIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.5 3.247a1 1 0 0 0-1 0L4 7.577V20h4.5v-6a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v6H20V7.577l-7.5-4.33zm-2-1.732a3 3 0 0 1 3 0l7.5 4.33a2 2 0 0 1 1 1.732V21a1 1 0 0 1-1 1h-6.5a1 1 0 0 1-1-1v-6h-3v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7.577a2 2 0 0 1 1-1.732l7.5-4.33z" />
    </svg>
  )
}

export function SearchIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M10.533 1.279c-5.18 0-9.407 4.14-9.407 9.279s4.226 9.279 9.407 9.279c2.234 0 4.29-.77 5.907-2.058l4.353 4.353a1 1 0 1 0 1.414-1.414l-4.344-4.344a9.157 9.157 0 0 0 2.077-5.816c0-5.14-4.226-9.28-9.407-9.28zm-7.407 9.279c0-4.006 3.302-7.28 7.407-7.28s7.407 3.274 7.407 7.28-3.302 7.279-7.407 7.279-7.407-3.273-7.407-7.28z" />
    </svg>
  )
}

export function LibraryIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 22a1 1 0 0 1-1-1V3a1 1 0 0 1 2 0v18a1 1 0 0 1-1 1zM15.5 2.134A1 1 0 0 0 14 3v18a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6.464a1 1 0 0 0-.5-.866l-6-3.464zM9 2a1 1 0 0 0-1 1v18a1 1 0 1 0 2 0V3a1 1 0 0 0-1-1z" />
    </svg>
  )
}

export function PlayIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="m7.05 3.606 13.49 7.788a.7.7 0 0 1 0 1.212L7.05 20.394A.7.7 0 0 1 6 19.788V4.212a.7.7 0 0 1 1.05-.606z" />
    </svg>
  )
}

export function PauseIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.7 3a.7.7 0 0 0-.7.7v16.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V3.7a.7.7 0 0 0-.7-.7H5.7zm10 0a.7.7 0 0 0-.7.7v16.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V3.7a.7.7 0 0 0-.7-.7h-2.6z" />
    </svg>
  )
}

export function SkipNextIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.7 3a.7.7 0 0 0-.7.7v6.805L5.05 3.606A.7.7 0 0 0 4 4.212v15.576a.7.7 0 0 0 1.05.606L17 13.495V20.3a.7.7 0 0 0 .7.7h1.6a.7.7 0 0 0 .7-.7V3.7a.7.7 0 0 0-.7-.7h-1.6z" />
    </svg>
  )
}

export function SkipPrevIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6.3 3a.7.7 0 0 1 .7.7v6.805l11.95-6.899a.7.7 0 0 1 1.05.606v15.576a.7.7 0 0 1-1.05.606L7 13.495V20.3a.7.7 0 0 1-.7.7H4.7a.7.7 0 0 1-.7-.7V3.7a.7.7 0 0 1 .7-.7h1.6z" />
    </svg>
  )
}

// F44 · viewBox arreglado: los paths de este icono se dibujan en el rango
// 0-16 (no 0-24 como decía antes), así que con viewBox 24 el dibujo se
// quedaba en la esquina superior izquierda del hueco y se veía pequeño y
// descentrado. Ahora viewBox 16 hace que el icono llene su caja.
export function ShuffleIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.151.922a.75.75 0 1 0-1.06 1.06L13.109 3H11.16a3.75 3.75 0 0 0-2.873 1.34l-6.173 7.356A2.25 2.25 0 0 1 .39 12.5H0V14h.391a3.75 3.75 0 0 0 2.873-1.34l6.173-7.356a2.25 2.25 0 0 1 1.724-.804h1.947l-1.017 1.018a.75.75 0 0 0 1.06 1.06L15.98 3.75 13.15.922zM.391 3.5H0V2h.391c1.109 0 2.16.49 2.873 1.34L4.89 5.277l-.979 1.167-1.796-2.14A2.25 2.25 0 0 0 .39 3.5z" />
      <path d="m7.5 10.723.98-1.167.957 1.14a2.25 2.25 0 0 0 1.724.804h1.947l-1.017-1.018a.75.75 0 1 1 1.06-1.06l2.829 2.828-2.829 2.828a.75.75 0 1 1-1.06-1.06L13.109 13H11.16a3.75 3.75 0 0 1-2.873-1.34l-.787-.937z" />
    </svg>
  )
}

export function RepeatIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M0 4.75A3.75 3.75 0 0 1 3.75 1h8.5A3.75 3.75 0 0 1 16 4.75v5a3.75 3.75 0 0 1-3.75 3.75H9.81l1.018 1.018a.75.75 0 1 1-1.06 1.06L6.939 12.75l2.829-2.828a.75.75 0 1 1 1.06 1.06L9.811 12h2.439a2.25 2.25 0 0 0 2.25-2.25v-5a2.25 2.25 0 0 0-2.25-2.25h-8.5A2.25 2.25 0 0 0 1.5 4.75v5A2.25 2.25 0 0 0 3.75 12H5v1.5H3.75A3.75 3.75 0 0 1 0 9.75v-5z" />
    </svg>
  )
}

export function RepeatOneIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M0 4.75A3.75 3.75 0 0 1 3.75 1h.75v1.5h-.75A2.25 2.25 0 0 0 1.5 4.75v5A2.25 2.25 0 0 0 3.75 12H5v1.5H3.75A3.75 3.75 0 0 1 0 9.75v-5zM12.25 2.5h-.75V1h.75A3.75 3.75 0 0 1 16 4.75v5a3.75 3.75 0 0 1-3.75 3.75H9.81l1.018 1.018a.75.75 0 1 1-1.06 1.06L6.939 12.75l2.829-2.828a.75.75 0 1 1 1.06 1.06L9.811 12h2.439a2.25 2.25 0 0 0 2.25-2.25v-5a2.25 2.25 0 0 0-2.25-2.25z" />
      <path d="M9.12 8V1H7.787c-.128.72-.76 1.293-1.787 1.313V3.36h1.57V8h1.55z" />
    </svg>
  )
}

export function QueueIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M15 15H1v-1.5h14V15zm0-4.5H1V9h14v1.5zm-14-7A2.5 2.5 0 0 1 3.5 1h9a2.5 2.5 0 0 1 0 5h-9A2.5 2.5 0 0 1 1 3.5zm2.5-1a1 1 0 0 0 0 2h9a1 1 0 1 0 0-2h-9z" />
    </svg>
  )
}

export function VolumeIcon({ size, className, muted }: IconProps & { muted?: boolean }): React.JSX.Element {
  if (muted) {
    return (
      <svg {...S({ size })} className={className} viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.86 5.47a.75.75 0 0 0-1.061 0l-1.47 1.47-1.47-1.47A.75.75 0 0 0 8.8 6.53L10.269 8l-1.47 1.47a.75.75 0 1 0 1.06 1.06l1.47-1.47 1.47 1.47a.75.75 0 0 0 1.06-1.06L12.39 8l1.47-1.47a.75.75 0 0 0 0-1.06z" />
        <path d="M10.116 1.5A.75.75 0 0 0 8.991.85l-6.925 4a3.642 3.642 0 0 0-1.33 4.967 3.639 3.639 0 0 0 1.33 1.332l6.925 4a.75.75 0 0 0 1.125-.649v-1.906a4.73 4.73 0 0 1-1.5-.694v1.3L2.817 9.852a2.141 2.141 0 0 1-.781-2.92c.187-.324.456-.594.78-.782l5.8-3.35v1.3c.45-.313.956-.55 1.5-.694V1.5z" />
      </svg>
    )
  }
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M9.741.85a.75.75 0 0 1 .375.65v13a.75.75 0 0 1-1.125.65l-6.925-4a3.642 3.642 0 0 1-1.33-4.967 3.639 3.639 0 0 1 1.33-1.332l6.925-4a.75.75 0 0 1 .75 0zm-6.924 5.3a2.139 2.139 0 0 0 0 3.7l5.8 3.35V2.8l-5.8 3.35zm8.683 4.29V5.56a2.75 2.75 0 0 1 0 4.88z" />
      <path d="M11.5 13.614a5.752 5.752 0 0 0 0-11.228v1.55a4.252 4.252 0 0 1 0 8.127v1.551z" />
    </svg>
  )
}

export function HeartIcon({ size, className, filled }: IconProps & { filled?: boolean }): React.JSX.Element {
  if (filled) {
    return (
      <svg {...S({ size })} className={className} viewBox="0 0 16 16" fill="currentColor">
        <path d="M15.724 4.22A4.313 4.313 0 0 0 12.192.814a4.269 4.269 0 0 0-3.622 1.13.837.837 0 0 1-1.14 0 4.272 4.272 0 0 0-6.21 5.855l5.916 7.05a1.128 1.128 0 0 0 1.727 0l5.916-7.05a4.228 4.228 0 0 0 .945-3.577z" />
      </svg>
    )
  }
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M1.69 2A4.582 4.582 0 0 1 8 2.023 4.583 4.583 0 0 1 11.88.817h.002a4.618 4.618 0 0 1 3.782 3.65v.003a4.543 4.543 0 0 1-1.011 3.84L9.35 14.629a1.765 1.765 0 0 1-2.093.464 1.762 1.762 0 0 1-.605-.463L1.348 8.309A4.582 4.582 0 0 1 1.689 2zm3.158.252A3.082 3.082 0 0 0 2.49 7.337l.005.005L7.8 13.664a.264.264 0 0 0 .311.069.262.262 0 0 0 .09-.069l5.312-6.33a3.043 3.043 0 0 0 .68-2.573 3.118 3.118 0 0 0-2.551-2.463 3.079 3.079 0 0 0-2.612.816l-.007.007a1.501 1.501 0 0 1-2.045 0l-.009-.008a3.082 3.082 0 0 0-2.121-.861z" />
    </svg>
  )
}

export function MoreIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M3 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm6.5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zM16 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z" />
    </svg>
  )
}

/* F43 · Iconos añadidos para las barras de acción de detalle. */
export function MoreVerticalIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 3a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0 6.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0 6.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
    </svg>
  )
}

export function ShareIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M5.25 2.5a.75.75 0 0 1 0-1.5H14.5a.5.5 0 0 1 .5.5v9.25a.75.75 0 0 1-1.5 0V3.56L2.28 14.78a.75.75 0 1 1-1.06-1.06L12.44 2.5H5.25z" />
    </svg>
  )
}

export function PlusIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M15.25 8a.75.75 0 0 1-.75.75H8.75v5.75a.75.75 0 0 1-1.5 0V8.75H1.5a.75.75 0 0 1 0-1.5h5.75V1.5a.75.75 0 0 1 1.5 0v5.75h5.75a.75.75 0 0 1 .75.75z" />
    </svg>
  )
}

export function MinusIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M15.25 8a.75.75 0 0 1-.75.75H1.5a.75.75 0 0 1 0-1.5h13a.75.75 0 0 1 .75.75z" />
    </svg>
  )
}

// F44 · Icono de plumilla para "Editar" — reemplaza el carácter ✎ que se
// usaba antes en los botones (no encajaba con los SVG del resto).
export function EditIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M11.293 1.293a1 1 0 0 1 1.414 0l2 2a1 1 0 0 1 0 1.414l-9 9A1 1 0 0 1 5 14H3a1 1 0 0 1-1-1v-2a1 1 0 0 1 .293-.707l9-9zM3.5 11.207V12.5h1.293l7.5-7.5-1.293-1.293-7.5 7.5z" />
    </svg>
  )
}

// F57 · Iconos que sustituyen a los emojis/dingbats de la interfaz
// (📊 Recap, ✨ acento dinámico, ✥ posición libre del mini-player).
export function ChartIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5 10a1 1 0 0 1 1 1v8H4v-8a1 1 0 0 1 1-1zm5.5-6a1 1 0 0 1 1 1v14h-2V5a1 1 0 0 1 1-1zM16 13a1 1 0 0 1 1 1v5h-2v-5a1 1 0 0 1 1-1zm5.5-9a1 1 0 0 1 1 1v14h-2V5a1 1 0 0 1 1-1zM2 20h20a1 1 0 1 1 0 2H2a1 1 0 1 1 0-2z" />
    </svg>
  )
}

export function SparkleIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M10 2l1.7 5.6L17.3 9.3l-5.6 1.7L10 16.6 8.3 11 2.7 9.3 8.3 7.6 10 2zm8 10l1.1 3.4L22.5 16.5l-3.4 1.1L18 21l-1.1-3.4-3.4-1.1 3.4-1.1L18 12z" />
    </svg>
  )
}

export function MoveIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1.5l3 3h-2v5h5v-2l3 3-3 3v-2h-5v5h2l-3 3-3-3h2v-5H6v2l-3-3 3-3v2h5v-5H9l3-3z" />
    </svg>
  )
}

export function CheckIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.985 2.383a.75.75 0 0 1 .132 1.052l-7.5 9.5a.75.75 0 0 1-1.077.113l-3.5-3a.75.75 0 1 1 .976-1.138l2.905 2.49 7.014-8.885a.75.75 0 0 1 1.05-.132z" />
    </svg>
  )
}

export function ChevronLeftIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M15.957 2.793a1 1 0 0 1 0 1.414L8.164 12l7.793 7.793a1 1 0 1 1-1.414 1.414L5.336 12l9.207-9.207a1 1 0 0 1 1.414 0z" />
    </svg>
  )
}

export function ChevronRightIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8.043 2.793a1 1 0 0 0 0 1.414L15.836 12l-7.793 7.793a1 1 0 1 0 1.414 1.414L18.664 12 9.457 2.793a1 1 0 0 0-1.414 0z" />
    </svg>
  )
}

export function CloseIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M2.47 2.47a.75.75 0 0 1 1.06 0L8 6.94l4.47-4.47a.75.75 0 1 1 1.06 1.06L9.06 8l4.47 4.47a.75.75 0 1 1-1.06 1.06L8 9.06l-4.47 4.47a.75.75 0 0 1-1.06-1.06L6.94 8 2.47 3.53a.75.75 0 0 1 0-1.06z" />
    </svg>
  )
}

export function MinimizeIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M14 8.75H2v-1.5h12v1.5z" />
    </svg>
  )
}

export function MaximizeIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="3" y="3" width="10" height="10" rx="1" />
    </svg>
  )
}

export function MicIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.426 2.574a2.831 2.831 0 0 0-4.797 1.55l3.247 3.247a2.831 2.831 0 0 0 1.55-4.797zM10.5 8.118l-2.619-2.62A63303.13 63303.13 0 0 0 4.74 9.075L2.065 12.12a1.287 1.287 0 0 0 1.816 1.816l3.06-2.688 3.56-3.129zM7.12 4.094a4.331 4.331 0 1 1 4.786 4.786l-3.974 3.493-3.06 2.689a2.787 2.787 0 0 1-3.933-3.933l2.676-3.045 3.505-3.99z" />
    </svg>
  )
}

export function SettingsIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a1 1 0 0 0-1 1v1.207a7.97 7.97 0 0 0-2.717 1.128L7.05 4.1a1 1 0 0 0-1.414 0L4.222 5.515a1 1 0 0 0 0 1.414l1.234 1.234A7.97 7.97 0 0 0 4.328 10.9H3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h1.328a7.97 7.97 0 0 0 1.128 2.736L4.222 18.87a1 1 0 0 0 0 1.415l1.414 1.414a1 1 0 0 0 1.415 0l1.233-1.234A7.97 7.97 0 0 0 11 21.593V22.8a1 1 0 0 0 1 1h.01a1 1 0 0 0 1-1v-1.207a7.97 7.97 0 0 0 2.716-1.128l1.234 1.234a1 1 0 0 0 1.414 0l1.414-1.414a1 1 0 0 0 0-1.415l-1.233-1.233a7.97 7.97 0 0 0 1.127-2.737H21a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-1.318a7.97 7.97 0 0 0-1.128-2.736l1.234-1.234a1 1 0 0 0 0-1.414L18.373 4.1a1 1 0 0 0-1.414 0l-1.234 1.234A7.97 7.97 0 0 0 13.01 4.207V3a1 1 0 0 0-1-1H12zm.005 6.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z" />
    </svg>
  )
}

export function DownloadIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM1.5 8a6.5 6.5 0 1 1 13 0 6.5 6.5 0 0 1-13 0z" />
      <path d="M7.25 4v4.19L5.53 6.47 4.47 7.53 8 11.06l3.53-3.53-1.06-1.06-1.72 1.72V4h-1.5z" />
    </svg>
  )
}

export function ClockIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8z" />
      <path d="M8 3.25a.75.75 0 0 1 .75.75v3.25H11a.75.75 0 0 1 0 1.5H7.25V4A.75.75 0 0 1 8 3.25z" />
    </svg>
  )
}

export function MusicNoteIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M9 3v12.5A3.5 3.5 0 1 1 5.5 12H7V3h11v9.5A3.5 3.5 0 1 1 14.5 9H16V5H9z" opacity="0.6" />
    </svg>
  )
}

// F58 · Iconos de las categorías del catálogo de selecciones rápidas de
// Inicio (HOME_QUICK_PICK_CATEGORIES), sustituyendo a los emojis 🎧/📻/💡
// que quedaban sin migrar (reloj/destello/gráfico ya reutilizan
// ClockIcon/SparkleIcon/ChartIcon de más arriba).
export function HeadphonesIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3a8 8 0 0 0-8 8v1.17A2.5 2.5 0 0 0 3 14.5v3A2.5 2.5 0 0 0 5.5 20H7a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1H6v-1a6 6 0 1 1 12 0v1h-1a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1.5a2.5 2.5 0 0 0 2.5-2.5v-3a2.5 2.5 0 0 0-1-2.33V11a8 8 0 0 0-8-8z" />
    </svg>
  )
}

export function RadioIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M7.05 4.343a1 1 0 1 0-1.414-1.415L3.222 5.343a1 1 0 0 0 1.414 1.414L7.05 4.343zM3 10a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9zm2 0v9h14v-9H5zm2.5 6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM14 14.75a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1-.75-.75zm.75 2.25a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5z" />
    </svg>
  )
}

export function LightbulbIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a7 7 0 0 0-4 12.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2zm-2 18a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-1h-4v1z" />
    </svg>
  )
}

export function PersonIcon({ size, className }: IconProps): React.JSX.Element {
  return (
    <svg {...S({ size })} className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M10.165 11.101a2.5 2.5 0 0 1-.67 3.766L5.5 17.173A2.998 2.998 0 0 0 4 19.771V20h16v-.228a2.998 2.998 0 0 0-1.5-2.599l-3.995-2.306a2.5 2.5 0 0 1-.67-3.766l.521-.626.002-.002c.8-.955 1.303-1.987 1.375-3.19.041-.706-.088-1.433-.187-1.727a3.717 3.717 0 0 0-.768-1.334 3.767 3.767 0 0 0-5.557 0c-.34.37-.593.82-.768 1.334-.1.294-.228 1.021-.187 1.727.072 1.203.575 2.235 1.375 3.19l.002.002.522.626z" />
    </svg>
  )
}
