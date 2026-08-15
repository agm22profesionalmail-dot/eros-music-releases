# Changelog

Historial de fases del proyecto por si necesitas retomar cualquier parte sin releer todo el código.

## F34 · i18n de la interfaz (es/en)

Framework mínimo de traducción con dict JSON por idioma (`src/renderer/src/i18n/{es,en}.json`) y hook `useT()` (`src/renderer/src/app/i18n.ts`), sin dependencias nuevas — Zustand vale como store del locale.

- Nueva clave `uiLanguage: 'auto' | 'es' | 'en'` en `AppSettings` (default `auto`, detecta el sistema con `navigator.language` — fallback a `es`).
- `settingsStore` aplica el locale al arranque, en cada `update()` y en cada `settings:changed` vía IPC, y refleja el resultado en `<html lang>`.
- Selector nuevo en Ajustes → Apariencia (auto/Español/English).
- Traducidas las cadenas más visibles al primer nivel: sidebar, topbar, saludos y toasts de Home, tarjetas Hero/Recap, cola, títulos de sección de Ajustes y `<h1>` de Ajustes. No traducido a propósito: menús contextuales complejos, modales F22, mensajes de error largos. `contentLanguage` (F28) sigue siendo aparte — este cambio es solo la piel visible.
- `useT()` se suscribe al `locale` (no a `t`, cuya referencia era estable) para que el cambio de idioma re-renderice al instante.

## F17 · Barra inferior estilo Metrolist

Now-playing bar más pulida: carátula de 60 px con sombra teñida del ambiente, animación de zoom al pasar el ratón, y **crossfade + blur** al cambiar de canción (`animation: cover-swap`). La `key={videoId}` en el `<img>` fuerza que la animación se dispare por cada canción distinta.

## F16 · Letras a pantalla completa

`LyricsPage` estrena capa de fondo con la carátula gigante difuminada (`blur(72px) saturate(1.35)`) tipo Apple Music «concert mode». Anima con `lyrics-bg-in` al cambiar de canción.

## F15 · Diseño vivo (ambiente 60-30-10)

Sistema de diseño reactivo a la carátula:

- `renderer/src/app/palette.ts` extrae la paleta 60-30-10 con histograma de 12 sectores de tono ponderado por saturación.
- `ambientStore.ts` publica `--amb-60`, `--amb-60-soft`, `--amb-30`, `--amb-glow` (y `--accent-*` si dinámico) con transición 0.8 s.
- `AmbientBackground.tsx` pinta 3 blobs derivantes con `blur(64px)` (estilo Discord Nitro); en modo `reactive` respiran con los graves del `AnalyserNode`.
- Superficies del shell reescritas con `color-mix()` para tintarse; sombras con `--amb-glow`.
- Barra de progreso reestrenada: gradiente del acento, glow, punto arrastrable con muelle.
- Microanimaciones: `heart-pop`, `play-pulse` (big-play cuando esa lista suena), `card-in` escalonado, shine en hover de carátulas, `page-transition`, `slide-in-left` del sidebar.
- Visualizador de audio nuevo: `pages/VisualizerPage.tsx` con carátula como disco de vinilo girando + espectro de 64 barras en espejo.
- Setting `bgMode`: `off` / `ambient` / `reactive`.
- Impeccable: `prefers-reduced-motion` respetado; sin `ease-in` al aparecer.

## F14 · Mini v3 (ventana de ajustes, karaoke, escala)

- Ventana independiente `#/mini-settings` con diagrama de pantalla clicable para las 4 esquinas + libre; slider de tamaño 80-160 %; toggle de karaoke.
- Modo karaoke: sustituye título/timeline por la letra sincronizada iluminada palabra a palabra.
- **Karaoke por palabra**: `lyrics/kugou.ts` descarga `fmt=krc`, desencripta (magic `krc1` + XOR con clave pública 16B + inflate), parsea `[inicio,dur]<offset,dur,0>palabra...` y expone `LyricLine.words`. `renderer/src/app/karaoke.ts` calcula el porcentaje sumando duraciones reales; sin KRC, estimador `chars * 70 ms`.
- Ventana de ajustes hereda tema y acento en vivo (evento `SETTINGS_CHANGED` a todas las ventanas).

## F13 · Mini v2 (esquinas + layout)

- Anclaje a 4 esquinas (respetando la barra de tareas) + posición libre con **imán al soltar cerca**.
- Layout definitivo: `[carátula 84 | título·artista + timeline | ◀ ⏯ ▶]`.
- Seek desde la barra del mini; agarre de puntitos arriba centro en modo libre.

## F12 · Fixes del informe QA

- **Biblioteca vacía** (v18 devuelve `lib.contents`, no `lib.items`; no cachear vacíos).
- **Like HTTP 400**: llamada directa `/like/like` con `client: 'YTMUSIC'`.
- **Crossfade + doble siguiente mataba la reproducción**: `#fadeCleanup` cancelable.
- **Búsqueda «que deja de funcionar»**: cookies rotativas cada 6 h + botón Reintentar visible.
- **Offline first**: si la canción está descargada, servir el fichero local sin tocar la red.
- **Descargas colgadas** sin aviso: timeout de 3 min con error visible.
- **Cola sin menú**: menú contextual (reproducir ya, quitar).
- **Likes sin hidratar**: `getLikedIds()` al arrancar rellena el `Set`.
- **Chip tema claro**: `color: var(--bg-base)` para contraste.

## F11 · Mini-player + Discord RPC

- Ventana flotante con `alwaysOnTop`, botón toggle en la barra y en la bandeja.
- Publica estado a 1 Hz por `MINI_STATE`.
- `integrations/discord.ts` con `@xhayper/discord-rpc`, clientId público `1177081335727267940` (mismo que th-ch/youtube-music para que Discord lo muestre como «YouTube Music»). Dedupe: solo reenvía presencia cuando cambia pista, estado o hay seek > 3 s.

## F10 · Personalización avanzada

- Foto y nombre de la cuenta (query background a `yt.account.getInfo()`).
- Modal propio (`components/TextModal.tsx`) porque `window.prompt` no existe en Electron.
- Botón `+` en el sidebar para crear playlists.
- Acento dinámico + degradados en cabeceras de detalle con el color de la carátula.
- Cola persistente entre sesiones (localStorage con carga perezosa al pulsar play).

## F9 · Instalador

- `electron-builder.yml` con NSIS per-user (sin UAC), atajos en Escritorio y Menú Inicio.
- `build/icon.ico` con 7 tamaños PNG embebidos generados por `scripts/make-icon.mjs`.

## F8 · Integración Windows + Ajustes

- SMTC vía `navigator.mediaSession`.
- Teclas multimedia globales con `globalShortcut` en el main.
- Bandeja del sistema con menú contextual.
- Página de Ajustes con EQ 10 bandas + presets, tempo/pitch, temas, colores de acento, carpeta de descargas con migración de ficheros.

## F7 · Descargas y modo offline

- Cola FIFO en el main, descarga con `yt-dlp -f bestaudio`, remux + etiquetado con ffmpeg (título/artista/álbum + carátula incrustada en m4a; opus no admite).
- Registro en tabla `downloads` de SQLite. Modo offline transparente: si la canción está descargada, el proxy sirve el fichero local.
- Progreso por IPC `DL_PROGRESS`.

## F6 · Letras sincronizadas

- Orquestador (`lyrics/index.ts`) con orden LRCLIB → KuGou → LRCLIB plano. En F14 se antepuso KRC de KuGou (palabra a palabra).
- Parser LRC con soporte multi-timestamp por línea y metadatos ignorados.
- Vista de letras con autoscroll, clic-seek, ajuste de desfase ±0,5 s.

## F5 · Home, búsqueda y radio

- Home con estanterías reales de YT Music.
- Búsqueda con debounce, chips de filtro, sugerencias.
- Autoplay/radio: al agotar la cola pide `getUpNext(último videoId)` y extiende con recomendaciones únicas.

## F4 · Biblioteca y sincronización bidireccional

- Instantánea cacheada en SQLite (arranque instantáneo + tolerancia a caídas).
- Escrituras contra la cuenta: like, subscribe, playlist add/remove/create.
- Historial local + `addToWatchHistory` en la cuenta.

## F3 · UI estilo Spotify

- Layout de 3 zonas (sidebar redimensionable, main con topbar sticky, NowPlayingBar).
- Sistema de temas, tarjetas, tablas de pistas, cabeceras de detalle.
- Branding Metrolist (M roja, `#f43f4f` de acento).

## F2 · Motor de audio

- Dos `<audio>` alternantes con `AudioContext`, cadena preamp → EQ 10 → volumen → destino.
- Crossfade con `linearRampToValueAtTime`, gapless con precarga del deck inactivo, tempo con `preservesPitch`.
- **Descubrimientos que definieron el diseño de streaming**: googlevideo con nuestro PoToken solo acepta rangos prefijo (`0-N`) y trocea la respuesta; `fetch` de undici capa a 1 MiB pero `net.fetch` de Chromium acepta hasta 4 MiB; una sola descarga simultánea. Solución final: spool secuencial a disco.

## F1 · Núcleo InnerTube

- `Innertube.create` con caché cifrada (`safeStorage`/DPAPI).
- Login dual: OAuth device-code o cookies (ventana con la página real de Google en partición aislada).
- PoToken con `bgutils-js` + `jsdom`, persistido y reutilizado ~6 h.
- Evaluador JS con `node:vm` para sig/nsig (obligatorio desde youtubei.js 14+).
- API tipada (`api.ts`) + mapeadores defensivos (`mappers.ts`).

## F0 · Andamiaje

- `electron-vite` + React 19 + TypeScript estricto.
- Ventana sin frame, titlebar propia con controles y área arrastrable.
- Preload con contextIsolation y API expuesta bajo `window.api`.
