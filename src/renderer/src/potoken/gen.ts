import { BotGuardClient, getChallenge } from 'bgutils-js/botguard'
import { WebPoMinter } from 'bgutils-js/webpo'
import { buildURL, getHeaders } from 'bgutils-js/utils'

/**
 * Generación de PoToken en un contexto de navegador REAL (Chromium, vía un
 * BrowserWindow oculto que carga potoken.html). Aquí el intérprete de BotGuard
 * se ejecuta con las señales de entorno completas (navigator, canvas, WebGL…).
 *
 * DOS tipos de PoToken, con distinto "content binding" (como Metrolist Android):
 *   - Player PoToken  → ligado al visitorData (para la petición /player).
 *   - Streaming/GVS   → ligado al VIDEOID (va en la URL de googlevideo `&pot=`).
 * El streaming DEBE ligarse al videoId: con el de visitorData, YouTube devuelve
 * HTTP 403 al descargar los art tracks de YouTube Music (canales "- Topic").
 *
 * El minter (challenge + integrity token) se crea UNA vez y se reutiliza: firmar
 * un binding nuevo (mint) es instantáneo, así que generar un token por vídeo no
 * cuesta una ronda de red completa.
 */

const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo'
const MINTER_TTL_MS = 3 * 60 * 60 * 1000 // el integrity token caduca: re-crear cada 3 h

interface MinterState {
  minter: { mintAsWebsafeString: (identifier: string) => Promise<string> }
  botguard: { shutdown: () => Promise<void> }
  mintedAt: number
}

let minterState: MinterState | null = null
let minterPromise: Promise<MinterState> | null = null

async function buildMinter(): Promise<MinterState> {
  const challenge = await getChallenge({
    requestKey: REQUEST_KEY,
    fetchFunction: fetch,
    useYouTubeAPI: false
  })
  const interpreterJavascript =
    challenge.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue
  if (!interpreterJavascript) throw new Error('El challenge no trae el intérprete de BotGuard')

  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  new Function(interpreterJavascript)()

  const botguard = await BotGuardClient.create({
    program: challenge.program,
    globalName: challenge.globalName,
    globalObject: globalThis
  })

  const webPoSignalOutput: unknown[] = []
  const botguardResponse = await botguard.snapshot({ webPoSignalOutput })

  const integrityTokenResponse = await fetch(buildURL('GenerateIT', false), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify([REQUEST_KEY, botguardResponse])
  })
  if (!integrityTokenResponse.ok) {
    throw new Error(`BotGuard GenerateIT falló: HTTP ${integrityTokenResponse.status}`)
  }
  const integrityTokenBody = (await integrityTokenResponse.json()) as unknown[]
  const integrityToken = integrityTokenBody[0]
  if (typeof integrityToken !== 'string') {
    throw new Error('GenerateIT no devolvió un integrity token')
  }

  const minter = (await WebPoMinter.create(
    { integrityToken },
    webPoSignalOutput as never
  )) as MinterState['minter']

  return { minter, botguard: botguard as MinterState['botguard'], mintedAt: Date.now() }
}

async function getMinter(forceNew = false): Promise<MinterState> {
  if (!forceNew && minterState && Date.now() - minterState.mintedAt < MINTER_TTL_MS) {
    return minterState
  }
  if (forceNew && minterState) {
    minterState.botguard.shutdown().catch(() => undefined)
    minterState = null
  }
  if (!minterPromise) {
    minterPromise = buildMinter()
      .then((s) => {
        minterState = s
        minterPromise = null
        return s
      })
      .catch((e) => {
        minterPromise = null
        throw e
      })
  }
  return minterPromise
}

/** Firma un PoToken ligado a `identifier` (visitorData para player, videoId para GVS). */
async function mint(identifier: string): Promise<string> {
  const state = await getMinter()
  try {
    return await state.minter.mintAsWebsafeString(decodeURIComponent(identifier))
  } catch {
    // minter caducado/roto: recrear una vez y reintentar
    const fresh = await getMinter(true)
    return fresh.minter.mintAsWebsafeString(decodeURIComponent(identifier))
  }
}

declare global {
  interface Window {
    __mintPoToken: (identifier: string) => Promise<string>
    __potokenReady?: boolean
  }
}

window.__mintPoToken = mint
window.__potokenReady = true
