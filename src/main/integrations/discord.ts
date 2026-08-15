import { Client } from '@xhayper/discord-rpc'
import { getProfile } from '../settings'

/**
 * Discord Rich Presence: muestra la canción en curso en el perfil de Discord.
 * Usa el application id público "YouTube Music" (el mismo que el proyecto
 * th-ch/youtube-music); configurable por si el usuario quiere el suyo.
 *
 * Conexión perezosa con reintentos suaves: si Discord no está abierto no
 * pasa nada, se reintenta al cambiar de canción.
 *
 * F25 · Si el perfil personalizado está activo (`profile.enabled === true`),
 * usamos la foto y el nombre del perfil como imagen y texto grande, y la
 * carátula/artistas quedan como imagen y texto pequeños. Si Discord rechaza
 * el data URL de la foto (algunos backends solo aceptan URLs HTTPS), se cae
 * al comportamiento anterior sin la foto de perfil.
 */

const DEFAULT_CLIENT_ID = '1177081335727267940'

export interface NowPlayingInfo {
  title: string
  artists: string
  album?: string
  thumbnailUrl?: string
  isPlaying: boolean
  positionSec: number
  durationSec: number
}

let client: Client | null = null
let connected = false
let connecting = false
let enabled = false
let lastAttempt = 0
/**
 * Última info de reproducción recibida (aunque `enabled` esté a false).
 * La guardamos para poder refrescar la presencia cuando el usuario cambia
 * el perfil sin necesidad de esperar a la siguiente publicación del renderer.
 */
let lastPresenceInfo: NowPlayingInfo | null = null

export function setDiscordEnabled(value: boolean): void {
  enabled = value
  if (!value) {
    void client?.user?.clearActivity().catch(() => undefined)
    void client?.destroy().catch(() => undefined)
    client = null
    connected = false
  }
}

/**
 * Fuerza reenviar la presencia con la última info conocida. Se llama cuando
 * el perfil cambia (nombre/foto/enabled) mientras suena algo — así el cambio
 * se refleja al instante en Discord sin esperar a la siguiente canción.
 */
export async function refreshDiscordPresence(): Promise<void> {
  if (!enabled || !lastPresenceInfo) return
  // Invalida la deduplicación para que el próximo update reenvíe seguro.
  lastKey = ''
  await updateDiscordPresence(lastPresenceInfo)
}

async function ensureConnected(): Promise<boolean> {
  if (connected && client) return true
  if (connecting) return false
  // No martillear: un intento cada 30 s como mucho
  if (Date.now() - lastAttempt < 30_000) return false
  lastAttempt = Date.now()
  connecting = true
  try {
    client = new Client({ clientId: DEFAULT_CLIENT_ID })
    client.on('disconnected', () => {
      connected = false
    })
    await client.login()
    connected = true
    console.log('[discord] conectado como', client.user?.username ?? '(usuario)')
    return true
  } catch {
    client = null
    connected = false
    return false
  } finally {
    connecting = false
  }
}

let lastKey = ''
let lastStartMs = 0

export async function updateDiscordPresence(info: NowPlayingInfo | null): Promise<void> {
  // Guarda la última info aunque el RPC esté desactivado — el usuario puede
  // activarlo y esperar ver la canción actual sin cambiar de pista.
  if (info) lastPresenceInfo = info
  if (!enabled) return
  if (!info) {
    if (connected) await client?.user?.clearActivity().catch(() => undefined)
    lastKey = ''
    return
  }
  if (!(await ensureConnected())) return

  // Lee el perfil en cada actualización: es un getSetting en SQLite muy
  // barato y así cambios en vivo (nombre nuevo, foto nueva) se aplican al
  // vuelo sin necesidad de eventos.
  const profile = getProfile()
  const useProfile = profile.enabled === true
  const profileName = (profile.displayName ?? '').trim()
  const profilePhoto = (profile.photoDataUrl ?? '').trim()

  // Deduplicación: los timestamps hacen avanzar la barra solos en Discord;
  // solo reenviamos si cambia la pista/estado, si hubo un seek (>3 s de
  // desvío) o si cambiaron los campos del perfil que se muestran.
  const profileKeyPart = useProfile ? `${profileName}|${profilePhoto.slice(0, 24)}` : ''
  const key = `${info.title}|${info.artists}|${info.isPlaying}|${profileKeyPart}`
  const expectedPos = (Date.now() - lastStartMs) / 1000
  const seeked = info.isPlaying && Math.abs(expectedPos - info.positionSec) > 3
  if (key === lastKey && !seeked) return
  lastKey = key

  // Construye los campos visuales según haya perfil personalizado o no.
  // Con perfil: la foto/nombre del usuario ocupan la imagen grande; la
  // carátula del track cae a la imagen pequeña como "insignia".
  const trackThumb = info.thumbnailUrl ?? 'icon'
  const largeImageKey = useProfile && profilePhoto ? profilePhoto : trackThumb
  const largeImageText = useProfile
    ? profileName || info.album || 'Metrolist PC'
    : info.album ?? 'Metrolist PC'
  const smallImageKey = useProfile
    ? trackThumb
    : 'https://music.youtube.com/img/favicon_144.png'
  const smallImageText = useProfile
    ? info.artists || 'Metrolist PC'
    : 'Metrolist PC'
  const details = useProfile ? `por ${info.artists || 'Metrolist PC'}` : info.title
  const state = useProfile ? info.title : info.artists || 'Metrolist PC'

  try {
    if (info.isPlaying) {
      lastStartMs = Date.now() - info.positionSec * 1000
      const now = Date.now()
      const start = now - info.positionSec * 1000
      const end = start + info.durationSec * 1000
      await client!.user?.setActivity({
        type: 2, // "Escuchando"
        details,
        state,
        largeImageKey,
        largeImageText,
        smallImageKey,
        smallImageText,
        startTimestamp: start,
        endTimestamp: info.durationSec > 0 ? end : undefined,
        instance: false
      })
      const perfilTag = useProfile
        ? ` · perfil="${profileName || '(sin nombre)'}"${profilePhoto ? ' +foto' : ''}`
        : ''
      console.log('[discord] presencia:', info.title, '·', info.artists, perfilTag)
    } else {
      await client!.user?.clearActivity()
    }
  } catch (err) {
    // Fallback: si Discord rechaza el data URL de la foto de perfil,
    // reintenta con la carátula del track como imagen grande.
    if (useProfile && profilePhoto && info.isPlaying) {
      try {
        await client!.user?.setActivity({
          type: 2,
          details,
          state,
          largeImageKey: trackThumb,
          largeImageText: profileName || info.album || 'Metrolist PC',
          smallImageKey: 'https://music.youtube.com/img/favicon_144.png',
          smallImageText: 'Metrolist PC',
          startTimestamp: Date.now() - info.positionSec * 1000,
          endTimestamp:
            info.durationSec > 0
              ? Date.now() - info.positionSec * 1000 + info.durationSec * 1000
              : undefined,
          instance: false
        })
        console.log(
          '[discord] presencia (fallback sin foto de perfil):',
          info.title,
          '·',
          info.artists
        )
        return
      } catch {
        /* cae al bloque de desconexión */
      }
    }
    console.log('[discord] error al enviar presencia:', String((err as Error)?.message ?? err))
    connected = false
  }
}
