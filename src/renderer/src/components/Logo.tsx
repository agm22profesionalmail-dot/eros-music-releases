/** Logo de Metrolist PC: "M" blanca sobre gradiente rojo (identidad Metrolist). */

export function Logo({ size = 24 }: { size?: number }): React.JSX.Element {
  const id = `mlg-${size}`
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff5f6d" />
          <stop offset="1" stopColor="#d62839" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="11" fill={`url(#${id})`} />
      <path
        d="M13 33.5 V16.5 L24 28 L35 16.5 V33.5"
        stroke="#ffffff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
