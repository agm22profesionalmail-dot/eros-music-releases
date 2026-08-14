# Informe QA — Metrolist PC (2026-08-14, sesión iniciada como «Galaxy Chinpum», auth cookie)

**Método**: 13 sondas Playwright+Electron (`tests/probes/probe01…13`), app real con la sesión del usuario, capturando consola del renderer y stdout/stderr del main. Capturas en `tests/probes/shots/`. Sondas 1–11 contra la build de las 19:28; el desarrollador recompiló `out/` a las 20:09 durante la sesión (sondas 12–13 contra esa build). Los ficheros fuente citados en las causas raíz no cambiaron entre ambas.

---

## Veredicto del bug nº 1: «la barra de búsqueda no funciona»

**La búsqueda funciona en todas las condiciones que pude provocar hoy**: API directa (`music.search`) y flujo UI real, 40+ consultas, con acentos/ñ/emoji/128 chars, tecleo a 5 ms/tecla, borrado rápido, los 6 chips de filtro, antes y después de reproducir (la sesión se reconstruye con PoToken al reproducir y sigue buscando bien), 10 peticiones concurrentes: **0 rechazos**. Latencias 250–750 ms.

**No es un fallo permanente del código de búsqueda: es un fallo de resiliencia.** Lo que sí encontré explica exactamente la percepción del usuario:

1. **[ALTO] Los errores de búsqueda son 100 % invisibles.** `SearchPage.tsx` hace `.catch(() => undefined)` sobre `window.api.music.search`. Si el main rechaza (sin red, cookies caducadas, 4xx de InnerTube), el spinner desaparece y la página queda **en blanco: sin resultados, sin mensaje, sin reintento**. Repro de escritorio: cualquier fallo transitorio del backend. El error real solo aparece en el log del main (`Error occurred in handler for 'music:search'…`), que el usuario nunca ve.
2. **Causa raíz más probable del reporte**: instancia abierta durante horas/días. `session.ts` lee las cookies de la partición **una sola vez al arrancar** (`restore()` → `readCookiesFromPartition()`); cuando Google rota SAPISID/cookies, el snapshot `#cookieHeader` queda obsoleto, todas las llamadas empiezan a fallar y, por el punto 1, la búsqueda «deja de funcionar» sin ningún error visible. Reiniciar la app lo «arregla» (relee cookies frescas) — típico de este patrón de queja. No hay refresco de cookies ni manejo de 401.
3. **[MEDIO, reproducido] Resultados obsoletos con la caja vacía.** Al vaciar el input, el efecto hace `setResults(null)` y `return` **sin cancelar el timeout del debounce pendiente**: la búsqueda antigua se dispara igualmente y pinta resultados debajo de «Escribe algo para buscar». Repro: escribir «bad bunny» rápido (~50 ms), borrar todo antes de 300 ms, esperar 2 s → 8 filas de resultados + estado vacío a la vez. Captura: `shots/01-race-clear.png`.
4. **[MEDIO, por código] Carrera respuesta-vieja-pisa-nueva.** El flag `cancelled` se declara dentro del callback del `setTimeout` y su «cleanup» se devuelve al `setTimeout` (código muerto, nunca se ejecuta). Toda respuesta que llegue hace `setResults`: si una petición vieja resuelve más tarde que la nueva, verás resultados de una consulta anterior a lo escrito.
5. **[MEDIO] «Mejor resultado» nunca se muestra.** El main lo intenta mapear (`MusicCardShelf` → `mapToCard`) pero `mapToCard` clasifica por `item_type`, que un card-shelf no tiene → `topResult` sale siempre `null`; además `SearchPage` ni siquiera renderiza `results.topResult`. En «Todo» falta la tarjeta principal que YT Music considera la respuesta a tu consulta.

**Recomendación mínima**: estado de error visible + botón reintentar en SearchPage; releer cookies de la partición (o reconstruir sesión) cuando una llamada InnerTube falle con 401/403; cancelar el debounce al vaciar la consulta; ignorar respuestas fuera de orden (contador de petición).

---

## BUGS por severidad

### CRÍTICO
- **B1. La biblioteca del usuario está siempre vacía (sidebar y «Tu biblioteca»).**
  - Síntoma: sidebar sin ninguna playlist/álbum/artista (solo esqueletos → nada); pestañas Playlists/Álbumes/Artistas/Canciones de «Tu biblioteca» muestran «Nada por aquí todavía». Verificado con red: `library.refresh()` devuelve `{playlists:0, albums:0, artists:0, songs:0}` pese a haber sesión (la cuenta tiene historial y descargas locales; toda cuenta tiene al menos «Tus me gusta»).
  - Causa raíz (verificada contra `node_modules/youtubei.js/dist/src/parser/ytmusic/Library.js`): la clase `Library` de youtubei.js v18 expone los items en **`lib.contents`** (array de `Grid`/`MusicShelf`); `src/main/innertube/api.ts:117` itera `lib?.items ?? lib?.sections ?? []` → siempre `[]` → snapshot vacío, que además **se cachea** en SQLite y se sirve `fromCache` en los siguientes arranques.
  - Daño colateral: el submenú «Añadir a playlist» del menú contextual solo ofrece «+ Nueva playlist…» (no lista las playlists reales); «Quitar de esta playlist» no se puede probar; el corazón no puede reflejar nada.
  - Fix: iterar `lib?.contents ?? []` (el bucle interior ya contempla `section.contents ?? section.items`).

### ALTO
- **B2. «Me gusta» está roto: HTTP 400 en todos los intentos.**
  - Repro: clic en el corazón de la barra inferior (o «Me gusta» del menú contextual). La UI se pinta optimista y **revierte** ~1 s después.
  - Error exacto del main (2/2 intentos, permitidos por las reglas; la cuenta quedó intacta porque nada se aplicó):
    `Error occurred in handler for 'library:rate': InnertubeError: Request to https://www.youtube.com/youtubei/v1/like/like… failed with status code 400 — "Invalid value at 'target' (…LikeTarget), \"dN3y8kVNplA\""`
  - Causa: `lib.setTrackRating` usa `yt.interact.like(videoId)` (endpoint/forma de payload de YouTube normal); para YT Music el target rechaza ese valor. Consecuencia extra: como el like nunca se aplica, no se pudo validar el ciclo completo de escritura.
- **B3. Con crossfade activado, pulsar «siguiente» dos veces mata la reproducción.**
  - Repro real (sonda 10): Ajustes → Crossfade 4 s → reproducir álbum → «siguiente», esperar 1,5 s, «siguiente» → a los 7 s **ambos `<audio>` pausados y sin `src`**, la barra muestra una pista como si sonara. Captura: `shots/10-crossfade-kill.png`. Con crossfade 0 (por defecto) el spam de «siguiente» ×6 es robusto.
  - Causa raíz (`engine.ts:159`): el `setTimeout` del final del crossfade hace `from.el.pause(); from.el.removeAttribute('src')` **sin comprobar si ese deck ha vuelto a ser el activo**; el segundo next intercambia los decks y el timeout del primero ejecuta la limpieza sobre la pista en curso.
- **B4. Sesiones largas + rotación de cookies = app «muerta» silenciosa** (detállado arriba en el veredicto de búsqueda; afecta a búsqueda, home, biblioteca, radio y streaming por igual).

### MEDIO
- **B5. Las descargas no sirven para reproducir sin conexión.** `STREAM_PREPARE` llama **siempre** a `resolveStream` (red, `ensureStreamingReady`+PoToken) aunque el fichero esté descargado; el fichero local solo se usa al servir bytes (`server.ts:63`). Verificado: `prepare()` de la canción recién descargada → `via=YTMUSIC`, 823 ms y una resolución de red nueva. Sin red, una descarga no se puede reproducir (el prepare rechaza). Fix: cortocircuito en el handler o en `resolveStream` cuando `getDownloadPath(videoId)` exista.
- **B6. Descarga sin feedback de fallo/atasco.** La misma canción: una ejecución no registró nada en 90 s (sin evento `error`; nada en disco) y la siguiente completó en ~20 s (8,8 MB opus, correcta). Si yt-dlp se atasca, la UI no muestra ningún estado persistente de error en Descargas.
- **B7. La cola no tiene menú contextual.** Clic derecho sobre un elemento del panel de cola → nada (0 botones). No existe «quitar de la cola» con ratón; `removeFromQueue` existe en el store pero no está cableado a ninguna UI del panel.
- **B8. El corazón nunca refleja los «Me gusta» existentes.** `likedIds` nace vacío y no se hidrata de ninguna fuente al arrancar (ni siquiera cuando B1 se arregle, no hay código que derive likedIds de la biblioteca); solo registra toggles de la sesión en curso.

### BAJO
- **B9. Chip activo del tema Claro casi ilegible** (relleno oscuro con texto oscuro). Captura: `shots/08-tema-Claro.png` (chip «Claro»).
- **B10. Ruido del parser de youtubei.js en el main log**: `LiveBadge / TextBadge / MenuCustomIconItem not found` (clases JIT), `Type mismatch … MenuCustomIconItem` (entradas «Buscar en AXS/Ticketmaster» de páginas de artista) y «Unable to find matching run for attachment run». **No fatales** (la búsqueda/artista siguen devolviendo datos), pero ensucian el diagnóstico; conviene actualizar youtubei.js cuando haya release con esos nodos.
- **B11. Observado una vez, no reproducido (11 «siguiente» posteriores limpios)**: tras un «siguiente», el `<audio>` reportó `t=86,7 s` en una pista recién empezada (sonda 6). Posible artefacto de estimación de tiempo sobre webm parcial del spool. Vigilar.
- **B12. A verificar (evidencia ambigua por recompilación en caliente)**: en el primer arranque de la build 20:09 (sonda 12), Discord RPC se conectó y publicó presencia («conectado como _zerosplat», «presencia: Human After All…») cuando el último valor persistido conocido de `discordRpc` era `false`; en el siguiente arranque con `discordRpc:false` no se conectó. Probablemente el desarrollador activó el toggle en paralelo (también cambió `miniCorner` entre sondas), pero conviene confirmar que `setDiscordEnabled(getAllSettings().discordRpc)` corre antes del primer `MINI_STATE`.

---

## Lo que FUNCIONA (verificado)

- **Búsqueda** (con backend sano): resultados en <1 s, secciones Canciones/Vídeos/Artistas/Álbumes/Playlists, 6 chips de filtro, acentos/ñ/emoji, tecleo rápido, sugerencias (API), búsqueda durante reproducción, 10 concurrentes.
- **Home con sesión**: estanterías personalizadas («Selecciones rápidas», «Nuevos descubrimientos…», «Canciones en tendencia para ti»), 18 tarjetas; hover-play reproduce; clic en tarjeta-canción reproduce; tarjetas de álbum/playlist/artista navegan a su detalle.
- **Reproducción**: doble clic e icono hover-play; play/pausa; siguiente/anterior (anterior con >3 s reinicia, con <3 s va a la anterior — como Spotify); **seek arrastrando** la barra a ~50 % (el audio salta y sigue); volumen y mute (cadena WebAudio: el fill del slider 80 %↔0 % y la ganancia, no `el.volume`); aleatorio y ciclo de repetición off→all→one→off; **transición automática al acabar la pista** (~1 s, con precarga del siguiente stream); **autoplay/radio al agotar la cola** (1 canción suelta → al acabar rellena con recomendaciones y sigue, cola=4+).
- **Cola**: panel con «Reproduciendo»/«A continuación»; «Siguiente en la cola» inserta en 2ª posición; «Añadir a la cola» al final.
- **Páginas de detalle**: playlist (cabecera, 29 pistas, big-play reproduce), álbum (13 pistas), artista (8 estanterías, big-play reproduce el top). Atrás/adelante del topbar consistentes (search→artista→atrás→adelante) y deshabilitados cuando no hay historial.
- **Tu biblioteca**: pestañas presentes; **Historial** (8 entradas reales) y **Descargas** funcionan (son locales, no dependen de B1).
- **Letras**: sincronizadas de LRCLIB (78 líneas en Get Lucky), la línea activa avanza (10→16 en 12 s), **autoscroll** (612→957 px), clic en línea busca ese punto (línea 30 → t=136,4 s), desfase −0,5/+0,5/Reset actualiza el indicador; instrumental (Voyager) → «No se encontró letra para esta canción».
- **Menú contextual**: Reproducir ahora / Iniciar radio (cola de 50) / Siguiente en la cola / Añadir a la cola / Descargar / Ir a ROSALÍA (navega) / Ir al álbum (solo cuando la pista tiene álbum, correcto) / submenú Añadir a playlist (existe; contenido capado por B1).
- **Descargas**: e2e correcto en la 2ª ejecución — yt-dlp → etiquetado ffmpeg → `F:\MetrolistPC\Music\Daft Punk - Around the World.opus` (8,8 MB), aparece en Biblioteca→Descargas y se reproduce (sirve el fichero local; la resolución sigue yendo a red, B5). La descarga previa del usuario (Da Funk.opus) intacta.
- **Ajustes**: temas Oscuro/Negro/Claro cambian de verdad (`data-theme` + paneles; capturas 08-tema-*.png); selector de acento presente (+ modo Dinámico); **velocidad 1,5×** aplicada (`playbackRate=1.5` en ambos decks; el audio avanzó 3,0 s en 2 s de reloj); EQ de 10 bandas + presets + preamp (banda 31 Hz a +6 dB con música sonando, sin errores); crossfade configurable. «Cerrar a la bandeja» NO se tocó; selector de carpeta NO automatizable (diálogo nativo) — no probado, como se pidió.
- **Ventana** (frameless): minimizar/maximizar/restaurar/cerrar con los botones custom; con `closeToTray:false` cerrar termina el proceso; **900×600 aguanta** (sin overflow horizontal, sidebar 280 px + main 596 px + barra inferior visibles). El input de búsqueda no está tapado por la zona de arrastre (hit-test OK).
- **Robustez**: spam «siguiente» ×6 (crossfade 0) termina reproduciendo; navegación rápida Inicio↔Buscar↔Biblioteca con música; tecleo agresivo con borrado; **0 pageerrors y 0 errores de renderer en toda la sesión**; sin pantallas en blanco ni crashes.

## Estado dejado
- Sesión del usuario intacta (nunca se llamó a signOut ni se tocaron particiones). Ajustes restaurados a su snapshot (verificado por lectura). +1 descarga de prueba («Around the World.opus», permitida) junto a la existente. El «Me gusta» permitido no llegó a aplicarse en la cuenta (400 en like y en clear → cuenta como estaba). Durante la sonda 12 Discord publicó presencia unos segundos (toggle activado externamente, ver B12).
- Sondas reutilizables en `tests/probes/` (`node tests/probes/probe01-search.mjs`, etc.; matar instancias antes por el single-instance lock).
