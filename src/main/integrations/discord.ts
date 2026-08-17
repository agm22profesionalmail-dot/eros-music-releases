import { Client } from '@xhayper/discord-rpc'
import { getProfile } from '../settings'
import { sessionManager } from '../innertube/session'
import { getOrUploadProfilePhotoUrl } from './imageHost'

/**
 * ============================================================================
 * Discord Rich Presence — LEER `docs/discord-rpc.md` ANTES DE TOCAR ESTE ARCHIVO
 * ============================================================================
 *
 * Qué hace: muestra "Listening to ERO'S Music" en Discord con título,
 * artista, carátula y barra de progreso viva. Con perfil personalizado (F25),
 * la foto/nombre del usuario ocupan la imagen grande y la carátula cae a la
 * insignia pequeña.
 *
 * PUNTO ROJO — La cabecera "Listening to X" NO se pone desde aquí. Discord
 * la deriva del nombre registrado en el Developer Portal para el
 * Application ID de abajo. Cambiar `DEFAULT_CLIENT_ID` por otro (por
 * ejemplo, el genérico `1177081335727267940` de th-ch/youtube-music) hace
 * que Discord vuelva a decir "Listening to YouTube Music". El ID actual
 * apunta a la aplicación "ERO'S Music" registrada en la cuenta de Discord
 * Developer Portal del usuario, con los assets ya subidos (asset `icon` como
 * fallback del largeImageKey). No sustituir "por otro que salga en un
 * tutorial" ni revertir sin registrar antes una app equivalente en el
 * portal.
 *
 * Conexión perezosa con reintentos: si Discord no está abierto se reintenta
 * como mucho una vez cada 30 s. Toggle desde Ajustes (`discordRpc`) llama a
 * `setDiscordEnabled(bool)`. Cambio de perfil dispara
 * `refreshDiscordPresence()` desde el IPC `PROFILE_SET` para reflejar la
 * nueva foto/nombre sin esperar al siguiente track.
 *
 * Ver `docs/discord-rpc.md` para: flujo de datos completo, qué NO tocar y
 * por qué, cómo verificar tras un build, y el historial de la integración.
 * ============================================================================
 */

// PUNTO ROJO — leer JSDoc de arriba antes de cambiar este valor.
// App "ERO'S Music" registrada en el Discord Developer Portal de Zero
// (2026-08-16). El anterior era `1177081335727267940` (público de
// th-ch/youtube-music), lo que hacía que Discord dijese
// "Listening to YouTube Music".
const DEFAULT_CLIENT_ID = '1538529552513507418'

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
  // desvío) o si cambiaron los campos del perfil que se muestran (nombre,
  // foto personalizada, o foto de Google — cualquiera de las tres puede
  // acabar en el largeImageKey según la lógica de F60 más abajo).
  const googlePhotoKeyPart = (sessionManager.authState.accountPhotoUrl ?? '').slice(0, 32)
  const profileKeyPart = useProfile
    ? `${profileName}|${profilePhoto.slice(0, 24)}|${googlePhotoKeyPart}`
    : googlePhotoKeyPart
  const key = `${info.title}|${info.artists}|${info.isPlaying}|${profileKeyPart}`
  const expectedPos = (Date.now() - lastStartMs) / 1000
  const seeked = info.isPlaying && Math.abs(expectedPos - info.positionSec) > 3
  if (key === lastKey && !seeked) return
  lastKey = key

  // Construye los campos visuales.
  //
  // F60/F61 · Disposición tipo Spotify: la carátula del track SIEMPRE
  // manda como imagen grande (es lo que la gente quiere ver de un lado a
  // otro del feed), y la foto del usuario va como insignia pequeña
  // superpuesta abajo-derecha — así se lee "X está escuchando esto".
  //
  // Discord solo acepta URLs http/https en estos keys (rechaza data URLs),
  // así que la foto de perfil personalizada (`photoDataUrl`, base64) rara
  // vez pasa. Preferimos la foto HTTPS de la cuenta de Google
  // (`accountPhotoUrl` del sessionManager, extraída de InnerTube
  // getAccountInfo) cuando esté disponible. Cae a `photoDataUrl` como
  // último recurso; si Discord lo rechaza, el catch de abajo reintenta sin
  // insignia pequeña.
  const trackThumb = info.thumbnailUrl ?? 'icon'
  const googlePhoto = sessionManager.authState.accountPhotoUrl
  const isHttpUrl = (s: string): boolean => /^https?:\/\//i.test(s)
  // Insignia del usuario para Discord. Prioridad (F62):
  //   1) photoDataUrl si ya es http(s) → uso directo
  //   2) photoDataUrl como data URL → subir a catbox y usar esa URL
  //      (asíncrono: la primera vez devuelve `null`/URL previa y refresca
  //      cuando el upload termina — no bloquea el update)
  //   3) accountPhotoUrl de Google → fallback si no hay personalizada o
  //      mientras la primera subida está en vuelo
  //   4) undefined → sin insignia
  let userBadge: string | undefined
  if (useProfile && profilePhoto) {
    if (isHttpUrl(profilePhoto)) {
      userBadge = profilePhoto
    } else if (profilePhoto.startsWith('data:')) {
      const uploaded = getOrUploadProfilePhotoUrl(profilePhoto, () => {
        // Cuando la subida termina, reenvía la presencia con la URL nueva.
        void refreshDiscordPresence()
      })
      userBadge = uploaded ?? googlePhoto ?? undefined
    } else {
      userBadge = googlePhoto ?? undefined
    }
  } else {
    userBadge = googlePhoto ?? undefined
  }
  // Orden de líneas fijado por el usuario (F61): Canción / Artista /
  // Usuario. `details` y `state` son las dos primeras (siempre visibles);
  // `largeImageText` es la tercera (tooltip de la carátula, se ve como
  // tercera línea en la tarjeta "Current activity" del perfil). Con
  // perfil personalizado, la tercera es el nombre del perfil; sin perfil,
  // el álbum si lo hay.
  const largeImageKey = trackThumb
  const largeImageText = useProfile
    ? profileName || info.album || "ERO'S Music"
    : info.album ?? "ERO'S Music"
  const smallImageKey = userBadge
  const smallImageText = useProfile
    ? profileName || info.artists || "ERO'S Music"
    : info.artists || "ERO'S Music"
  const details = info.title
  const state = info.artists || "ERO'S Music"

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
    // Fallback si Discord rechaza el smallImageKey (típicamente data URL
    // de la foto personalizada guardada como base64). Reintenta con la
    // carátula sola, sin insignia pequeña — la marca del app (cabecera
    // "Listening to ERO'S Music") ya se ve arriba, y volver a colar el
    // favicon de YT Music aquí sería contraproducente (F60).
    if (useProfile && profilePhoto && info.isPlaying) {
      try {
        await client!.user?.setActivity({
          type: 2,
          details,
          state,
          largeImageKey: trackThumb,
          largeImageText: info.album ?? "ERO'S Music",
          smallImageKey: undefined,
          smallImageText: undefined,
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
