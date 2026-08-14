import vm from 'node:vm'
import { Platform } from 'youtubei.js'

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
}
