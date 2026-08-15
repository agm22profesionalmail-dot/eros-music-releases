import { session as electronSession } from 'electron'
import { getAllSettings } from '../settings'

/**
 * F33 · Proxy HTTP/SOCKS.
 *
 * Este módulo aplica el proxy configurado en Ajustes a la sesión por defecto
 * de Electron (afecta a `net.fetch`, a `fetch` desde el renderer y a todas
 * las peticiones que usen la stack HTTP del proceso principal) y expone un
 * helper para inyectar los argumentos `--proxy` al invocar `yt-dlp`.
 */

/** Quita el prefijo de esquema para dejar solo `[user:pass@]host:port`. */
function stripScheme(url: string): string {
  return (url ?? '').trim().replace(/^(?:https?|socks5?):\/\//i, '')
}

/**
 * Aplica el proxy actual a `session.defaultSession`. Se llama al arrancar
 * (tras `app.whenReady()`) y de nuevo cada vez que el usuario cambia
 * `proxyMode` o `proxyUrl` desde Ajustes.
 */
export async function applyProxyFromSettings(): Promise<void> {
  const s = getAllSettings()
  const ses = electronSession.defaultSession
  try {
    if (s.proxyMode === 'off') {
      await ses.setProxy({ mode: 'direct' })
      return
    }
    if (s.proxyMode === 'system') {
      await ses.setProxy({ mode: 'system' })
      return
    }
    // http o socks5 con URL explícita
    const clean = stripScheme(s.proxyUrl)
    if (!clean) {
      // Sin host no podemos configurar nada — nos aseguramos de no dejar
      // un proxy zombie de una sesión previa.
      await ses.setProxy({ mode: 'direct' })
      return
    }
    const scheme = s.proxyMode === 'socks5' ? 'socks5' : 'http'
    await ses.setProxy({ proxyRules: `${scheme}=${clean}` })
  } catch (err) {
    console.warn('[proxy] no se pudo aplicar el proxy:', String((err as Error)?.message ?? err))
  }
}

/**
 * Devuelve los argumentos que hay que anexar al `spawn(ytDlp, ...)` para que
 * yt-dlp use el mismo proxy que la app. En modo `system` no se añade nada:
 * yt-dlp respeta las variables de entorno / proxy del SO por sí mismo.
 */
export function ytDlpProxyArgs(): string[] {
  const s = getAllSettings()
  if (s.proxyMode === 'off' || s.proxyMode === 'system') return []
  const clean = stripScheme(s.proxyUrl)
  if (!clean) return []
  const scheme = s.proxyMode === 'socks5' ? 'socks5' : 'http'
  return ['--proxy', `${scheme}://${clean}`]
}
