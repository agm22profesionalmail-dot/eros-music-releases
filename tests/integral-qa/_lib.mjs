/**
 * Harness común para la QA integral.
 * Silencio absoluto: audio muted en cuanto abre la primera ventana, se remonta
 * por cualquier nuevo <audio> mediante MutationObserver, y no imprime ruido en consola
 * salvo errores del renderer / eventos [main] filtrados.
 */
import { _electron } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const shots = join(root, 'tests', 'integral-qa', 'shots')
mkdirSync(shots, { recursive: true })

const ts = () => new Date().toISOString().slice(11, 23)

export const R = { ok: [], warn: [], bug: [], skip: [], sectionOrder: [], bySection: {} }

export function note(section, level, name, detail = '') {
  if (!['ok', 'warn', 'bug', 'skip'].includes(level)) level = 'warn'
  const entry = { section, level, name, detail, at: ts() }
  R[level].push(entry)
  if (!R.bySection[section]) {
    R.bySection[section] = []
    R.sectionOrder.push(section)
  }
  R.bySection[section].push(entry)
  const badge = level === 'ok' ? 'OK  ' : level === 'warn' ? 'WARN' : level === 'bug' ? 'BUG ' : 'SKIP'
  console.log(`  ${badge} [${section}] ${name}${detail ? ` — ${detail}` : ''}`)
}

/** Ejecuta un bloque tolerante a fallos: si lanza, marca SKIP en la sección y sigue. */
export async function block(section, fn) {
  const t0 = Date.now()
  try {
    await fn()
    const ms = Date.now() - t0
    console.log(`  --  [${section}] bloque completo (${(ms / 1000).toFixed(1)}s)`)
  } catch (e) {
    const msg = (e && (e.message || e.stack || String(e))) || 'unknown'
    note(section, 'skip', 'bloque abortó', msg.slice(0, 220))
  }
}

export async function launch({ silent = true } = {}) {
  const app = await _electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, EROS_E2E: '1' }
  })
  const mainLog = []
  const mainErrLog = []
  app.process().stdout?.on('data', (d) => {
    const s = String(d).trim()
    if (s) mainLog.push(`[${ts()}] ${s}`)
  })
  app.process().stderr?.on('data', (d) => {
    const s = String(d).trim()
    if (!s) return
    mainErrLog.push(`[${ts()}] ${s}`)
    if (!silent && !s.includes('Parser')) console.log('[main:err]', s)
  })

  const win = await app.firstWindow()
  const rendererLog = []
  const rendererErrs = []
  win.on('console', (msg) => {
    const t = msg.type()
    const line = `[${ts()}] [renderer:${t}] ${msg.text()}`
    rendererLog.push(line)
    if (t === 'error') rendererErrs.push(msg.text())
  })
  win.on('pageerror', (err) => {
    rendererErrs.push(`pageerror: ${err.message}`)
  })

  await win.waitForLoadState('domcontentloaded')
  await muteAll(win)
  return { app, win, mainLog, mainErrLog, rendererLog, rendererErrs }
}

export async function muteAll(win) {
  await win
    .evaluate(() => {
      const mute = () => document.querySelectorAll('audio').forEach((a) => (a.muted = true))
      mute()
      if (!window.__mutedObserver) {
        window.__mutedObserver = new MutationObserver(mute)
        window.__mutedObserver.observe(document.body, { childList: true, subtree: true })
      }
      // También bajar volumen del store de Zustand por si acaso
      try {
        window.__ml_audios_muted = true
      } catch {
        /* noop */
      }
    })
    .catch(() => {})
}

export async function waitForSignedIn(win, timeoutMs = 25000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const st = await win.evaluate(() => window.api.auth.getState())
    if (st?.status === 'signedIn') return st
    await win.waitForTimeout(500)
  }
  return await win.evaluate(() => window.api.auth.getState())
}

export async function shot(win, name) {
  const p = join(shots, `${name}.png`)
  try {
    await win.screenshot({ path: p })
  } catch {
    /* noop */
  }
  return p
}

export function saveJson(name, obj) {
  writeFileSync(join(shots, '..', name), JSON.stringify(obj, null, 2))
}
