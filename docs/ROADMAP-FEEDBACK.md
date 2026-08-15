# Feedback de amiga · roadmap secuencial

Cada bloque = un subagente. Se ejecutan uno a uno; el siguiente arranca cuando el anterior confirma "OK" y commit. Nada de paralelismo — hay solapes en `PlaylistPage.tsx` y `HomePage.tsx`.

## F20 · Perfil de usuario
- Nuevo `renderer/pages/ProfilePage.tsx` accesible desde el avatar de la topbar (Perfil ↔ Ajustes).
- Campos: nombre visible, foto de perfil (subir desde disco, se guarda como data URL), descripción corta, lista de artistas favoritos (busca y añade), playlists "públicas" (marcar cuáles compartir).
- Almacenamiento en tabla `settings` con clave `app.profile` (JSON).
- La foto de perfil sustituye la de Google en el avatar de la topbar y en el mini-player.
- Contrato tipado en `shared/types.ts`: `interface UserProfile`.
- IPC: `profile:get`, `profile:set`.
- Test: crear/guardar/leer perfil sin romper sesión existente.

## F21 · Búsqueda en playlists y biblioteca
- En `PlaylistPage.tsx` y `LibraryPage.tsx`: cabecera con `<input>` de búsqueda + icono de lupa. Filtra las filas visibles por título/artista (no re-consulta backend).
- Debounce 150 ms. Estado en memoria local (no persistir).
- La búsqueda vacía muestra todo. Placeholder "Buscar en la lista…".
- Test: escribir "daft" filtra a las que contengan "daft" en title/artist.

## F22 · Botones de playlist (añadir · compartir · editar)
- En cabecera de `PlaylistPage.tsx`, junto al big-play: **tres** botones circulares — `+` (Añadir canciones), `↗` (Compartir), `✎` (Editar).
- **Añadir canciones**: abre `TrackPickerModal` (nuevo componente): buscador integrado, resultados con checkbox, chip persistente con selección acumulada aunque cambies la búsqueda. Botón "Añadir N canciones" al final. Llama `window.api.library.playlistAdd(id, videoIds)`.
- **Compartir**: copia al portapapeles `https://music.youtube.com/playlist?list={id}` y muestra toast "Enlace copiado". Registro de protocolo `metrolist://` para deep-link en futuras versiones (documentar, dejarlo listo si electron-builder lo permite fácil).
- **Editar** (nuevo): abre modal para cambiar **título** y **carátula**:
  - Título: input de texto con validación (≤ 100 chars).
  - Carátula: selector de fichero + preview cuadrado (mantener 1:1). Redimensiona a 512×512 (JPEG 0.85) antes de guardar. Recorte centrado si la imagen no es 1:1.
  - Guardar: intenta primero `window.api.library.playlistEdit(id, {title, thumbnailDataUrl})` (el main lo intenta contra YT Music si la playlist es del usuario; si YT Music no acepta cambio de carátula por API — no lo acepta oficialmente — guarda el título vía `yt.playlist.setName()` y la carátula solo en override local (tabla `playlist_overrides` en SQLite: `videoId, title, thumbnailDataUrl`)).
  - Los overrides locales se aplican al renderizar la playlist en cualquier vista (sidebar, cabecera, cards, cola) — la próxima consulta al backend usa los override si existen.
  - Solo se puede editar playlists creadas por el usuario (no las "Música que me gusta" ni las playlists de otros). Botón deshabilitado si no aplica.
- Test: abrir modal, seleccionar 2 canciones distintas de 2 búsquedas distintas, añadir, y comprobar que la playlist creció en 2. Editar título+carátula, cerrar app, reabrir → los cambios persisten en la vista.

## F22b · Fix: menú contextual universal + multi-select de géneros

Dos fixes derivados del uso real:

- **Clic derecho abre menú contextual en TODAS las tarjetas** (canción, vídeo, álbum, playlist, artista) — no solo en las filas de la tabla. Cubre `.media-card` en Home, resultados de búsqueda, biblioteca, tarjetas de la cabecera del artista, sidebar (filas de "Tu biblioteca"). Menú específico según tipo (canción tiene "Reproducir ahora / Añadir a la cola / Me gusta / …"; playlist tiene "Reproducir / Añadir a la cola / Compartir / Editar / …"; artista tiene "Ir a artista / Reproducir radio / Seguir");
- **Multi-selección de chips de género en "Música que me gusta"** — el usuario puede activar varios chips a la vez (OR lógico: canciones que pertenezcan a cualquiera de los géneros marcados). El botón cambia a "Crear playlist con [Rock, Pop, Chill]" y crea una playlist con el nombre "Me gusta · Rock + Pop + Chill". Chip "Todos" resetea la selección.

## F23 · Filtros de género en "Canciones que me gustan"
- Chips estilo Spotify en la parte superior de la playlist (arriba de la tabla): Latina, Pop, Rap, Dance, Chill, Amor, Disco, Nostalgia, etc. (10-14 chips fijos).
- Cada canción se etiqueta por género inferido — heurística: mapeo `artista → géneros`. Usar Last.fm `artist.getTopTags` (free, sin API key en modo básico) O caché local por artista. Fallback: si Last.fm no responde, sin género.
- Al pulsar un chip: la cola se restringe a esas canciones y el shuffle respeta el filtro.
- Botón "Crear playlist con [Género]" — playlist nueva en la cuenta del usuario o local (empieza local: `local:` prefijo en id).
- Test: chip Pop filtra ≥1 canción; crear playlist local; que aparezca en sidebar.

## F24 · Home: Sorpréndeme + Mix Personal
- En Home, arriba de las estanterías: dos tarjetas grandes:
  - **Sorpréndeme**: reproduce una canción aleatoria de un artista relacionado a tus favoritos/historial. Usa `yt.music.getUpNext(seedVideoId)` con seed del favorito reciente, o `getArtist(favArtistId).songs` con muestreo aleatorio.
  - **Mix Personal**: llena la cola con N canciones mezclando: 40% favoritas, 30% artistas favoritos y 30% descubrimiento (relacionados con esos). Genera cola de 25 canciones y reproduce.
- Test: pulsar Sorpréndeme reproduce sin errores; Mix Personal encola ≥15 tracks.

## F25 · Discord Rich Presence con perfil
- Cuando `profile.enabled === true`:
  - `largeImageText`: nombre visible del perfil.
  - `smallImageKey`: foto de perfil del usuario (URL HTTPS o data URL — Discord acepta URLs externas ahora).
  - `state`: canción actual, `details`: "por {artista}".
- Si no hay perfil: comportamiento actual ("YouTube Music"). Toggle en Ajustes ya existente.
- Test: cambiar el nombre del perfil se refleja en RPC.

## F27 · Paridad de reproducción con Metrolist Android

Ajustes con impacto real en la reproducción, tomados de la app original:

- **Calidad de sonido** (Auto / Alta / Media / Baja) — filtra formatos por bitrate al resolver.
- **Desactivar crossfade en álbumes gapless** — flag para respetar continuidad de álbumes diseñados sin pausas.
- **Normalización del audio** (loudness/ReplayGain) — `DynamicsCompressor` de Web Audio con curva suave.
- **Nivel de volumen** (Suave / Normal / Alto / Agresivo −7 dB) — target LUFS de la normalización.
- **Búsqueda progresiva** — cada salto adicional consecutivo suma 5 s (para acelerar seeks largos).
- **Temporizador de apagado (sleep timer)** — activar, tiempo custom, "detener al finalizar canción actual", "desvanecer último minuto".
- **Evitar pistas duplicadas en la cola** — al añadir mueve en vez de duplicar.
- **Saltar al haber error** — si `<audio>` emite `error`, avanza a la siguiente automáticamente.
- **Aleatorio persistente** + **Recuerda mezclar y repetir** — persistir shuffle/repeat entre sesiones.
- **Mezclar primero la lista, luego similar** — política de shuffle-first antes del autoplay.
- **Deshabilitar carga automática al repetir todo** — no rellenar la cola cuando `repeat === 'all'`.
- **Descargar automáticamente al dar me gusta** — dispara `enqueueDownload` al hacer like.
- **Habilitar contenido similar** — controla si el autoplay dispara al final de la cola.
- **Cargar automáticamente más canciones** — variante del anterior más agresiva (precarga al 80%).
- **Duración del historial** — máximo de entradas guardadas en `history`.

## F28 · Filtros de contenido

- **Ocultar contenido explícito** — filtra `isExplicit` en resultados de búsqueda, home, álbumes.
- **Ocultar canciones de vídeo** — oculta `kind: 'video'` en resultados y estanterías.
- **Ocultar YouTube Shorts** — filtro por duración < 60 s y tipo shorts.
- **Idioma / País de contenido** — pasa `hl` y `gl` a `Innertube.create()` al arrancar.
- **Página del Artista**: toggles para descripción, número de suscriptores y oyentes mensuales.
- **Pausar al silenciar dispositivo** — escucha cambios del dispositivo de salida (Web Audio `AudioContext.audioWorklet`).

## F29 · Fuentes de streaming configurables

- Lista reordenable en Ajustes: WEB_REMIX, TVHTML5, IOS, ANDROID_MUSIC, ANDROID_VR, WEB_CREATOR, MWEB.
- Cada fuente con toggle enable/disable y descripción corta (calidad, límites).
- El `resolver.ts` respeta el orden y salta las deshabilitadas. `yt-dlp` sigue como último recurso.

## F30 · Proveedores de letras configurables

- **Selección de proveedor**: LRCLIB, KuGou, YouTube Music (letra oficial).
- **Prioridad**: arrastrable en Ajustes.
- **Romanización de letras**: opción para transliterar hiragana/kanji/hangul a alfabeto latino usando `kuroshiro` (o wanakana + pinyin-pro) — carga opcional según CJK detectado.

## F31 · Wrapped y estadísticas · CERRADO

- **Historial extendido**: acumula meses de reproducciones locales, con conteo por canción/artista/álbum.
- **Lo más escuchado semanal / mensual** — playlists auto-generadas desde el historial local.
- **Tarjeta Recap** en Home (últimos 30 días).
- **Mi Top** — top N canciones/artistas, N configurable (default 50).

Implementación: módulo `src/main/stats/` agrega sobre el historial local
(`readHistoryWithMeta` en `db/`). Cuatro nuevos canales IPC (`stats:topTracks`,
`stats:topArtists`, `stats:recap`, `stats:createTopPlaylist`), expuestos en
`window.api.stats`. Nueva `RecapPage` con métricas grandes (horas, únicos,
top artista), grid Top 10 canciones + Top 5 artistas, selector de rango
(semana/mes/30 días) y botones para crear playlists auto-generadas en la
cuenta. Home añade hasta tres tarjetas (Recap, Top semanal, Top mensual)
tras el HomeHero de F24; se ocultan con toggles en Ajustes → Estadísticas.

Limitación conocida: el esquema `history` guarda una única fila por videoId
con la última fecha de reproducción y un `play_count` global, así que
filtrar por período usa `played_at` como proxy — una canción con play_count
alto que vuelve a sonar dentro del rango cuenta con TODO su play_count. Es
la aproximación pragmática que evita duplicar filas por cada reproducción.

## F32 · Personalización de Home

- **Ordenar aleatoriamente la pantalla de inicio** — shuffle de estanterías con pesos.
- **Establecer selecciones rápidas** — el usuario elige qué categorías aparecen arriba (Radios, Novedades, Mixes, Recientes…).

## F33 · Proxy (opcional avanzado)

- Configuración de proxy HTTP/SOCKS en Ajustes.
- Aplica a `net.fetch` y a `yt-dlp` (vía `--proxy`).

## F34 · i18n de la interfaz

- Español (actual), Inglés. Framework mínimo: dict JSON por idioma + hook `useT()`.
- Detección automática de `app.getLocale()` con override en Ajustes.

## F35 · Check integral final v2

Cuando F27-F34 estén implementados: nuevo QA integral que valide todo (aparte del F26 tras F25).

## Excluido — no aplica en PC

- Habilitar descarga de audio (offload) — específico de Android AudioTrack.
- Usar procesamiento de audio por hardware — específico de Android AudioTrack.
- Habilitar Varispeed — YA existe como toggle `preservePitch` (invertido).
- Agregar alarma / Permitir alarmas exactas — AlarmManager de Android.
- Optimización de la batería — Doze mode de Android.
- Reanudar al conectar Bluetooth — MediaButton receiver de Android.
- Mantener la pantalla encendida — flag `keepScreenOn` de Android.

## F26 · Check integral final
- Un subagente QA que verifica:
  - Todo lo anterior funciona a la vez sin regresiones.
  - Cero errores en consola del main/renderer.
  - Los flujos completos: crear perfil → escuchar canción → RPC actualiza con perfil; abrir "Canciones que me gustan" → filtrar por género → crear playlist hija; buscar en biblioteca; usar Sorpréndeme.
  - Confirma restauración de settings al terminar.
- Devuelve informe con OK/BUG por bloque.

## Norma común a todos los subagentes

- **Silencio visual**: el usuario está jugando. En cualquier test Playwright, inmediatamente después de `app.firstWindow()` ejecuta `await win.evaluate(() => window.api.win.minimize())` y mantén la ventana minimizada toda la prueba. Playwright funciona igual con la ventana minimizada. Nunca dejes ventanas de Electron abiertas visibles.
- `npm run typecheck` verde antes de commit.
- No tocar áreas fuera de las listadas en su bloque (ejemplo: F21 no cambia el motor de audio ni el mini).
- Test rápido de SU feature con Playwright o probe.
- Silencio: audio muted durante las pruebas.
- Nada de escribir en la cuenta del usuario salvo lo que la propia feature requiere (F22 añade a playlist real, F23 crea playlist local si eso funciona sin cuenta).
- Commit al final con mensaje `F<N> · <título>`.
