/**
 * F62 · Contraste de texto sobre superficies que siguen al tema.
 *
 * Regresión que motiva el test: `.chip.active` pintaba su texto con
 * `color: var(--bg-app)`, pero en los temas predefinidos `--bg-app` es un
 * `linear-gradient` — `color: <gradiente>` es inválido, así que el texto caía
 * a heredar `--text-primary`, exactamente el color de su propio fondo
 * (invisible en presets oscuros y claros por igual).
 *
 * Recorre los 3 temas clásicos + los 18 presets y mide el contraste WCAG real
 * (getComputedStyle) de cada superficie afectada. Perfil aislado: no toca los
 * ajustes del usuario.
 *
 *   node tests/f62-contrast.mjs
 */
import { _electron } from 'playwright'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const profile = mkdtempSync(join(tmpdir(), 'eros-f62-'))

let failures = 0
const check = (name, cond, detail = '') => {
  console.log(cond ? `  OK   ${name}` : `  FAIL ${name} ${detail}`)
  if (!cond) failures++
}

const app = await _electron.launch({
  args: ['.'],
  cwd: root,
  env: { ...process.env, EROS_E2E: '1', EROS_E2E_PROFILE: profile }
})
const win = await app.firstWindow()
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(2500)

// Banco de pruebas: cada superficie con el texto/icono que lleva encima.
await win.evaluate(() => {
  const host = document.createElement('div')
  host.id = 'f62-probe'
  host.style.cssText = 'position:fixed;left:-9999px;top:0'
  host.innerHTML = `
    <button class="chip active" data-probe="chip.active">Reactivo</button>
    <button class="np-play" data-probe="np-play"><svg width="16" height="16"><rect width="16" height="16" fill="currentColor"/></svg></button>
    <span class="explicit-badge" data-probe="explicit-badge">E</span>
    <button class="btn btn-primary" data-probe="btn-primary">Guardar</button>
    <button class="big-play" data-probe="big-play">P</button>`
  document.body.appendChild(host)
})

const THEMES = [
  { theme: 'dark', themePreset: 'none' },
  { theme: 'black', themePreset: 'none' },
  { theme: 'light', themePreset: 'none' },
  ...(await win.evaluate(() =>
    (window.__erosMusicThemePresets ?? []).map((p) => ({ theme: 'dark', themePreset: p.id }))
  ))
]

// Si el renderer no expone el catálogo, se usa la lista conocida (F60).
if (THEMES.length === 3) {
  for (const id of [
    'mint-apple', 'citrus-sherbert', 'retro-raincloud', 'hanami', 'cotton-candy',
    'lofi-vibes', 'sweet-morning', 'desert-khaki', 'coffee-cream', 'crimson-moon',
    'midnight-burst', 'mars', 'dusk', 'under-the-sea', 'retro-storm', 'sunset',
    'aurora', 'forest', 'neon-nights'
  ]) {
    THEMES.push({ theme: 'dark', themePreset: id })
  }
}

const MIN_RATIO = 4.5 // AA para texto normal

for (const t of THEMES) {
  await win.evaluate((s) => window.api.settings.set(s), t)
  await win.waitForTimeout(220)

  const measures = await win.evaluate(() => {
    const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
    const parse = (v) => {
      const m = v.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/)
      return m ? [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255] : null
    }
    const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
    const out = []
    for (const el of document.querySelectorAll('#f62-probe [data-probe]')) {
      const cs = getComputedStyle(el)
      const fg = parse(cs.color)
      const bg = parse(cs.backgroundColor)
      if (!fg || !bg) {
        out.push({ name: el.dataset.probe, ratio: 0, fg: cs.color, bg: cs.backgroundColor })
        continue
      }
      const a = lum(fg) + 0.05
      const b = lum(bg) + 0.05
      out.push({
        name: el.dataset.probe,
        ratio: Math.round((Math.max(a, b) / Math.min(a, b)) * 100) / 100,
        fg: cs.color,
        bg: cs.backgroundColor
      })
    }
    return out
  })

  const label = t.themePreset === 'none' ? `tema ${t.theme}` : `preset ${t.themePreset}`
  const worst = measures.reduce((w, m) => (m.ratio < w.ratio ? m : w), measures[0])
  check(
    `${label.padEnd(26)} peor contraste ${String(worst.ratio).padStart(6)}:1 (${worst.name})`,
    worst.ratio >= MIN_RATIO,
    `\n       ${worst.name}: color ${worst.fg} sobre ${worst.bg}`
  )
}

// Restaura el default del perfil de test y cierra
await win.evaluate(() => window.api.settings.set({ theme: 'dark', themePreset: 'coffee-cream' }))
await app.close()

console.log(failures ? `\n${failures} fallo(s)` : `\nTodo OK (${THEMES.length} temas)`)
process.exit(failures ? 1 : 0)
