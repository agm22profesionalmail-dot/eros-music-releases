/**
 * Harness compartido de las sondas QA.
 * Lanza la app con captura completa de consola renderer + stdout/stderr del main.
 */
import { _electron } from 'playwright'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const shots = join(root, 'tests', 'probes', 'shots')
mkdirSync(shots, { recursive: true })

const ts = () => new Date().toISOString().slice(11, 23)

export async function launch({ label = 'probe' } = {}) {
  const app = await _electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, METROLIST_E2E: '1' }
  })
  const mainLog = []
  app.process().stdout?.on('data', (d) => {
    const s = String(d).trim()
    if (s) {
      mainLog.push(`[${ts()}] [main] ${s}`)
      console.log(`[main] ${s}`)
    }
  })
  app.process().stderr?.on('data', (d) => {
    const s = String(d).trim()
    if (s) {
      mainLog.push(`[${ts()}] [main:err] ${s}`)
      console.log(`[main:err] ${s}`)
    }
  })
  const win = await app.firstWindow()
  const rendererLog = []
  win.on('console', (msg) => {
    const line = `[${ts()}] [renderer:${msg.type()}] ${msg.text()}`
    rendererLog.push(line)
    if (['error', 'warning'].includes(msg.type())) console.log(line)
  })
  win.on('pageerror', (err) => {
    const line = `[${ts()}] [renderer:pageerror] ${err.message}`
    rendererLog.push(line)
    console.log(line)
  })
  await win.waitForLoadState('domcontentloaded')
  return { app, win, mainLog, rendererLog }
}

/** Espera a que la sesión esté iniciada (o agota el tiempo). */
export async function waitForSignedIn(win, timeoutMs = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const st = await win.evaluate(() => window.api.auth.getState())
    if (st?.status === 'signedIn') return st
    await win.waitForTimeout(500)
  }
  return await win.evaluate(() => window.api.auth.getState())
}

export const R = { ok: [], bug: [] }
export function report(kind, name, detail = '') {
  const line = `${kind.toUpperCase().padEnd(4)} ${name}${detail ? ` — ${detail}` : ''}`
  console.log(line)
  ;(kind === 'ok' ? R.ok : R.bug).push(line)
}
