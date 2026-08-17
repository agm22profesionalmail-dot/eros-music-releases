/**
 * F36 · Temas predefinidos con colores fijos, inspirados en los Color Themes
 * de Discord Nitro. Cada preset define dos colores ancla (el degradado que se
 * ve en el selector) y un modo claro/oscuro; de ahí se deriva TODA la paleta
 * de la app (fondos, tarjetas, texto, divisores) con el mismo layout de
 * siempre.
 *
 * Reglas de contraste: en presets claros el texto se oscurece (nada de texto
 * blanco fundiéndose con fondos pastel) y en oscuros se mantiene blanco.
 * El acento del usuario (fijo o dinámico) no se toca: el preset solo gobierna
 * las superficies.
 */

export interface ThemePreset {
  id: string
  /** Nombre visible en Ajustes */
  name: string
  /** Color ancla inicial del degradado */
  from: string
  /** Color ancla final del degradado */
  to: string
  /** Decide el texto (oscuro sobre claro / claro sobre oscuro) y el data-theme base */
  mode: 'light' | 'dark'
}

/* Aproximaciones de las tarjetas Nitro: fila 1 (claros), fila 2 (oscuros). */
export const THEME_PRESETS: ThemePreset[] = [
  // ---- Claros ----
  { id: 'mint-apple', name: 'Mint Apple', from: '#a9e8c8', to: '#dcf5de', mode: 'light' },
  { id: 'citrus-sherbert', name: 'Citrus Sherbert', from: '#ffd7a8', to: '#fbedc4', mode: 'light' },
  { id: 'retro-raincloud', name: 'Retro Raincloud', from: '#aebcf0', to: '#d8d4f2', mode: 'light' },
  { id: 'hanami', name: 'Hanami', from: '#f7c2da', to: '#c2ecdc', mode: 'light' },
  { id: 'cotton-candy', name: 'Cotton Candy', from: '#f8c8dc', to: '#f0dcf6', mode: 'light' },
  { id: 'lofi-vibes', name: 'Lofi Vibes', from: '#c3d7f2', to: '#e6d8ee', mode: 'light' },
  { id: 'sweet-morning', name: 'Sweet Morning', from: '#f8e3c0', to: '#fdf4e0', mode: 'light' },
  { id: 'desert-khaki', name: 'Desert Khaki', from: '#d9cfb5', to: '#efe9d6', mode: 'light' },
  // ---- Oscuros ----
  // F60 · Tema café de la casa (a juego con el logo). Default para usuarios nuevos.
  { id: 'coffee-cream', name: 'Coffee Cream', from: '#6b4527', to: '#241105', mode: 'dark' },
  { id: 'crimson-moon', name: 'Crimson Moon', from: '#7a1420', to: '#14060a', mode: 'dark' },
  { id: 'midnight-burst', name: 'Midnight Burst', from: '#1c1650', to: '#070417', mode: 'dark' },
  { id: 'mars', name: 'Mars', from: '#6d3a2d', to: '#26110b', mode: 'dark' },
  { id: 'dusk', name: 'Dusk', from: '#4e4a6e', to: '#232135', mode: 'dark' },
  { id: 'under-the-sea', name: 'Under the Sea', from: '#3a5c50', to: '#141f1a', mode: 'dark' },
  { id: 'retro-storm', name: 'Retro Storm', from: '#49566a', to: '#1a1f27', mode: 'dark' },
  { id: 'sunset', name: 'Sunset', from: '#a85a32', to: '#221007', mode: 'dark' },
  { id: 'aurora', name: 'Aurora', from: '#14424e', to: '#0e2f24', mode: 'dark' },
  { id: 'forest', name: 'Forest', from: '#2c4a26', to: '#0e1a0c', mode: 'dark' },
  { id: 'neon-nights', name: 'Neon Nights', from: '#2e46c8', to: '#0d1340', mode: 'dark' }
]

export function getThemePreset(id: string | undefined): ThemePreset | null {
  if (!id || id === 'none') return null
  return THEME_PRESETS.find((p) => p.id === id) ?? null
}

// ---------- Derivación de paleta ----------

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.length === 4 ? '#' + [...hex.slice(1)].map((c) => c + c).join('') : hex
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16)
  ]
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h * 360, s, l]
}

function hslCss(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`
}

/** Conserva el tono del ancla, capa la saturación y fija la luminosidad. */
function shade(hex: string, l: number, sCap = 0.4): string {
  const [h, s] = rgbToHsl(...hexToRgb(hex))
  return hslCss(h, Math.min(s, sCap), l)
}

function mixHex(a: string, b: string, t: number): string {
  const ra = hexToRgb(a)
  const rb = hexToRgb(b)
  const m = ra.map((v, i) => Math.round(v * (1 - t) + rb[i] * t)) as [number, number, number]
  return '#' + m.map((v) => v.toString(16).padStart(2, '0')).join('')
}

/** Variables CSS que un preset gobierna (para poder limpiarlas al desactivar). */
export const PRESET_VAR_KEYS = [
  '--bg-app',
  '--bg-base',
  '--bg-highlight',
  '--bg-elevated',
  '--bg-press',
  '--bg-card',
  '--bg-card-hover',
  '--bg-tinted',
  '--bg-tinted-hover',
  '--text-primary',
  '--text-secondary',
  '--text-subdued',
  '--divider',
  '--shadow-card'
] as const

/**
 * Deriva la paleta completa de un preset. `--bg-app` es un degradado real
 * (solo se usa en `background:`), el resto son superficies planas con el
 * tinte de los anclas.
 */
export function buildPresetVars(p: ThemePreset): Record<string, string> {
  const mid = mixHex(p.from, p.to, 0.5)
  if (p.mode === 'dark') {
    return {
      '--bg-app': `linear-gradient(160deg, ${shade(p.from, 0.13, 0.55)} 0%, ${shade(mid, 0.08, 0.5)} 55%, ${shade(p.to, 0.05, 0.5)} 100%)`,
      '--bg-base': shade(p.from, 0.115, 0.35),
      '--bg-highlight': shade(p.from, 0.15, 0.35),
      '--bg-elevated': shade(mid, 0.18, 0.35),
      '--bg-press': shade(mid, 0.22, 0.35),
      '--bg-card': shade(p.from, 0.13, 0.35),
      '--bg-card-hover': shade(p.from, 0.18, 0.35),
      '--bg-tinted': 'rgba(255, 255, 255, 0.07)',
      '--bg-tinted-hover': 'rgba(255, 255, 255, 0.12)',
      '--text-primary': '#ffffff',
      '--text-secondary': shade(p.from, 0.74, 0.18),
      '--text-subdued': shade(p.from, 0.52, 0.14),
      '--divider': shade(mid, 0.24, 0.3),
      '--shadow-card': '0 8px 24px rgba(0, 0, 0, 0.5)'
    }
  }
  return {
    '--bg-app': `linear-gradient(160deg, ${shade(p.from, 0.84, 0.75)} 0%, ${shade(mid, 0.89, 0.7)} 55%, ${shade(p.to, 0.87, 0.7)} 100%)`,
    '--bg-base': shade(p.from, 0.955, 0.6),
    '--bg-highlight': shade(p.from, 0.92, 0.55),
    '--bg-elevated': shade(mid, 0.88, 0.5),
    '--bg-press': shade(mid, 0.84, 0.5),
    '--bg-card': shade(p.from, 0.945, 0.55),
    '--bg-card-hover': shade(p.from, 0.9, 0.55),
    '--bg-tinted': 'rgba(0, 0, 0, 0.06)',
    '--bg-tinted-hover': 'rgba(0, 0, 0, 0.11)',
    // Texto oscuro con una gota del tinte del preset: contraste sin gris plano
    '--text-primary': shade(p.from, 0.13, 0.28),
    '--text-secondary': shade(p.from, 0.32, 0.22),
    '--text-subdued': shade(p.from, 0.48, 0.16),
    '--divider': shade(mid, 0.78, 0.35),
    '--shadow-card': '0 8px 24px rgba(0, 0, 0, 0.12)'
  }
}

/**
 * Aplica (o retira, con `null`) un preset sobre `document.documentElement`.
 * Devuelve el `data-theme` base que debe acompañarlo para que las reglas CSS
 * por tema (nav-circle claro, scrollbars…) sigan funcionando.
 */
export function applyPresetToDom(preset: ThemePreset | null): 'light' | 'dark' | null {
  const root = document.documentElement
  if (!preset) {
    delete root.dataset.themePreset
    for (const k of PRESET_VAR_KEYS) root.style.removeProperty(k)
    return null
  }
  root.dataset.themePreset = preset.id
  const vars = buildPresetVars(preset)
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
  return preset.mode
}
