import vm from 'node:vm'
import { Platform, Parser } from 'youtubei.js'

/**
 * youtubei.js 14+ no incluye evaluador de JS: hay que aportarlo.
 * Se usa para ejecutar los fragmentos del player de YouTube que descifran
 * las firmas (sig/nsig) de las URLs de streaming.
 *
 * Ejecutamos el script en un contexto de node:vm sin acceso a require,
 * process ni globals de la app. El script viene del player oficial de
 * YouTube (mismo código que ejecuta cualquier navegador al reproducir).
 */

let installed = false

export function installJsEvaluator(): void {
  if (installed) return
  installed = true

  Platform.shim.eval = (data: { output: string }, _env: Record<string, unknown>) => {
    // data.output termina con un `return process(...)` de nivel superior:
    // lo envolvemos en una IIFE para que sea un cuerpo de función válido.
    const source = `(() => {\n${data.output}\n})()`
    const context = vm.createContext(Object.create(null), {
      codeGeneration: { strings: true, wasm: false }
    })
    return vm.runInContext(source, context, { timeout: 10_000 })
  }

  // BUG DE EMPAQUETADO (crítico): ante un nodo que no conoce, el parser de
  // youtubei.js construye un mensaje con `packageInfo.bugs.url`. Al empaquetar,
  // electron-builder MINIFICA los package.json de node_modules y ELIMINA el
  // campo `bugs` → `bugs.url` lanza `TypeError: reading 'url'` y `getInfo`
  // REVIENTA. Solo pasa en la app instalada (en dev el package.json está
  // entero). Y solo con vídeos cuya respuesta trae nodos nuevos: los art
  // tracks "- Topic" de YouTube Music incluyen `MenuCustomIconItem` (botones
  // "Find on AXS/Ticketmaster" del artista) → esos temas (p. ej. los de bbno$)
  // se saltaban en el instalador mientras los vídeos normales sonaban.
  // Sustituimos el handler por uno que NO toca `bugs.url`; el parser sigue y
  // devuelve el resto de la info intacta.
  try {
    Parser.setParserErrorHandler(() => {
      /* no-op: los nodos desconocidos no son críticos para reproducir */
    })
  } catch {
    /* versión de youtubei.js sin esta API: nada que hacer */
  }
}
