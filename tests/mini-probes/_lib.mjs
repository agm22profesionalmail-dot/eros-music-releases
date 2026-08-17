/**
 * Harness compartido de las sondas QA del mini-player.
 */
import { _electron } from 'playwright'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const shots = join(root, 'tests', 'mini-probes', 'shots')
mkdirSync(shots, { recursive: true })

const ts = () => new Date().toISOString().slice(11, 23)

export async function launch({ label = 'probe' } = {}) {
  const app = await _electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, EROS_E2E: '1' }
  })
  const mainLog = []
  app.process().stdout?.on('data', (d) => {
    const s = String(d).trim()
    if (s) mainLog.push(`[${ts()}] [main] ${s}`)
  })
  app.process().stderr?.on('data', (d) => {
    const s = String(d).trim()
    if (s) mainLog.push(`[${ts()}] [main:err] ${s}`)
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

export async function waitForSignedIn(win, timeoutMs = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const st = await win.evaluate(() => window.api.auth.getState())
    if (st?.status === 'signedIn') return st
    await win.waitForTimeout(500)
  }
  return await win.evaluate(() => window.api.auth.getState())
}

/** Reproduce la primera pista de una búsqueda dada. */
export async function playFirstSearchResult(win, query) {
  await win.locator('.sidebar-nav-item', { hasText: 'Buscar' }).click()
  await win.locator('.topbar-search input').fill('')
  await win.locator('.topbar-search input').fill(query)
  await win.locator('.track-row').first().waitFor({ state: 'visible', timeout: 20000 })
  await win.waitForTimeout(700)
  await win.locator('.track-row').first().hover()
  await win.locator('.track-row').first().locator('.play-hover').click()
  await win.locator('.np-left .title').waitFor({ state: 'visible', timeout: 20000 })
  await win.waitForTimeout(1500)
  return (await win.locator('.np-left .title').textContent()) ?? ''
}

/** Abre el mini-player y espera a que aparezca. */
export async function openMini(app, win) {
  await win.locator('[aria-label="Mini-player"]').click()
  let mini = null
  for (let i = 0; i < 24 && !mini; i++) {
    await win.waitForTimeout(300)
    mini = app.windows().find((w) => w.url().includes('#/mini') && !w.url().includes('mini-settings'))
  }
  if (mini) {
    await mini.waitForLoadState('domcontentloaded')
    await mini.waitForTimeout(1500)
  }
  return mini
}

export function reportRow(rows, id, name, result, detail = '', shot = '') {
  const r = { id, name, result, detail, shot }
  rows.push(r)
  const tag = result === 'OK' ? 'OK  ' : result === 'BUG' ? 'BUG ' : 'WARN'
  console.log(`${tag} #${id} ${name}${detail ? ` — ${detail}` : ''}`)
  return r
}
