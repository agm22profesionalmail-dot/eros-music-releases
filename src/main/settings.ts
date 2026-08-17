import { app, dialog, shell, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join, basename } from 'path'
import { getSetting, setSetting, getDb } from './db'
import {
  DEFAULT_LYRICS_PROVIDERS,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  DEFAULT_STREAMING_SOURCES,
  type AppSettings,
  type LyricsProvider,
  type StreamingSource,
  type UserProfile
} from '@shared/types'

/** Ajustes de la app persistidos en SQLite. */

/**
 * F65 · Carpeta de descargas por defecto: la carpeta Música del usuario
 * (p. ej. C:\Users\X\Music\ERO'S Music). El default antiguo era
 * F:\MetrolistPC\Music — la carpeta del PROYECTO, que solo existe en el
 * equipo del developer y además enseñaba el nombre interno en Ajustes.
 * La carpeta del proyecto F:\MetrolistPC sigue igual (interna al dev);
 * cualquier ruta ya guardada en BD (`downloads.dir`) prevalece siempre.
 * `app.getPath('music')` requiere la app lista; si aún no lo está
 * (llamada muy temprana), caemos a ~\Music.
 */
export function defaultDownloadsDir(): string {
  const music = app.isReady() ? app.getPath('music') : join(homedir(), 'Music')
  return join(music, "ERO'S Music")
}

export function getAllSettings(): AppSettings {
  const stored = getSetting<Partial<AppSettings>>('app.settings', {})
  const merged: AppSettings = { ...DEFAULT_SETTINGS, ...stored }
  if (!merged.downloadsDir) {
    merged.downloadsDir = getSetting('downloads.dir', defaultDownloadsDir())
  }
  // F29 · rellena defaults si el usuario venía de una versión previa (o si el
  // array quedó vacío/corrupto). No perdemos configuración: si tiene al
  // menos una fuente válida guardada, la respetamos tal cual.
  const rawSources = Array.isArray(stored?.streamingSources) ? stored.streamingSources : null
  if (!rawSources || rawSources.length === 0) {
    merged.streamingSources = DEFAULT_STREAMING_SOURCES.map((s) => ({ ...s }))
  } else {
    merged.streamingSources = rawSources
      .filter((s): s is StreamingSource => !!s && typeof s.id === 'string')
      .map((s) => ({ id: s.id, enabled: s.enabled !== false }))
  }
  if (typeof merged.useYtDlpFallback !== 'boolean') merged.useYtDlpFallback = true
  // F30 · idem para la cadena de proveedores de letras. Respetamos el orden
  // guardado si al menos hay una entrada válida; si no, sembramos defaults.
  const rawProviders = Array.isArray(stored?.lyricsProviders) ? stored.lyricsProviders : null
  if (!rawProviders || rawProviders.length === 0) {
    merged.lyricsProviders = DEFAULT_LYRICS_PROVIDERS.map((p) => ({ ...p }))
  } else {
    merged.lyricsProviders = rawProviders
      .filter((p): p is LyricsProvider => !!p && typeof p.id === 'string')
      .map((p) => ({ id: p.id, enabled: p.enabled !== false }))
  }
  if (typeof merged.romanizeLyrics !== 'boolean') merged.romanizeLyrics = false
  // F36 · tema predefinido: defensivo si viene de una versión previa sin campo
  if (typeof merged.themePreset !== 'string') merged.themePreset = 'none'
  // F34 · idioma de la UI: defensivo si viene de una versión previa sin campo.
  if (
    merged.uiLanguage !== 'auto' &&
    merged.uiLanguage !== 'es' &&
    merged.uiLanguage !== 'en'
  ) {
    merged.uiLanguage = 'auto'
  }
  // F50 · Migración one-shot: el crossfade debe sonar SIEMPRE en las
  // transiciones naturales. El default antiguo desactivaba el fundido entre
  // pistas del mismo álbum ("gapless") y en la práctica se percibía como
  // "el crossfade a veces no funciona". Se ejecuta una sola vez; si después
  // el usuario reactiva el ajuste en Ajustes, se respeta su elección.
  if (!getSetting('migrations.f50CrossfadeAlways', false)) {
    merged.disableCrossfadeOnGapless = false
    setSetting('app.settings', merged)
    setSetting('migrations.f50CrossfadeAlways', true)
  }
  // F61 · Migración one-shot (v1.2.0): quien actualiza desde una versión
  // anterior también debe ver el onboarding UNA vez. No toca nada de
  // autenticación: si la sesión de Google sigue viva, el wizard salta el
  // paso `login` por sí solo (lo decide onboardingStore con auth.status).
  if (!getSetting('migrations.f61OnboardingIntroduced', false)) {
    setOnboardingCompleted(false)
    setSetting('migrations.f61OnboardingIntroduced', true)
  }
  return merged
}

// ---------- Onboarding (F61) ----------

/** ¿El usuario ya completó (o saltó) el asistente de bienvenida? */
export function getOnboardingCompleted(): boolean {
  // En modo E2E el asistente no debe interceptar la UI: los runners arrancan
  // con perfiles vírgenes (o con el real recién migrado) y el overlay taparía
  // la app entera para las suites existentes. Mismo patrón que el gancho
  // e2e-upnext del IPC (F50).
  if (process.env.EROS_E2E || process.env.EROS_E2E_PROFILE) return true
  return getSetting('onboarding.completed', false)
}

export function setOnboardingCompleted(v: boolean): void {
  setSetting('onboarding.completed', v)
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const merged = { ...getAllSettings(), ...patch }
  setSetting('app.settings', merged)
  if (patch.downloadsDir) setSetting('downloads.dir', patch.downloadsDir)
  return merged
}

// ---------- Perfil de usuario (F20) ----------

/** Devuelve el perfil almacenado, fusionado con los valores por defecto. */
export function getProfile(): UserProfile {
  const stored = getSetting<Partial<UserProfile>>('app.profile', {})
  return {
    ...DEFAULT_PROFILE,
    ...stored,
    // Fuerza arrays (defensivo si el JSON viejo tuviera undefined)
    favoriteArtists: Array.isArray(stored?.favoriteArtists) ? stored.favoriteArtists : [],
    publicPlaylistIds: Array.isArray(stored?.publicPlaylistIds) ? stored.publicPlaylistIds : []
  }
}

/** Aplica un parche parcial al perfil y devuelve el perfil resultante. */
export function setProfile(patch: Partial<UserProfile>): UserProfile {
  const merged: UserProfile = { ...getProfile(), ...patch }
  // Sanea bio a 200 chars y displayName a 40 chars por si el renderer se salta el límite
  if (typeof merged.bio === 'string' && merged.bio.length > 200) merged.bio = merged.bio.slice(0, 200)
  if (typeof merged.displayName === 'string' && merged.displayName.length > 40) {
    merged.displayName = merged.displayName.slice(0, 40)
  }
  setSetting('app.profile', merged)
  return merged
}

/**
 * Cambia la carpeta de descargas: abre el selector, mueve los ficheros ya
 * descargados a la nueva ubicación (p. ej. un disco externo) y actualiza
 * las rutas registradas en la base de datos.
 */
export async function changeDownloadsDir(
  parent: BrowserWindow | null
): Promise<{ dir: string; moved: number } | null> {
  const current = getAllSettings().downloadsDir
  const result = await dialog.showOpenDialog(parent ?? new BrowserWindow({ show: false }), {
    title: 'Elige la carpeta de descargas de música',
    defaultPath: current,
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || !result.filePaths.length) return null
  const newDir = result.filePaths[0]
  if (newDir === current) return { dir: newDir, moved: 0 }

  await fs.mkdir(newDir, { recursive: true })

  // Mueve las descargas existentes y actualiza las rutas en la BD
  const db = getDb()
  const rows = db.prepare('SELECT video_id, file_path FROM downloads').all() as {
    video_id: string
    file_path: string
  }[]
  let moved = 0
  for (const row of rows) {
    const target = join(newDir, basename(row.file_path))
    try {
      await fs.rename(row.file_path, target).catch(async (err) => {
        // rename falla entre discos distintos: copia + borra
        if ((err as NodeJS.ErrnoException)?.code === 'EXDEV') {
          await fs.copyFile(row.file_path, target)
          await fs.unlink(row.file_path)
        } else if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
          throw err
        }
      })
      db.prepare('UPDATE downloads SET file_path = ? WHERE video_id = ?').run(target, row.video_id)
      moved++
    } catch {
      /* fichero bloqueado o desaparecido: se conserva el registro antiguo */
    }
  }

  updateSettings({ downloadsDir: newDir })
  return { dir: newDir, moved }
}

export async function openDownloadsDir(): Promise<void> {
  const dir = getAllSettings().downloadsDir
  await fs.mkdir(dir, { recursive: true }).catch(() => undefined)
  await shell.openPath(dir)
}
