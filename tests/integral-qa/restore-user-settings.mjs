// Restaura los ajustes al estado previo real del usuario, tal y como estaban antes
// de la sesión de QA. Lee settingsBefore de results.json.
import { readFileSync } from 'fs'
import { launch } from './_lib.mjs'

const results = JSON.parse(readFileSync('tests/integral-qa/results.json', 'utf8'))
const target = results.settingsBefore
if (!target) throw new Error('sin settingsBefore en results.json')

const { app, win } = await launch({ silent: true })
await win.waitForTimeout(1500)
// Mute cualquier audio
await win.evaluate(() => document.querySelectorAll('audio').forEach((a) => (a.muted = true))).catch(() => {})

await win.evaluate((patch) => window.api.settings.set(patch), target)
await win.waitForTimeout(600)
const after = await win.evaluate(() => window.api.settings.get())
const diffs = Object.keys(target).filter((k) => {
  const a = target[k]
  const b = after[k]
  return Array.isArray(a) ? JSON.stringify(a) !== JSON.stringify(b) : a !== b
})
console.log('diffs:', diffs)
console.log('OK — ajustes del usuario restaurados')
await app.close().catch(() => {})
process.exit(0)
