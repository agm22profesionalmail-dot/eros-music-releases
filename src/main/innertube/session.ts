import { app, session as electronSession } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import { EventEmitter } from 'events'
import { Innertube } from 'youtubei.js'
import { EncryptedCache } from '../auth/encryptedCache'
import { installJsEvaluator } from './evaluator'
import { generatePoToken, type PoTokenResult } from './potoken'
import { getAllSettings } from '../settings'
import type { AuthMethod, AuthState } from '@shared/types'

/**
 * Gestor de la sesión InnerTube.
 *
 * - Mantiene un singleton de Innertube y lo reconstruye al iniciar/cerrar sesión.
 * - Dos métodos de login: OAuth device-code (vincular desde el móvil) y cookies
 *   (ventana con el login real de Google, como el WebView de Metrolist).
 * - El PoToken se genera de forma perezosa: la navegación no lo necesita,
 *   el streaming sí. `ensureStreamingReady()` lo añade y reconstruye la sesión.
 */

export const AUTH_PARTITION = 'persist:ytauth'
const MARKER_FILE = 'auth-method.json'

class SessionManager extends EventEmitter {
  #innertube: Innertube | null = null
  #creating: Promise<Innertube> | null = null
  #cache!: EncryptedCache
  #authState: AuthState = { status: 'signedOut' }
  #poToken: PoTokenResult | null = null
  #cookieHeader: string | null = null
  #deviceFlowActive = false

  get authState(): AuthState {
    return this.#authState
  }

  #setAuthState(state: AuthState): void {
    this.#authState = state
    this.emit('auth-state', state)
    // Completa nombre y foto de perfil en segundo plano
    if (state.status === 'signedIn' && !state.accountName) {
      void this.#fetchAccountInfo()
    }
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  async #fetchAccountInfo(): Promise<void> {
    try {
      const yt = await this.get()
      const info: any = await yt.account.getInfo()
      const item: any = info?.contents?.contents?.at?.(0) ?? info?.contents?.contents?.[0]
      const name = item?.account_name?.toString?.()
      const photos: any[] = item?.account_photo ?? []
      const photoUrl = photos.at?.(-1)?.url ?? photos[0]?.url
      if (name || photoUrl) {
        this.#authState = { ...this.#authState, accountName: name, accountPhotoUrl: photoUrl }
        this.emit('auth-state', this.#authState)
      }
    } catch {
      /* sin nombre/foto: no es crítico */
    }
  }

  #userDataDir(): string {
    return app.getPath('userData')
  }

  #markerPath(): string {
    return join(this.#userDataDir(), MARKER_FILE)
  }

  async #readMarker(): Promise<AuthMethod | null> {
    try {
      const raw = await fs.readFile(this.#markerPath(), 'utf-8')
      const parsed = JSON.parse(raw) as { method?: AuthMethod }
      return parsed.method ?? null
    } catch {
      return null
    }
  }

  async #writeMarker(method: AuthMethod | null): Promise<void> {
    if (method === null) {
      await fs.unlink(this.#markerPath()).catch(() => undefined)
    } else {
      await fs.writeFile(this.#markerPath(), JSON.stringify({ method }), 'utf-8')
    }
  }

  /** Construye el header Cookie a partir de la partición persistente del login. */
  async readCookiesFromPartition(): Promise<string | null> {
    const ses = electronSession.fromPartition(AUTH_PARTITION)
    const cookies = await ses.cookies.get({})
    const relevant = cookies.filter(
      (c) => c.domain?.endsWith('youtube.com') || c.domain?.endsWith('google.com')
    )
    // Sin SAPISID no hay sesión autenticada que valga
    if (!relevant.some((c) => c.name === 'SAPISID' || c.name === '__Secure-3PAPISID')) {
      return null
    }
    // Un solo valor por nombre (prioriza dominio youtube.com)
    const byName = new Map<string, string>()
    for (const c of relevant) {
      const preferred = c.domain?.endsWith('youtube.com')
      if (!byName.has(c.name) || preferred) byName.set(c.name, c.value)
    }
    return [...byName.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  }

  async #create(withPoToken: boolean): Promise<Innertube> {
    installJsEvaluator()
    this.#cache = this.#cache ?? new EncryptedCache(join(this.#userDataDir(), 'ytcache'))

    let poToken: string | undefined
    let visitorData: string | undefined

    if (withPoToken) {
      try {
        if (!this.#poToken) {
          // Intenta reutilizar el par visitor+token de arranques anteriores:
          // crear un visitante nuevo en cada arranque dispara la sospecha de Google.
          const cached = await this.#cache.get('metrolist_potoken')
          if (cached) {
            try {
              const parsed = JSON.parse(Buffer.from(cached).toString('utf-8')) as PoTokenResult
              if (parsed?.poToken && parsed?.visitorData) this.#poToken = parsed
            } catch {
              /* caché corrupta: se regenera */
            }
          }
        }
        if (!this.#poToken || Date.now() - this.#poToken.mintedAt > 6 * 3600_000) {
          // visitorData nuevo y estable para ligar el PoToken. No reutilizamos el
          // de la caché de sesión: si el binding no coincide, googlevideo devuelve
          // 403 a partir de ~2 MB (el token viaja pero no vale).
          const probe = await Innertube.create({
            retrieve_player: false,
            generate_session_locally: true,
            enable_session_cache: false
          })
          const vd = probe.session.context.client.visitorData
          if (vd) {
            this.#poToken = await generatePoToken(vd)
            const buf = Buffer.from(JSON.stringify(this.#poToken), 'utf-8')
            await this.#cache
              .set('metrolist_potoken', buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
              .catch(() => undefined)
          }
        }
        poToken = this.#poToken?.poToken
        visitorData = this.#poToken?.visitorData
      } catch (err) {
        console.warn('[innertube] PoToken no disponible, seguimos sin él:', err)
      }
    }

    // F28 · idioma y país de contenido configurables por el usuario. Los
    // valores 'auto' se resuelven contra el locale del sistema.
    const settings = getAllSettings()
    const lang =
      settings.contentLanguage && settings.contentLanguage !== 'auto'
        ? settings.contentLanguage
        : app.getLocale().slice(0, 2) || 'es'
    const location =
      settings.contentCountry && settings.contentCountry !== 'auto'
        ? settings.contentCountry
        : app.getLocaleCountryCode() || 'ES'

    const innertube = await Innertube.create({
      lang,
      location,
      cache: this.#cache,
      cookie: this.#cookieHeader ?? undefined,
      po_token: poToken,
      visitor_data: visitorData,
      // Con PoToken la sesión debe regenerarse para respetar visitor_data:
      // la caché de sesión lo ignoraría y rompería el binding del token.
      enable_session_cache: !withPoToken,
      generate_session_locally: withPoToken ? true : undefined,
      retrieve_player: withPoToken // el player solo hace falta para streams
    })

    // Reenvía credenciales OAuth refrescadas a la caché cifrada
    innertube.session.on('update-credentials', () => {
      innertube.session.oauth.cacheCredentials().catch(() => undefined)
    })

    return innertube
  }

  /** Sesión para navegación (sin player ni PoToken: arranque rápido). */
  async get(): Promise<Innertube> {
    if (this.#innertube) return this.#innertube
    if (!this.#creating) {
      this.#creating = this.#create(false).then((it) => {
        this.#innertube = it
        this.#creating = null
        return it
      })
    }
    return this.#creating
  }

  #streamingReady = false

  /** Sesión lista para streaming: con player y (si se puede) PoToken. */
  async ensureStreamingReady(): Promise<Innertube> {
    if (this.#streamingReady && this.#innertube) return this.#innertube
    const { clearStreamCache } = await import('../stream/resolver')
    clearStreamCache()
    const rebuilt = await this.#create(true)
    // Si había OAuth activo, engancha las credenciales también en la nueva sesión
    if (this.#authState.status === 'signedIn' && this.#authState.method === 'oauth') {
      await rebuilt.session.signIn().catch(() => undefined)
    }
    this.#innertube = rebuilt
    this.#streamingReady = true
    return rebuilt
  }

  /**
   * Refresca las cookies visitando music.youtube.com en una ventana oculta
   * con la partición de login: Chromium aplica las rotaciones de Google
   * (SIDTS y compañía) y releemos el header. Evita el clásico "deja de
   * funcionar hasta que reinicio" en sesiones abiertas durante días.
   */
  async refreshCookiesInBackground(): Promise<void> {
    if (this.#authState.method !== 'cookie') return
    try {
      const { BrowserWindow } = await import('electron')
      const win = new BrowserWindow({
        show: false,
        webPreferences: { partition: AUTH_PARTITION, sandbox: true }
      })
      await win.loadURL('https://music.youtube.com/').catch(() => undefined)
      await new Promise((r) => setTimeout(r, 5000))
      win.destroy()
      const header = await this.readCookiesFromPartition()
      if (header && header !== this.#cookieHeader) {
        this.#cookieHeader = header
        this.#innertube = null
        this.#creating = null
        this.#streamingReady = false
        await this.get()
        console.log('[auth] cookies rotadas y sesión reconstruida')
      }
    } catch (err) {
      console.warn('[auth] refresco de cookies falló:', err)
    }
  }

  #cookieRefreshTimer: NodeJS.Timeout | null = null

  /** Restaura la sesión guardada al arrancar la app. */
  async restore(): Promise<void> {
    const method = await this.#readMarker()
    if (method === 'cookie') {
      const header = await this.readCookiesFromPartition()
      if (header) {
        this.#cookieHeader = header
        this.#innertube = null
        this.#streamingReady = false
        await this.get()
        this.#setAuthState({ status: 'signedIn', method: 'cookie' })
        // Rotación de cookies: refresco al arrancar y cada 6 horas
        void this.refreshCookiesInBackground()
        if (!this.#cookieRefreshTimer) {
          this.#cookieRefreshTimer = setInterval(
            () => void this.refreshCookiesInBackground(),
            6 * 3600_000
          )
        }
        return
      }
      // Cookies caducadas o borradas
      await this.#writeMarker(null)
    } else if (method === 'oauth') {
      try {
        const it = await this.get()
        await it.session.signIn() // usa credenciales cacheadas (EncryptedCache)
        if (it.session.logged_in) {
          this.#setAuthState({ status: 'signedIn', method: 'oauth' })
          return
        }
      } catch (err) {
        console.warn('[auth] restauración OAuth fallida:', err)
        await this.#writeMarker(null)
      }
    }
    this.#setAuthState({ status: 'signedOut' })
  }

  /** Inicia el device-code flow (vincular desde el móvil). */
  async startDeviceFlow(): Promise<void> {
    if (this.#deviceFlowActive) return
    this.#deviceFlowActive = true
    const it = await this.get()

    it.session.once('auth-pending', (data) => {
      this.#setAuthState({
        status: 'pendingDeviceCode',
        method: 'oauth',
        userCode: data.user_code,
        verificationUrl: data.verification_url
      })
    })

    it.session.once('auth', ({ credentials: _credentials }) => {
      void (async () => {
        await it.session.oauth.cacheCredentials().catch(() => undefined)
        await this.#writeMarker('oauth')
        this.#deviceFlowActive = false
        this.#streamingReady = false
        this.#setAuthState({ status: 'signedIn', method: 'oauth' })
      })()
    })

    it.session.once('auth-error', (err) => {
      this.#deviceFlowActive = false
      this.#setAuthState({ status: 'error', error: String(err?.message ?? err) })
    })

    try {
      await it.session.signIn()
    } catch (err) {
      this.#deviceFlowActive = false
      if (this.#authState.status !== 'signedIn') {
        this.#setAuthState({ status: 'error', error: String((err as Error)?.message ?? err) })
      }
    }
  }

  /** Aplica cookies recién capturadas por la ventana de login. */
  async adoptCookies(): Promise<boolean> {
    const header = await this.readCookiesFromPartition()
    if (!header) return false
    this.#cookieHeader = header
    this.#innertube = null
    this.#streamingReady = false
    this.#creating = null
    await this.get()
    await this.#writeMarker('cookie')
    this.#setAuthState({ status: 'signedIn', method: 'cookie' })
    return true
  }

  /**
   * F28 · Invalida la sesión actual (sin cerrar la cuenta) para reconstruirla
   * con el `lang`/`location` actualizados desde ajustes. Reutiliza el mismo
   * cookieHeader y estado de auth: solo tira y vuelve a crear el Innertube.
   */
  async invalidateForLocaleChange(): Promise<void> {
    this.#innertube = null
    this.#creating = null
    this.#streamingReady = false
    // Repara la sesión perezosa: se creará la próxima vez que alguien pida `get()`.
    await this.get().catch(() => undefined)
  }

  /**
   * F29 · Alias con nombre más neutro: útil cuando lo que cambia no es el
   * locale sino la cadena de streaming (o el toggle de yt-dlp). El efecto
   * es idéntico: `#streamingReady = false` para forzar a reconstruir la
   * sesión con player la próxima vez que alguien pida un stream.
   */
  async invalidateStreamingSession(): Promise<void> {
    await this.invalidateForLocaleChange()
  }

  async signOut(): Promise<void> {
    try {
      if (this.#authState.method === 'oauth' && this.#innertube) {
        await this.#innertube.session.signOut().catch(() => undefined)
        await this.#innertube.session.oauth.removeCache().catch(() => undefined)
      }
      if (this.#authState.method === 'cookie') {
        const ses = electronSession.fromPartition(AUTH_PARTITION)
        await ses.clearStorageData({ storages: ['cookies'] })
      }
    } finally {
      this.#cookieHeader = null
      this.#innertube = null
      this.#creating = null
      this.#streamingReady = false
      await this.#writeMarker(null)
      this.#setAuthState({ status: 'signedOut' })
      await this.get().catch(() => undefined)
    }
  }
}

export const sessionManager = new SessionManager()
