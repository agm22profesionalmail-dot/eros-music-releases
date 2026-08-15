/**
 * F28 · Filtros de contenido.
 *
 * Verifica:
 *  1. Nuevos ajustes se persisten (hideExplicit/hideVideos/hideShorts + idioma/país + toggles artista).
 *  2. Con hideExplicit/hideVideos activos, una búsqueda ("daft punk") NO devuelve
 *     tracks con isExplicit:true ni con kind:'video'.
 *  3. Con showArtistSubscribers=false, la línea de suscriptores NO aparece
 *     en la página del artista.
 *  4. Restaura todos los ajustes a los valores por defecto sensatos y cierra.
 *
 * SILENCIO ABSOLUTO: ventana minimizada + audio silenciado.
 */
import { _electron } from 'playwright'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shots = join(root, 'tests', 'shots', 'f28')
mkdirSync(shots, { recursive: true })

let failures = 0
const check = (name, cond) => {
  console.log(cond ? `  OK  ${name}` : `  FAIL ${name}`)
  if (!cond) failures++
}

const app = await _electron.launch({
  args: ['.'],
  cwd: root,
  env: { ...process.env, METROLIST_E2E: '1' }
})

const win = await app.firstWindow()
// SILENCIO: minimiza inmediatamente
await win.evaluate(() => window.api.win.minimize()).catch(() => undefined)
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(1500)
// Silencia todo <audio> (existente y futuro)
await win.evaluate(() => {
  const mute = () => document.querySelectorAll('audio').forEach((a) => (a.muted = true))
  mute()
  new MutationObserver(mute).observe(document.body, { childList: true, subtree: true })
})

const originalSettings = await win.evaluate(() => window.api.settings.get())

// -----------------------------------------------------------------
// 1. Persistencia de ajustes
// -----------------------------------------------------------------
console.log('\n[1] Persistencia de ajustes F28')
await win.evaluate(() =>
  window.api.settings.set({
    hideExplicit: true,
    hideVideos: true,
    hideShorts: true,
    contentLanguage: 'en',
    contentCountry: 'US',
    showArtistDescription: false,
    showArtistSubscribers: false,
    showArtistMonthlyListeners: false,
    pauseOnAudioDeviceChange: true
  })
)
const s1 = await win.evaluate(() => window.api.settings.get())
check('hideExplicit persiste', s1.hideExplicit === true)
check('hideVideos persiste', s1.hideVideos === true)
check('hideShorts persiste', s1.hideShorts === true)
check('contentLanguage persiste', s1.contentLanguage === 'en')
check('contentCountry persiste', s1.contentCountry === 'US')
check('showArtistDescription persiste', s1.showArtistDescription === false)
check('showArtistSubscribers persiste', s1.showArtistSubscribers === false)
check('showArtistMonthlyListeners persiste', s1.showArtistMonthlyListeners === false)
check('pauseOnAudioDeviceChange persiste', s1.pauseOnAudioDeviceChange === true)

// -----------------------------------------------------------------
// 2. Filtro de contenido en búsqueda
// -----------------------------------------------------------------
console.log('\n[2] Búsqueda con filtros activos')
const authState = await win.evaluate(() => window.api.auth.getState())
if (authState.status !== 'signedIn') {
  console.log('  (sesión no iniciada — se salta la búsqueda de red)')
} else {
  try {
    const res = await win.evaluate(() => window.api.music.search('daft punk', 'all'))
    const allTracks = [...(res.songs ?? []), ...(res.videos ?? [])]
    const anyExplicit = allTracks.some((t) => t.isExplicit === true)
    const anyVideo = allTracks.some((t) => t.kind === 'video')
    check('sin tracks con isExplicit=true', !anyExplicit)
    check('sin tracks con kind=video', !anyVideo)
    check('resultados no vacíos', allTracks.length + (res.albums?.length ?? 0) + (res.artists?.length ?? 0) > 0)
  } catch (err) {
    console.log('  (búsqueda falló, se salta:', String(err?.message ?? err), ')')
  }
}

// -----------------------------------------------------------------
// 3. Página del artista con suscriptores ocultos
// -----------------------------------------------------------------
console.log('\n[3] Página del artista: toggles ocultan bloques')
// Fuerza sólo showArtistSubscribers=false (el resto puede estar como el usuario prefiera)
await win.evaluate(() => window.api.settings.set({ showArtistSubscribers: false }))
if (authState.status === 'signedIn') {
  try {
    // Buscamos un artista real para navegar
    const res = await win.evaluate(() => window.api.music.search('daft punk', 'artist'))
    const artistCard = res.artists?.[0]
    if (artistCard?.id) {
      await win.evaluate((id) => {
        location.hash = `#/artist/${encodeURIComponent(id)}`
      }, artistCard.id)
      await win.waitForTimeout(1500)
      const subsCount = await win.locator('[data-testid="artist-subscribers"]').count()
      check('línea de suscriptores oculta', subsCount === 0)
    } else {
      console.log('  (sin artista disponible — se salta)')
    }
  } catch (err) {
    console.log('  (navegación al artista falló, se salta:', String(err?.message ?? err), ')')
  }
} else {
  console.log('  (sesión no iniciada — se salta la navegación al artista)')
}

// -----------------------------------------------------------------
// 4. RESTAURA todos los ajustes a valores por defecto sensatos
// -----------------------------------------------------------------
console.log('\n[4] Restaurando ajustes a valores por defecto')
await win.evaluate(() =>
  window.api.settings.set({
    hideExplicit: false,
    hideVideos: false,
    hideShorts: true,
    contentLanguage: 'auto',
    contentCountry: 'auto',
    showArtistDescription: true,
    showArtistSubscribers: true,
    showArtistMonthlyListeners: true,
    pauseOnAudioDeviceChange: false
  })
)
const finalSettings = await win.evaluate(() => window.api.settings.get())
check('hideExplicit restaurado a false', finalSettings.hideExplicit === false)
check('hideVideos restaurado a false', finalSettings.hideVideos === false)
check('hideShorts restaurado a true', finalSettings.hideShorts === true)
check('contentLanguage restaurado a auto', finalSettings.contentLanguage === 'auto')
check('contentCountry restaurado a auto', finalSettings.contentCountry === 'auto')
check('showArtistDescription restaurado a true', finalSettings.showArtistDescription === true)
check('showArtistSubscribers restaurado a true', finalSettings.showArtistSubscribers === true)
check('showArtistMonthlyListeners restaurado a true', finalSettings.showArtistMonthlyListeners === true)
check('pauseOnAudioDeviceChange restaurado a false', finalSettings.pauseOnAudioDeviceChange === false)

// Silencia el 'unused' de originalSettings
void originalSettings

await app.close()
console.log(failures === 0 ? '\nF28 · TODO OK' : `\nF28 · ${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
