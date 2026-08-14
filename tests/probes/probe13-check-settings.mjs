/** SONDA 13 — lectura rápida de los ajustes persistidos (sin tocar nada). */
import { launch } from './_lib.mjs'
const { app, win } = await launch()
await win.waitForTimeout(2000)
console.log('SETTINGS:', JSON.stringify(await win.evaluate(() => window.api.settings.get())))
await app.close()
