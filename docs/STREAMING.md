# Streaming de audio — cómo se saltó cada muro de Google

Este documento existe porque la parte más frágil de la app es el pipeline de audio y cada tres meses Google cambia algo. Si el sonido deja de funcionar, empieza por aquí antes de tocar código.

## Cadena completa

```
videoId
  │
  ▼
sessionManager.ensureStreamingReady()   ← Innertube con retrieve_player + PoToken persistido
  │
  ▼
resolver.resolveStream(videoId)         ← Prueba [YTMUSIC, IOS, ANDROID, TV_EMBEDDED] con
  │                                       User-Agent correcto por cliente. Fallback: yt-dlp.
  ▼   URL de googlevideo con pot=... n=... sig=...
spool.getSpool(videoId)                 ← Una única petición secuencial
  │                                       Range: bytes=0-<ventana>. La ventana crece
  │                                       proporcional a lo ya servido para simular
  │                                       un reproductor real.
  ▼   Fichero en %APPDATA%\Metrolist PC\spool\<videoId>.audio
stream/server.ts                        ← Proxy HTTP en 127.0.0.1:<puerto> con token
  │                                       de sesión. Sirve Range al <audio> del renderer
  │                                       leyendo el spool según crece.
  ▼
<audio> del engine                      ← Web Audio: preamp → EQ 10 → volumen → analyser → salida
```

## Los tres descubrimientos que costaron

### 1. Rangos prefijo únicamente

Con nuestro PoToken (cliente WEB_REMIX), **googlevideo rechaza cualquier `Range` con offset > 0**. Todo lo que hace `bytes=1048576-2097151` devuelve 403. Solo `bytes=0-N` funciona.

Consecuencia: no podemos hacer proxy trocito a trocito por demanda del `<audio>`; hay que **descargar la canción entera en secuencia** y servirla al reproductor desde el fichero según crece.

### 2. Ventana con crédito

Aun con rangos prefijo, hay un límite dinámico: la primera petición no puede pedir más de ~1 MiB. La siguiente puede pedir hasta ~2×lo ya servido. Si te pasas, 403.

Por eso `spool.ts` calcula:

```ts
const target = Math.max(MB, entry.downloadedBytes * 2 + MB)
const cap = entry.totalBytes > 0 ? entry.totalBytes + 999_999 : 256 * MB
const end = Math.min(target, cap)
```

### 3. Huella TLS de la pila

`fetch` global de Node (undici) tiene una huella TLS que Google detecta y capa a **1 MiB** exactos. La pila de red de Chromium expuesta por Electron (`electron.net.fetch`) no la detecta y sirve trozos grandes sin problema.

**Regla**: cualquier `fetch` a `googlevideo.com` va con `net.fetch` de Electron.

## Cliente iOS de reserva

Como sonda demostró, `client: 'IOS'` sirve los primeros ~2 MiB de cualquier vídeo **sin PoToken**. No sirve para canciones enteras, pero es útil como red de seguridad para diagnosticar: si YTMUSIC empieza a fallar de golpe pero IOS todavía sirve, el problema es el PoToken (no la red).

## Descifrado de sig/nsig

Desde youtubei.js 14+ hay que aportar tu propio evaluador de JS. El fichero es `renderer/../evaluator.ts` — se conecta como `Platform.shim.eval` y ejecuta el script del player con `node:vm` en un contexto aislado (`Object.create(null)`, sin `require`, timeout 10s).

Si YouTube cambia mucho el player y el evaluador rompe: mirar `Player.getNsigProcessorFn` en `node_modules/youtubei.js/dist/src/utils/Utils.js` — es el generador del script.

## PoToken

Generado en `innertube/potoken.ts` con `bgutils-js` + `jsdom`. Flujo:

1. `getChallenge()` pide un challenge de BotGuard a `jnn-pa.googleapis.com`.
2. Ejecutamos el intérprete de BotGuard en el `jsdom` global (`new Function(interpreterJavascript)()`).
3. `BotGuardClient.snapshot()` genera la respuesta y `GenerateIT` devuelve el integrity token.
4. `WebPoMinter.mintAsWebsafeString(visitorData)` produce el PoToken.

**Trampa crítica**: el `visitor_data` que pasas a `Innertube.create()` tiene que ser el MISMO con el que se generó el PoToken. Por eso el flujo en `session.ts` es:

```ts
const probe = await Innertube.create({ retrieve_player: false, generate_session_locally: true, enable_session_cache: false })
const vd = probe.session.context.client.visitorData
this.#poToken = await generatePoToken(vd)
// ... luego crea la Innertube real con ese vd + ese poToken + enable_session_cache: false
```

El PoToken se persiste cifrado (`safeStorage`/DPAPI) y se reutiliza ~6 h. Regenerar en cada arranque hace que Google desconfíe y suba la fricción.

## Cookies rotativas

Google rota tokens de cookie cada pocas horas. Si guardas el header `Cookie` y lo mandas siempre igual, en 12-24 h todo empieza a devolver 401/403 en silencio.

`session.refreshCookiesInBackground()` abre una BrowserWindow oculta con la partición `persist:ytauth`, carga `music.youtube.com`, espera 5s (para que Chromium acepte y aplique los `Set-Cookie`), y relee las cookies. Si cambian, reconstruye la `Innertube`. Se ejecuta al arrancar y cada 6 h.

## Si esto deja de funcionar

Diagnóstico por orden:

1. **Consola del main**: ¿aparece `[resolver] YTMUSIC ok: c=WEB_REMIX pot=true n=true sig=true`? Si no, la resolución falla — mira el error y prueba con `METROLIST_TEST_STREAM=<videoId>`.
2. **PoToken**: `METROLIST_TEST_POTOKEN=1`. Si falla, BgUtils probablemente necesita actualización (`npm i bgutils-js@latest`).
3. **Descifrado**: si `[resolver]` dice `Type mismatch, got ItemSection expected...` — es un aviso benigno del parser. Si dice «To decipher URLs...», el evaluador se ha desconectado.
4. **Ventana de bytes**: si el spool descarga los primeros N bytes y muere en 403 a los ~2 MB, `visitor_data` está desincronizado con el PoToken.
5. **Fallback yt-dlp**: si todo lo demás muere, `resolver.ts` cae a `yt-dlp -f bestaudio -j`. Si eso también rompe: `yt-dlp -U`.

## Descargas permanentes

`downloads/index.ts` NO usa el spool (iría a velocidad de streaming). Usa `yt-dlp` directamente, con timeout de 3 min por descarga, y luego `ffmpeg` para remux + tags + carátula incrustada. Se registra en la tabla `downloads` y a partir de ahí, `stream/server.ts` sirve el fichero local sin tocar la red.

## Ficheros clave a vigilar cuando algo se rompe

- `src/main/innertube/session.ts` (sesión, cookies, PoToken)
- `src/main/innertube/potoken.ts` (mint)
- `src/main/innertube/evaluator.ts` (sig/nsig)
- `src/main/stream/resolver.ts` (cadena de clientes, User-Agent)
- `src/main/stream/spool.ts` (ventana creciente, reintento tras 403)
- `src/main/stream/server.ts` (`net.fetch` vs `fetch`, servir spool o fichero local)
