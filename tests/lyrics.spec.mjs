/**
 * Tests del módulo de letras: parser LRC, normalización de títulos y una
 * llamada real a LRCLIB.
 * Uso: node tests/lyrics.spec.mjs
 *
 * Sin dependencias: carga los .ts del proyecto con el type stripping nativo
 * de Node (>= 22.15) más un hook de resolución que añade la extensión .ts a
 * los imports relativos y resuelve el alias @shared/*.
 *
 * Salida: OK/FAIL/SKIP por caso. exit 1 si falla cualquier caso obligatorio;
 * si la red no está disponible, el bloque de red se marca SKIP y exit 0.
 */
import * as mod from 'node:module'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

if (typeof mod.registerHooks !== 'function') {
  console.error('Se necesita Node >= 22.15 (module.registerHooks) para ejecutar estos tests')
  process.exit(1)
}

// Declarar el formato de los .ts evita el warning MODULE_TYPELESS_PACKAGE_JSON
// (package.json no lleva "type" y no podemos tocarlo desde aquí)
const asTs = (resolved) =>
  resolved?.url?.endsWith('.ts') ? { ...resolved, format: 'module-typescript' } : resolved

mod.registerHooks({
  resolve(specifier, context, nextResolve) {
    // Alias @shared/* → src/shared/*.ts (los `import type` se borran al hacer
    // strip, pero lo mapeamos por si algún día hay imports con valor)
    if (specifier.startsWith('@shared/')) {
      const mapped = pathToFileURL(
        join(root, 'src', 'shared', `${specifier.slice('@shared/'.length)}.ts`)
      ).href
      return asTs(nextResolve(mapped, context))
    }
    try {
      return asTs(nextResolve(specifier, context))
    } catch (err) {
      // Import relativo sin extensión (estilo bundler) → probar con .ts
      if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z]+$/i.test(specifier)) {
        return asTs(nextResolve(`${specifier}.ts`, context))
      }
      throw err
    }
  }
})

const { parseLrc, isLrcSynced } = await import(
  pathToFileURL(join(root, 'src', 'main', 'lyrics', 'parser.ts')).href
)
const { normalizeTitle, normalizeArtist, getLyrics } = await import(
  pathToFileURL(join(root, 'src', 'main', 'lyrics', 'index.ts')).href
)

// ---------- mini-harness ----------
let pass = 0
let fail = 0
let skip = 0
const check = (name, cond, detail) => {
  if (cond) {
    pass++
    console.log(`  OK   ${name}`)
  } else {
    fail++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}
const eq = (name, actual, expected) => {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  check(name, a === e, `esperado ${e}, obtenido ${a}`)
}
const skipped = (name, why) => {
  skip++
  console.log(`  SKIP ${name} — ${why}`)
}

// ---------- parser LRC ----------
console.log('[parser]')

eq(
  'timestamps múltiples por línea',
  parseLrc('[00:12.00][00:24.00]Hola'),
  [
    { timeMs: 12_000, text: 'Hola' },
    { timeMs: 24_000, text: 'Hola' }
  ]
)
eq('centésimas (2 cifras)', parseLrc('[01:02.50]a'), [{ timeMs: 62_500, text: 'a' }])
eq('milésimas (3 cifras)', parseLrc('[01:02.500]b'), [{ timeMs: 62_500, text: 'b' }])
eq('décimas (1 cifra)', parseLrc('[00:01.5]c'), [{ timeMs: 1500, text: 'c' }])
eq('sin fracción [mm:ss]', parseLrc('[00:05]x'), [{ timeMs: 5000, text: 'x' }])
eq(
  'ignora metadatos',
  parseLrc('[ar:Daft Punk]\n[ti:Get Lucky]\n[al:Random Access Memories]\n[length:03:45]\n[offset:+500]\n[00:01.00]uno'),
  [{ timeMs: 1000, text: 'uno' }]
)
eq(
  'ordena por tiempo',
  parseLrc('[00:30.00]dos\n[00:10.00]uno').map((l) => l.text),
  ['uno', 'dos']
)
eq('elimina timestamps inline <mm:ss.xx>', parseLrc('[00:10.00]Ho<00:10.50>la'), [
  { timeMs: 10_000, text: 'Hola' }
])
eq('ignora líneas de texto suelto', parseLrc('texto sin timestamp\n[00:02.00]dos'), [
  { timeMs: 2000, text: 'dos' }
])
check('isLrcSynced → true con timestamps', isLrcSynced('[00:01.00]hola'))
check('isLrcSynced → false con texto plano', !isLrcSynced('solo texto\nplano\n[ar:meta]'))

// ---------- normalización ----------
console.log('[normalización]')

eq(
  'quita (feat. …) y (Official Video)',
  normalizeTitle('Get Lucky (feat. Pharrell Williams) (Official Video)'),
  'Get Lucky'
)
eq('quita [Official Audio]', normalizeTitle('Instant Crush [Official Audio]'), 'Instant Crush')
eq(
  'quita feat sin paréntesis',
  normalizeTitle('Instant Crush feat. Julian Casablancas'),
  'Instant Crush'
)
eq('quita (Video Oficial)', normalizeTitle('La Flaca (Video Oficial)'), 'La Flaca')
eq(
  'conserva paréntesis legítimos',
  normalizeTitle("(I Can't Get No) Satisfaction"),
  "(I Can't Get No) Satisfaction"
)
eq('título limpio queda igual', normalizeTitle('Get Lucky'), 'Get Lucky')
eq('quita "- Topic" del artista', normalizeArtist('Daft Punk - Topic'), 'Daft Punk')
eq('artista limpio queda igual', normalizeArtist('Daft Punk'), 'Daft Punk')

// ---------- llamada real a LRCLIB ----------
console.log('[red: LRCLIB]')

const params = { title: 'Get Lucky', artists: ['Daft Punk'], durationSec: 369 }
let data = null
try {
  data = await getLyrics(params) // getLyrics nunca lanza, pero por si acaso
} catch {
  data = null
}

if (data?.synced && data.synced.length > 0) {
  check('devuelve letra sincronizada', true)
  check('fuente LRCLIB', data.source === 'LRCLIB', `fuente: ${data.source}`)
  check('más de 20 líneas', data.synced.length > 20, `líneas: ${data.synced.length}`)
  const nonDecreasing = data.synced.every((l, i, arr) => i === 0 || arr[i - 1].timeMs <= l.timeMs)
  const strictlyGrows = data.synced[0].timeMs < data.synced[data.synced.length - 1].timeMs
  check('timeMs creciente', nonDecreasing && strictlyGrows)
  const again = await getLyrics(params)
  check('la caché devuelve el mismo objeto', again === data)
} else {
  // Distinguir "sin red" (SKIP) de "el módulo no encontró nada" (FAIL)
  const reachable = await fetch('https://lrclib.net/api/search?q=test', {
    signal: AbortSignal.timeout(8000)
  })
    .then((r) => r.ok)
    .catch(() => false)
  if (reachable) {
    check('llamada real a LRCLIB', false, `con red disponible devolvió ${JSON.stringify(data)?.slice(0, 200)}`)
  } else {
    skipped('llamada real a LRCLIB', 'sin conexión con lrclib.net (red caída o bloqueada)')
  }
}

// ---------- resumen ----------
console.log(`\nResumen: ${pass} OK, ${fail} FAIL, ${skip} SKIP`)
// Salida natural (sin process.exit): en Windows, forzar la salida con sockets
// keep-alive de fetch aún vivos dispara una aserción de libuv (exit 127)
process.exitCode = fail > 0 ? 1 : 0
