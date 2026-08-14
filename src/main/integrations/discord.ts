import { Client } from '@xhayper/discord-rpc'

/**
 * Discord Rich Presence: muestra la canción en curso en el perfil de Discord.
 * Usa el application id público "YouTube Music" (el mismo que el proyecto
 * th-ch/youtube-music); configurable por si el usuario quiere el suyo.
 *
 * Conexión perezosa con reintentos suaves: si Discord no está abierto no
 * pasa nada, se reintenta al cambiar de canción.
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

export function setDiscordEnabled(value: boolean): void {
  enabled = value
  if (!value) {
    void client?.user?.clearActivity().catch(() => undefined)
    void client?.destroy().catch(() => undefined)
    client = null
    connected = false
  }
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
    return true
  } catch {
    client = null
    connected = false
    return false
  } finally {
    connecting = false
  }
}

export async function updateDiscordPresence(info: NowPlayingInfo | null): Promise<void> {
  if (!enabled) return
  if (!info) {
    if (connected) await client?.user?.clearActivity().catch(() => undefined)
    return
  }
  if (!(await ensureConnected())) return

  try {
    if (info.isPlaying) {
      const now = Date.now()
      const start = now - info.positionSec * 1000
      const end = start + info.durationSec * 1000
      await client!.user?.setActivity({
        type: 2, // "Escuchando"
        details: info.title,
        state: info.artists || 'Metrolist PC',
        largeImageKey: info.thumbnailUrl ?? 'icon',
        largeImageText: info.album ?? 'Metrolist PC',
        smallImageKey: 'https://music.youtube.com/img/favicon_144.png',
        smallImageText: 'Metrolist PC',
        startTimestamp: start,
        endTimestamp: info.durationSec > 0 ? end : undefined,
        instance: false
      })
    } else {
      await client!.user?.clearActivity()
    }
  } catch {
    connected = false
  }
}
