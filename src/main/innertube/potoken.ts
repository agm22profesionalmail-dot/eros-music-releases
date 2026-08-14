import { JSDOM } from 'jsdom'
import { BotGuardClient, getChallenge } from 'bgutils-js/botguard'
import { WebPoMinter } from 'bgutils-js/webpo'
import { buildURL, getHeaders } from 'bgutils-js/utils'

/**
 * Generación de PoToken (Proof of Origin) con BgUtils + jsdom.
 * Flujo (el mismo del ejemplo oficial de BgUtils para Node):
 *   1. pedir un challenge de BotGuard        (getChallenge)
 *   2. ejecutar su intérprete en un DOM simulado
 *   3. snapshot -> integrity token           (GenerateIT)
 *   4. mint del token ligado al visitorData  (WebPoMinter)
 *
 * Es la pieza más frágil frente a cambios de Google: cualquier error aquí debe
 * degradar a "sin poToken" y dejar que el resolvedor pruebe otros clientes.
 */

const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo'

export interface PoTokenResult {
  poToken: string
  visitorData: string
  mintedAt: number
}

let domInstalled = false

function installDom(): void {
  if (domInstalled) return
  const dom = new JSDOM('<!DOCTYPE html><html lang="en"><head></head><body></body></html>', {
    url: 'https://www.youtube.com/',
    referrer: 'https://www.youtube.com/',
    pretendToBeVisual: true
  })

  // BotGuard espera un entorno de navegador. Exponemos lo mínimo en globalThis
  // sin machacar lo que ya existe en Node/Electron (p. ej. fetch).
  const g = globalThis as Record<string, unknown>
  g.window = dom.window
  g.document = dom.window.document
  if (!g.location) g.location = dom.window.location
  if (!g.origin) g.origin = dom.window.origin
  domInstalled = true
}

export async function generatePoToken(visitorData: string): Promise<PoTokenResult> {
  installDom()

  // 1. Challenge de BotGuard
  const challenge = await getChallenge({
    requestKey: REQUEST_KEY,
    fetchFunction: fetch,
    useYouTubeAPI: false
  })

  const interpreterJavascript =
    challenge.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue
  if (!interpreterJavascript) throw new Error('El challenge no trae el intérprete de BotGuard')

  // 2. Ejecutar el intérprete (define el VM en globalThis[globalName])
  // eslint-disable-next-line no-new-func
  new Function(interpreterJavascript)()

  const botguard = await BotGuardClient.create({
    program: challenge.program,
    globalName: challenge.globalName,
    globalObject: globalThis
  })

  // 3. Snapshot + integrity token
  const webPoSignalOutput: never[] = []
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

  // 4. Mint del PoToken ligado al visitorData
  const minter = await WebPoMinter.create({ integrityToken }, webPoSignalOutput)
  const poToken = await minter.mintAsWebsafeString(decodeURIComponent(visitorData))

  await botguard.shutdown().catch(() => undefined)

  return { poToken, visitorData, mintedAt: Date.now() }
}
