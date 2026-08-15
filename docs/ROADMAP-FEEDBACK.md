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

## F26 · Check integral final
- Un subagente QA que verifica:
  - Todo lo anterior funciona a la vez sin regresiones.
  - Cero errores en consola del main/renderer.
  - Los flujos completos: crear perfil → escuchar canción → RPC actualiza con perfil; abrir "Canciones que me gustan" → filtrar por género → crear playlist hija; buscar en biblioteca; usar Sorpréndeme.
  - Confirma restauración de settings al terminar.
- Devuelve informe con OK/BUG por bloque.

## Norma común a todos los subagentes

- `npm run typecheck` verde antes de commit.
- No tocar áreas fuera de las listadas en su bloque (ejemplo: F21 no cambia el motor de audio ni el mini).
- Test rápido de SU feature con Playwright o probe.
- Silencio: audio muted durante las pruebas.
- Nada de escribir en la cuenta del usuario salvo lo que la propia feature requiere (F22 añade a playlist real, F23 crea playlist local si eso funciona sin cuenta).
- Commit al final con mensaje `F<N> · <título>`.
