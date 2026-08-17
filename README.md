# ERO'S Music

Cliente de escritorio de YouTube Music para Windows, con identidad visual heredada de la app Android original que lo inspiró y la ergonomía de un reproductor moderno tipo Spotify. Uso personal; nada de esto va a ningún servidor externo salvo las APIs de YouTube Music, LRCLIB, KuGou y (si lo activas) Discord.

> La carpeta del proyecto sigue siendo `F:\MetrolistPC` (nombre histórico, no se renombra); todo lo interno — `package.json`, appId, userData, ganchos E2E — es "ERO'S Music"/`eros-music` desde v1.2.0.

## Arranque rápido

```powershell
cd F:\MetrolistPC
npm install
npm run dev            # desarrollo (hot reload de renderer y main)
npm run build          # compila a out/
npm run typecheck      # tsc estricto sobre main+preload y renderer
npm run dist           # genera release/EROSMusic-Setup-X.Y.Z.exe (NSIS per-user, sin UAC)
```

La app instalada vive en `%LOCALAPPDATA%\Programs\eros-music\` (las versiones ≤ v1.1.x vivían en `...\Programs\metrolist-pc\`; el instalador las desinstala solo). Sus datos (sesión, caché de biblioteca, ajustes, PoToken, spool de audio) en `%APPDATA%\ERO'S Music\` — al primer arranque de v1.2.0 la app migra sola la carpeta histórica `%APPDATA%\Metrolist PC` sin perder nada (ver CHANGELOG F63). La app de dev y la instalada **comparten esa carpeta**: si estás logueado en una, lo estás en la otra.

## Requisitos que ya están en este equipo

- Node 24 · npm 11 · Git
- `ffmpeg` en PATH (etiquetado de descargas)
- `yt-dlp` en PATH (descargas offline)
- Electron 43 se descarga solo en `npm install`; si el binario falta: `node node_modules/electron/install.js`

## Arquitectura

```
F:\MetrolistPC
├─ src/
│  ├─ main/                       Proceso principal (Node, todo el I/O)
│  │  ├─ index.ts                 App lifecycle, ventanas, bandeja, teclas multimedia, ganchos smoke
│  │  ├─ innertube/               Cliente de YouTube Music
│  │  │  ├─ session.ts            Sesión youtubei.js, OAuth device-code + login por cookies, refresco periódico
│  │  │  ├─ evaluator.ts          Evaluador JS (node:vm) para descifrar sig/nsig de YouTube
│  │  │  ├─ potoken.ts            PoToken vía bgutils-js + jsdom (persistido cifrado)
│  │  │  ├─ api.ts                Fachada tipada sobre yt.music.* (search, home, playlist, álbum, etc.)
│  │  │  ├─ library.ts            Biblioteca con caché SQLite, escrituras (like, playlists, subs), historial
│  │  │  └─ mappers.ts            YTNode → DTOs serializables por IPC
│  │  ├─ stream/                  Streaming de audio
│  │  │  ├─ resolver.ts           videoId → URL de googlevideo (cadena de clientes YTMUSIC/IOS/ANDROID + yt-dlp fallback)
│  │  │  ├─ spool.ts              Descarga secuencial única a disco (workaround del rate-limit posicional)
│  │  │  └─ server.ts             Proxy HTTP local 127.0.0.1 con Range y sirviendo el spool o el fichero local
│  │  ├─ lyrics/                  Letras
│  │  │  ├─ lrclib.ts             Fuente principal
│  │  │  ├─ kugou.ts              Respaldo + KRC (tiempos por palabra, karaoke real)
│  │  │  ├─ parser.ts             Parser LRC
│  │  │  └─ index.ts              Orquestador y caché
│  │  ├─ downloads/               Descargas permanentes (yt-dlp + ffmpeg tags/carátula)
│  │  ├─ integrations/discord.ts  Rich Presence (@xhayper/discord-rpc, dedupe de presencia)
│  │  ├─ db/                      SQLite (node:sqlite): library_cache, history, settings, downloads
│  │  ├─ auth/                    encryptedCache (safeStorage/DPAPI), cookieLogin (ventana Google real)
│  │  ├─ settings.ts              Get/set + cambio de carpeta de descargas con migración de ficheros
│  │  └─ ipc/index.ts             Registro central de handlers IPC
│  ├─ preload/index.ts            API tipada expuesta al renderer vía contextBridge
│  ├─ shared/types.ts             Tipos, canales IPC, AppSettings, DEFAULT_SETTINGS
│  └─ renderer/                   React 19 + zustand (sin router externo)
│     ├─ src/
│     │  ├─ main.tsx              Punto de entrada — decide qué ventana renderizar según hash (#/mini, #/mini-settings)
│     │  ├─ App.tsx               Shell principal (sidebar + topbar + main + NowPlayingBar)
│     │  ├─ MiniPlayer.tsx        Ventana flotante siempre visible (v3)
│     │  ├─ MiniSettings.tsx      Ventana independiente de ajustes del mini
│     │  ├─ app/
│     │  │  ├─ router.ts          Router mínimo con pila (atrás/adelante)
│     │  │  ├─ authStore.ts       Estado de sesión
│     │  │  ├─ libraryStore.ts    Biblioteca del usuario + likes + trackMenu (menú contextual estándar)
│     │  │  ├─ settingsStore.ts   Ajustes, aplica tema/EQ/motor al vuelo
│     │  │  ├─ ambientStore.ts    Paleta 60-30-10 → variables CSS (tema vivo por carátula)
│     │  │  ├─ palette.ts         Extracción del ambiente (histograma de tono)
│     │  │  ├─ artworkColor.ts    Acento simple (compat con lo anterior)
│     │  │  ├─ karaoke.ts         Cálculo del relleno por palabra
│     │  │  └─ themeDom.ts        Aplicar tema desde ventanas secundarias
│     │  ├─ player/
│     │  │  ├─ engine.ts          Web Audio (2 decks + EQ 10 + preamp + volumen + analyser + crossfade)
│     │  │  ├─ store.ts           Cola, cola persistente en localStorage, radio/autoplay
│     │  │  └─ mediaSession.ts    SMTC + teclas multimedia + publicación de estado (mini/Discord)
│     │  ├─ components/           Card, Shelf, TrackTable, ContextMenu, TextModal, AmbientBackground, Logo, Icons
│     │  ├─ layout/               TitleBar, Sidebar, NowPlayingBar, QueuePanel
│     │  ├─ pages/                Home, Search, Library, Playlist, Album, Artist, Lyrics, Visualizer, Settings, Login
│     │  └─ styles/global.css     Sistema de diseño (variables 60-30-10, curvas de easing, animaciones)
│     └─ index.html
├─ tests/                         Suite Playwright + sondas por escenario
├─ assets/logo.svg + icon-256.png · build/icon.png + icon.ico
├─ scripts/make-icon.mjs          Regenera todos los iconos (PNG 512/256 + ICO 7 tamaños)
├─ electron.vite.config.ts
├─ electron-builder.yml           NSIS per-user (createDesktopShortcut, createStartMenuShortcut)
└─ package.json
```

## Cómo funciona el streaming (lo importante)

Es la pieza más frágil por diseño de Google. Va así:

1. `sessionManager` mantiene un `Innertube` singleton con dos modos: navegación (rápida) y streaming (con `retrieve_player` + PoToken).
2. `evaluator.installJsEvaluator()` inyecta un evaluador de JS con `node:vm` que descifra sig/nsig del player oficial (sin él, `resolveStream` falla con «To decipher URLs…»).
3. `resolver.resolveStream(videoId)` intenta la cadena `[YTMUSIC, IOS, ANDROID, TV_EMBEDDED]` y `yt-dlp` como red de seguridad. Devuelve la URL de googlevideo y el `User-Agent` que ese cliente espera.
4. `spool.getSpool(videoId)` descarga la canción a `%APPDATA%\ERO'S Music\spool\<videoId>.audio` con **una única petición secuencial** de rango prefijo (`0-N`) usando `net.fetch` (pila Chromium — la de undici la capa Google). Google no permite offsets > 0 con nuestro PoToken; por eso spool y no proxy directo.
5. `stream/server.ts` sirve el `<audio>` desde ese fichero según crece. Si la canción está descargada localmente, sirve directamente el `.m4a`/`.opus`.

**Trampas conocidas** (documentadas en `C:\Users\Zero\.claude\projects\F--\memory\metrolist-pc.md`):
- `visitor_data` del PoToken tiene que ir en la MISMA `Innertube.create()` que lo va a usar; regenerar visitor en cada arranque = Google desconfía. La solución: persistir el PoToken cifrado y reutilizarlo ~6 h.
- Cookies caducadas ≠ error visible: se refrescan cada 6 h navegando a `music.youtube.com` en una ventana oculta con la partición `persist:ytauth`.
- `yt.interact.like()` de youtubei.js devuelve HTTP 400 para YT Music. Hay que llamar directo a `/like/like` con `client: 'YTMUSIC'` y `target: { videoId }`.

## Sistema de diseño 60-30-10

Extraído en `renderer/src/app/palette.ts`: histograma de 12 sectores de tono ponderado por saturación sobre una miniatura 32×32.

- `--amb-60` : fondo dominante (superficie base, muy oscurecido)
- `--amb-60-soft` : versión aclarada del mismo tono
- `--amb-30` : superficie secundaria (paneles, degradados)
- `--amb-glow` : color puro del acento para halos y sombras teñidas
- `--accent`, `--accent-hover`, `--accent-press` : acento (solo si `accentMode === 'dynamic'`)

`ambientStore` observa el reproductor y repinta esas variables con transición suave (`0.8s ease-out`) cada vez que cambia la canción. Casi todo el CSS usa esas variables directamente o con `color-mix`, así que todo se actualiza sin volver a renderizar componentes.

### Curvas y timings (impeccable)

- `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)` para apariciones (nunca `ease-in`)
- `--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)` para botones y muelles
- Duración típica: 150–300 ms
- `@media (prefers-reduced-motion: reduce)` desactiva animaciones para quien lo pida

## Ajustes del usuario (`AppSettings` en `shared/types.ts`)

Todo persiste en la tabla `settings` de SQLite bajo la clave `app.settings`, un solo JSON con estos campos:

| Campo | Uso |
|---|---|
| `downloadsDir` | Carpeta de descargas (se puede cambiar y mueve los ficheros) |
| `theme` | `dark` \| `black` \| `light` |
| `accent`, `accentMode` | Color de acento fijo o dinámico por carátula |
| `bgMode` | `off` \| `ambient` \| `reactive` |
| `ambientTint` | Reservado |
| `crossfadeSec` | 0–12 s |
| `autoplay` | Radio al acabar la cola |
| `eqGains[10]`, `preampDb` | Ecualizador de 10 bandas |
| `playbackRate`, `preservePitch` | Tempo con o sin cambio de tono |
| `closeToTray` | Al cerrar la ventana va a la bandeja |
| `discordRpc` | Rich Presence |
| `miniCorner`, `miniX/Y`, `miniKaraoke`, `miniScale` | Estado del mini-player |

Un cambio en Ajustes emite `SETTINGS_CHANGED` a todas las ventanas (principal + mini + mini-settings): tema y acento se sincronizan al instante.

## Canales IPC (`shared/types.ts`)

Todos usan `ipcMain.handle` (invoke/return) salvo `MINI_STATE` (send/on) y los eventos `AUTH_STATE_CHANGED`, `DL_PROGRESS`, `SETTINGS_CHANGED`, `MEDIA_COMMAND`. El preload expone una API tipada bajo `window.api.*` con estos namespaces: `auth`, `music`, `library`, `history`, `downloads`, `player`, `settings`, `media`, `mini`, `win`.

## Tests

- `npm run typecheck` — obligatorio antes de commit
- `node tests/smoke.mjs [login|search|play|lyrics|download|all]` — E2E Playwright, la app se lanza real
- `node tests/mini-discord.mjs` — mini-player + Discord RPC completo (esquinas, escala, karaoke)
- `node tests/lyrics.spec.mjs` — parser LRC, normalización y LRCLIB real
- `node tests/visual-tour.mjs` / `tests/visual-tour2.mjs` — capturas de la estética
- `tests/probes/*.mjs` y `tests/mini-probes/*.mjs` — sondas del agente QA

Todas las pruebas heredan la sesión del usuario (viven en `%APPDATA%\ERO'S Music`). Si algún test se queda con la app abierta, mátala:

```powershell
Get-Process 'ERO''S Music' -EA 0 | Stop-Process -Force
Get-Process electron -EA 0 | Stop-Process -Force
```

## Ganchos de smoke del main (`EROS_TEST_*`)

`src/main/index.ts` reconoce variables de entorno para verificar módulos sin UI. Vía `electron.exe .`:

- `EROS_SMOKE=1` — arranca, muestra la ventana 3 s y sale (para verificar el binario)
- `EROS_SHOT=path.png` — autocaptura de la ventana a los 3,5 s
- `EROS_TEST_SEARCH="daft punk"` — imprime resultados de búsqueda
- `EROS_TEST_STREAM=videoId` — resuelve + proxea 1 KB
- `EROS_TEST_LIBRARY=1` — vuelca la estructura real de la biblioteca
- `EROS_TEST_LIKE=videoId` — like → 1 s → clear (reversible)
- `EROS_TEST_KRC="Título|Artista|dur"` — descarga y decripta KRC de KuGou
- `EROS_TEST_POTOKEN=1` — genera un PoToken de prueba

## Bugs conocidos históricos (por si vuelven)

Documentados en `tests/agent-report.md` y `metrolist-pc.md` de memoria. Los principales que ya están arreglados y por qué:

- **Biblioteca vacía** — En youtubei.js v18 los items cuelgan de `lib.contents`, no de `lib.items`. Además nunca cachear instantáneas vacías.
- **Búsqueda que deja de funcionar tras horas** — Cookies rotadas por Google. Refresco cada 6 h desde `session.ts`.
- **Crossfade + doble «siguiente» mata la música** — El timer de limpieza del deck no cancelaba al reutilizarlo. En `engine.ts`, `#fadeCleanup` cancela y comprueba si el deck volvió a ser activo.
- **`window.prompt` no existe en Electron** — Usar `askText` del `TextModalHost` en `components/TextModal.tsx`.

## Reglas de estilo internas

- Comentarios en español, código en TypeScript estricto.
- No introducir dependencias sin pesar el compromiso; preferir Web APIs (`node:sqlite`, `node:vm`, `Web Audio`, `AudioContext`).
- Cualquier `fetch` a googlevideo va con `net.fetch` de Electron (la de undici acaba en 403 por huella TLS).
- Toda escritura contra la cuenta del usuario en `library.ts` invalida la caché.
- Cambios visuales: leer variables 60-30-10 y curvas del CSS antes de inventar nuevas.
- Todas las tarjetas (`<Card>`) y filas del sidebar (`.library-row`) soportan clic derecho para menú contextual — la fábrica `cardMenu(card)` en `libraryStore.ts` decide los items según `card.kind` (canción/vídeo, álbum, playlist, artista). Para pistas de tabla la fábrica es `trackMenu(track)`.

## Regenerar iconos

```powershell
& F:\MetrolistPC\node_modules\electron\dist\electron.exe F:\MetrolistPC\scripts\make-icon.mjs
```

Produce, desde `assets/logo.svg` (F60 · infinito «coffee cream»): `build/icon.png`
(512 px, el `win.icon` real de electron-builder), `build/icon-512.png`,
`build/icon-256.png`, `build/icon.ico` (7 PNGs embebidos) y `assets/icon-256.png`
(bandeja + icono de ventana). El logo de la UI es `components/Logo.tsx` (misma
geometría sin fondo); si se retoca el dibujo hay que regenerar ambos.

## Redes de seguridad para futuras roturas

- Si YouTube rompe la extracción y toda la cadena `resolveStream` falla, `yt-dlp` sigue estando de reserva (última ronda del cliente en `resolver.ts`).
- Si la extracción de paleta se rompe (imagen tainted), el ambiente vuelve a los valores por defecto del CSS.
- Si LRCLIB o KuGou caen, el orquestador degrada por orden y termina en `null` (nunca lanza).
- Si Discord no está abierto, `ensureConnected` reintenta cada 30 s sin ruido.

## Cómo continuar en otra sesión

1. `cd F:\MetrolistPC && git log --oneline | Select-Object -First 10` para ver el estado.
2. Lee `metrolist-pc.md` en `C:\Users\Zero\.claude\projects\F--\memory\` — es el brief técnico corto con las trampas.
3. `npm run typecheck && node tests/smoke.mjs all` para verificar que nada se ha roto.
4. Para cambios visuales, edita `styles/global.css` y usa las variables `--amb-*`, `--ease-*` existentes.
5. Para cambios funcionales, la regla es: I/O en `main/`, UI en `renderer/`, contrato en `shared/types.ts` con canal IPC nuevo si hace falta.
