# Changelog

Historial de fases del proyecto por si necesitas retomar cualquier parte sin releer todo el código.

## F67 · Auto-actualización vía GitHub Releases (v1.3.0)

La app ahora se actualiza sola desde GitHub Releases (`electron-updater`), con aviso + confirmación — nunca descarga silenciosa.

- **Publicación**: `electron-builder.yml` gana el bloque `publish` (provider `github`, owner `agm22profesionalmail-dot`, repo `eros-music-releases` — repo público SOLO de releases, sin código fuente). Script nuevo `npm run release` (`electron-vite build && electron-builder --win --publish always`); `npm run dist` sigue siendo build local sin publicar. El bloque `publish` además hace que electron-builder genere el `app-update.yml` que la app empaquetada lee para saber dónde buscar versiones.
- **Flujo de usuario (un solo click)**: al arrancar (8 s de gracia para no competir con la carga inicial) y cada 6 horas (mismo ritmo que la rotación de cookies SIDTS), el main comprueba en silencio. Si hay versión nueva → banner persistente abajo-derecha ("Hay una actualización disponible", `UpdateBanner.tsx`) con "Actualizar ahora" y "Ahora no" (descartar oculta el banner esta sesión, sin persistir; reaparece al próximo chequeo). "Actualizar ahora" descarga (barra de progreso, no cancelable) y, al terminar, instala y reinicia automáticamente — sin segundo click ("Instalando, la app se reiniciará…").
- **Comprobación manual**: fila "Buscar actualizaciones" en Ajustes → Sistema (junto a "Versión de la app", F65). Sin novedades → toast "Ya tienes la última versión"; error → toast de error. Las comprobaciones AUTOMÁTICAS fallidas (sin red, repo caído) jamás molestan: `console.warn` y nada más (bandera `manualCheckInFlight` en `src/main/updater.ts` decide qué se reenvía al renderer). Un fallo de DESCARGA sí se enseña siempre en el banner (lo inició el usuario; no puede quedarse congelado en un porcentaje).
- **Piezas**: `src/main/updater.ts` (nuevo: config `autoDownload=false`/`autoInstallOnAppQuit=false`, listeners → eventos IPC `UPDATE_*` de `@shared/types`), handlers `UPDATE_CHECK`/`UPDATE_START_DOWNLOAD` en `src/main/ipc/index.ts`, namespace `updater` en el preload (mismo patrón on/cleanup que `settings.onChanged`), store Zustand `updaterStore.ts` (expuesto como `window.__erosMusicUpdaterStore` para E2E), `UpdateBanner.tsx` montado en `App.tsx` junto a los hosts globales, claves i18n `update.*` + `settings.system.checkUpdates` con paridad ES/EN.
- **Integración con F66 (crítico)**: el handler `UPDATE_INSTALL_NOW` vive en `src/main/index.ts` — donde está el flag module-level `isQuitting` — y pone `isQuitting = true` ANTES de `autoUpdater.quitAndInstall()`, exactamente igual que el "Salir" del tray. Sin eso, el intercept de `closeToTray` en `mainWindow.on('close')` escondería la ventana en vez de dejarla cerrar y la instalación se quedaría colgada. El `app.quit()` interno de `quitAndInstall()` pasa por el `before-quit` de F66 (flush de cookies, timeout 1,5 s) sin bloquearse: el instalador NSIS ya está lanzado y simplemente espera a que el proceso muera — la sesión de Google llega a disco antes del reemplazo de ficheros.
- **En dev** (`!app.isPackaged`) el auto-updater está desactivado (guards en `initAutoUpdater`/`checkForUpdatesOnStartup`); la comprobación manual responde un `UPDATE_NOT_AVAILABLE` inmediato para que el botón de Ajustes no se quede en "Buscando…".

## F66 · Cierre limpio: flush de cookies antes de salir (v1.2.3)

El usuario se quedó deslogueado tras una actualización. Causa raíz: con `closeToTray: true`, cerrar la ventana normalmente no mata el proceso — para reinstalar hizo falta un `taskkill /F`, que mata Chromium sin darle tiempo a volcar a disco su cookie store (escrituras pendientes en memoria). La sesión de Google quedó corrupta pese a que el fichero `Cookies` seguía existiendo (existir en disco no implica que el contenido sea válido).

- **`src/main/index.ts`**: `before-quit` ahora hace `event.preventDefault()`, fuerza `session.fromPartition(AUTH_PARTITION).cookies.flushStore()` (con timeout de 1,5 s, patrón F42 — ninguna promesa sin límite), y solo entonces deja pasar el `app.quit()` real (flag `cookiesFlushed` evita el bucle). Defensa en profundidad: aunque el quit sea "limpio" (vía `app.quit()`/tray "Salir"), ahora hay una garantía explícita de que las cookies llegan a disco antes de morir el proceso.
- **No arregla** la causa externa (`taskkill /F` durante una actualización manual) — eso sigue siendo mejor evitarlo usando el "Salir" de la bandeja (`isQuitting = true; app.quit()`, ya existente) en vez de matar el proceso a la fuerza. Este fix es la red de seguridad para cuando no queda otra.

## F65 · Ruta de descargas por defecto genérica + versión visible en Ajustes (v1.2.2)

- **El default de `downloadsDir` ya no menciona "MetrolistPC"**: una instalación limpia descargaba a `F:\MetrolistPC\Music` — la carpeta del PROYECTO, que solo existe en el equipo del developer (quien instale fresco no tiene disco F:) y enseñaba el nombre interno en Ajustes → Descargas. Nuevo default: la carpeta Música del usuario — `join(app.getPath('music'), "ERO'S Music")`, con fallback a `~\Music\ERO'S Music` si la app aún no está lista — centralizado en `defaultDownloadsDir()` (`src/main/settings.ts`) y reutilizado por `src/main/downloads/index.ts`. **Sin migración a propósito**: cualquier ruta ya guardada en BD (`downloads.dir` y las filas `downloads.file_path`) prevalece tal cual — decisión explícita del usuario (en su equipo la ruta vieja le da igual; solo importa que las instalaciones nuevas vean rutas limpias). La carpeta del proyecto `F:\MetrolistPC` y el fichero `metrolist.db` siguen igual (internos, ver F63).
- **Versión de la app visible en Ajustes → Sistema**: fila "Versión de la app" bajo "Tutorial de bienvenida", con `app.getVersion()` servido por el IPC nuevo `APP_GET_VERSION` (`app:getVersion` en `@shared/types` + handler en `src/main/ipc/index.ts`), namespace `app` en el preload (el tipado del renderer se deriva solo, `PreloadApi = typeof api`) y carga única al montar `SettingsPage` (`useState` + `useEffect`). Claves i18n `settings.system.version` con paridad ES/EN. El número va en monospace inline (`ui-monospace`) — no existía convención `.settings-mono` en el CSS y no compensaba crearla para un solo uso.

## F64 · Ajustes del wizard de onboarding tras iterar sobre un preview (v1.2.1)

Iteramos un preview HTML del wizard con el usuario y las mejoras del preview no se habían propagado al código React. Puestas al día:

- **Fusión `ambient` + `crossfade` → un único paso `life`** (`src/renderer/src/components/onboarding/StepLife.tsx`, nuevo; los dos anteriores borrados). Panel único con las carátulas mezclándose (mismo mecanismo `np-cover-fade-out` + `<CoverLayer enterFadeMs={2600}>` que la app real) y **toggle "Previsualizar fondo reactivo"** — OFF por defecto y solo mueve un `useState` local, **no cambia ningún ajuste real**. Al toggle ON el glow del panel viaja al color de la siguiente canción en paralelo al crossfade (2600ms).
- **Colores animados frame a frame**: `@property --_a` y `--_b` (`syntax: '<color>'`) declaradas al principio de `global.css`. Sin `@property` las CSS custom properties no son interpolables y el `background` saltaba de golpe; con `@property` el navegador interpola color a color durante los 2,6 s del fundido, en sincronía exacta con las carátulas.
- **`StepTheme` ahora solo previsualiza**: el tema original se captura en `useRef` al montar, se aplica en vivo al hacer click en cada swatch (`useSettings.update`), y el cleanup del `useEffect` restaura el original al desmontar (con guard). Cubre Siguiente, Atrás, Saltar y cierre. La nota al pie remite a **Ajustes → Apariencia → Temas predefinidos** para cambiarlo de verdad.
- **Textos i18n**: borradas las 9 claves `onboarding.ambient.*` y `onboarding.crossfade.*`, añadidas las 6 `onboarding.life.*`, y `onboarding.theme.note` reescrita. Paridad ES/EN mantenida. Rutas literales las reales de la app (`Apariencia`, `Fondo de la aplicación`) — no invenciones.
- **Nada más se toca**: `StepLogin` (solo Google) intacto, migración de userData F63 intacta, dataset de la demo F61 intacto.

## F63 · Rebranding interno completo a ERO'S Music (v1.2.0)

Hacia fuera la app ya era "ERO'S Music" desde v1.0.0 (icono, productName, nombre de proceso); ahora lo interno también:

- **Identidad**: `package.json` `name: eros-music` (antes `metrolist-pc`), `appId: com.zero.erosmusic` (antes `com.zero.metrolistpc`), AppUserModelId a juego, deep-link `erosmusic://` (antes `metrolist://`, handler sigue TODO F22). Instalación nueva en `%LOCALAPPDATA%\Programs\eros-music\`.
- **Migración de datos — IMPORTANTE, primer arranque de v1.2.0**: el userData pasa de `%APPDATA%\Metrolist PC` a `%APPDATA%\ERO'S Music` de forma transparente y ANTES de que Chromium abra ningún fichero (`src/main/index.ts`). **Ningún dato se pierde**: sesión de Google (`Partitions/ytauth`), `metrolist.db` + WAL/SHM, `Preferences`, `Local/Session Storage`, `Network`, `spool`, `ytcache`, cachés… viajan enteros. Rename atómico (mismo volumen) con fallback de copia por staging + borrado; si `ERO'S Music` ya existe no se sobrescribe nada; si no existe ninguna carpeta es una instalación limpia. Si todo fallara, la app sigue usando la carpeta vieja antes que arrancar sin datos.
- **Cola persistente**: clave de localStorage `eros.queue.v1` con lectura fallback de la vieja `metrolist.queue.v1` (se limpia sola al primer guardado).
- **Ganchos E2E y smoke**: `window.__erosMusic*` (antes `__metrolist*`) y variables `EROS_*` (antes `METROLIST_*`) — tests y docs actualizados a la vez, sin aliases.
- **Instalador**: `build/installer.nsh` sigue desinstalando en silencio cualquier versión previa cuyo DisplayName empiece por `Metrolist` o `ERO'` — la detección es por DisplayName (no por GUID/appId), así que cubre el appId viejo y el nuevo.
- **Se queda a propósito** (no es un despiste): la carpeta del proyecto `F:\MetrolistPC` y el default de descargas `F:\MetrolistPC\Music` (rutas de disco reales), el nombre de fichero `metrolist.db` (renombrarlo sería otro punto de fallo sin ganancia), las rutas viejas en la lógica de migración/instalador, y el Application ID de Discord (`docs/discord-rpc.md` — no tocar).

## F62 · Textos invisibles en los temas predefinidos (v1.1.1)

Reportado por el usuario: con un preset oscuro, el texto de algunos controles desaparecía (blanco sobre blanco); con uno claro, lo mismo al revés.

- **Causa raíz**: `.chip.active` pintaba su texto con `color: var(--bg-app)`. En los temas clásicos `--bg-app` es un color plano, pero en **todos** los presets es un `linear-gradient` — y `color: <gradiente>` es una declaración inválida, así que `color` caía a heredarse de `--text-primary`… exactamente el color con el que el chip pinta su propio fondo. De ahí el 1:1 de contraste (invisible) en los 19 presets y no en los 3 temas clásicos. Fix: `color: var(--bg-base)`, que es plano en todos los temas y siempre contrasta con `--text-primary`.
- **Mismo patrón, arreglado de paso**: `.np-play` (fondo `--text-primary`) y `.explicit-badge` (fondo `--text-secondary`) llevaban `color: #000` fijo → invisibles en cualquier tema claro, preset o clásico. Ahora usan `var(--bg-base)`.
- **Contraste del acento**: `.big-play`, `.media-card .hover-play` y `.btn-primary` ignoraban `--accent-fg` (la variable que el resto del CSS ya usa) con un `#000` fijo. Ahora la usan. Y `contrastForHex`/`contrastFor` (settingsStore y ambientStore) pasan a **luminancia relativa WCAG** con cruce en 0.179: la heurística anterior (`0.299r+0.587g+0.114b > 0.62`, sin corrección gamma) elegía blanco en colores medios donde el negro contrasta el doble — con el acento caramelo `#c98f55`, negro da 7.5:1 y blanco 2.8:1. Efecto visible: el thumb del toggle y los iconos sobre acento pasan a negro donde antes eran blancos.
- **Test de regresión**: `tests/f62-contrast.mjs` mide con `getComputedStyle` el contraste WCAG de las cinco superficies afectadas en los 22 temas (3 clásicos + 19 presets), con perfil aislado. Umbral AA 4.5:1; el peor caso real queda en 6.26:1. Verificado que **detecta** el fallo: revirtiendo el `color` a `var(--bg-app)` reporta 1:1 en los 19 presets.

## F61 · Instalador autolimpiante (v1.1.0)

`build/installer.nsh` (electron-builder lo incluye solo por estar en `buildResources`):

- **customInit**: `taskkill` de cualquier versión en marcha + barrido del registro per-user (`HKCU\...\Uninstall`): toda entrada cuyo `DisplayName` empiece por `Metrolist` o `ERO'` se desinstala en silencio (`/S`), venga del GUID que venga. Con `InstallLocation` usa `_?=` (espera real + recoge el uninstaller); sin ella, poll hasta que la clave desaparece (máx. 15 s). Dos pasadas con índice siempre creciente — sin bucles infinitos posibles. Los datos (`%APPDATA%\Metrolist PC`) sobreviven: todas las versiones publicadas llevan `deleteAppDataOnUninstall=false`.
- **customInstall**: borra los setups viejos (`EROSMusic-Setup-*.exe`, `MetrolistPC-Setup-*.exe`, `Metrolist PC Setup *.exe`) de la carpeta desde la que corre el instalador y de `%USERPROFILE%\Downloads`, conservando siempre el que se está ejecutando → al pasar instaladores a amigos ya no se les acumulan decenas de versiones. Reafirma además `DisplayName`/`DisplayVersion` en el registro. Traza en `%TEMP%\eros-f61.log`.
- Lección de verificación (dos falsas alarmas): el proceso `EROSMusic-Setup-*.exe /S` **retorna antes de que la instalación real termine** (NSIS se re-lanza). Leer el registro "justo después" enseña estados intermedios (p. ej. la clave de la versión anterior). Verificar monitorizando la clave hasta que se estabiliza, no con una lectura única.
- Primer intento fallido (corregido): ejecutar el uninstaller viejo SIN `_?=` hace que se re-lance desde TEMP y siga vivo en segundo plano tras retornar `ExecWait` — carrera con la instalación nueva. La fija es la misma técnica que usa electron-builder: copiar el uninstaller a `$PLUGINSDIR` y ejecutarlo con `_?=<dirInstalación>` (espera real), deduciendo el directorio del propio `UninstallString` con `GetInQuotes`+`GetFileParent` (llamadas `Call` directas: sus macros aún no existen en `customInit` porque `installUtil.nsh` se incluye después).

## F60 · Rediseño «Coffee Cream»: logo infinito + tema café por defecto + artistas clicables + búsqueda priorizada

**Identidad nueva** (el nombre ERO'S Music se mantiene):

- **Logo**: infinito formado por dos comas entrelazadas (crema y café) sobre fondo chocolate con esquinas redondeadas. Generado paramétricamente (lemniscata de Bernoulli muestreada con grosor variable; cada coma es medio recorrido rotado 180°, con la cola clara montada sobre el lomo café y juntas talladas por máscara SVG). La pieza café muere escondida bajo el cruce — sin salientes en la silueta del aro claro (petición explícita).
- **Assets regenerados** con `scripts/make-icon.mjs`, que ahora también produce `build/icon.png` (512) — antes el `win.icon` de electron-builder quedaba huérfano del flujo documentado — además de `build/icon-512.png`, `build/icon-256.png`, `build/icon.ico` y `assets/icon-256.png`. `Logo.tsx` replica la geometría sin fondo (paths generados; no editarlos a mano). La ventana principal lleva `icon:` también en dev.
- **Tema «Coffee Cream»** (`themePresets.ts`, primero de los oscuros, from `#6b4527` → to `#241105`): café oscuro derivado por `buildPresetVars`. `DEFAULT_SETTINGS.themePreset = 'coffee-cream'` y `accent = '#c98f55'` (caramelo, también como `--accent` base del CSS): **solo usuarios nuevos** — los ajustes guardados en SQLite prevalecen; cualquiera puede activarlo/quitarlo en Ajustes → Temas predefinidos.

**Artistas clicables en la barra inferior** (petición pendiente de una sesión anterior):

- La causa de que no funcionara: `getUpNext` aplastaba los artistas a un string sin `id`, y la cola se llena casi siempre por esa vía (radio/autoplay). Nuevo `mapPanelArtists` extrae `channel_id` de las rutas posibles del nodo (`artists[]`, `author` objeto, runs del by-line con browseId `UC…`) con degradación al texto de siempre.
- En `NowPlayingBar`, los artistas son **siempre** clicables: con `id` → perfil del artista; sin `id` (pistas antiguas en cola) → búsqueda con su nombre. La ruta `search` con `query` programática ahora rellena la caja (guardado anti-pisado: la misma query de ruta solo se aplica una vez).

**Búsqueda con prioridad YT Music** (vista «Todo»):

- Orden nuevo: Mejor resultado → Canciones → *Colaboran con X* (si el mejor resultado es un artista) → Artistas → Álbumes → Playlists → **Vídeos al final** (frames de YT ya no desplazan a las carátulas de álbum).
- «Colaboran con {name}»: derivado en cliente de las propias canciones encontradas (artistas acompañantes con id, deduplicados, máx. 8, con foto si la sección de artistas la trae). Claves i18n `search.collabs` y `np.goToArtist` en es/en.

## F44 · Iconos consistentes + popover de volumen persistente

Ronda de pulido tras F43:

- **ShuffleIcon con viewBox incorrecto**: el icono usaba `viewBox="0 0 24 24"` pero sus paths están dibujados en el rango 0-16, así que el dibujo real se quedaba en la esquina superior izquierda del cuadrado y se veía pequeño y descentrado (en la barra now-playing y en la barra de acciones de playlist/álbum). Corregido a `viewBox="0 0 16 16"` para que llene su caja como el resto de iconos de la app.
- **`.big-play` se deformaba** cuando la fila (`.detail-actions`) se estrechaba: al no tener `flex-shrink: 0`, el flex parent lo comprimía y el círculo salía ovalado. Añadido `flex-shrink: 0` a `.big-play`, `.action-shuffle`, `.action-mini`, `.action-circle`.
- **Tamaños unificados** en la barra de acciones de playlist/álbum: todos los botones secundarios son ahora 40×40 (antes había mezcla de 32/40/44 entre `.action-shuffle`, `.action-mini` y `.action-circle`). Iconos SVG a 18-20 px según densidad, todos con `line-height: 0` y `place-items: center` para centrado exacto.
- **`+` y `✎` de texto → SVG**: los botones "Añadir canciones" y "Editar" en la barra de playlist usaban caracteres Unicode que no cuadraban con los otros iconos. Ahora usan `PlusIcon` y `EditIcon` (icono nuevo con forma de plumilla, viewBox 16, path clásico).
- **Popover del volumen persistente**: hasta ahora el popover flotante (ventana estrecha) se cerraba con `:hover` puro CSS en cuanto el ratón salía del botón para ir hacia arriba a alcanzar la barra — no daba tiempo. Ahora el estado abierto lo gestiona un componente `VolumeControl` con `setTimeout` de 800 ms al ocultar, cancelable por `mouseenter` en cualquier parte del grupo (botón + popover). CSS añade un "puente" invisible de 12-14 px entre botón y popover (pseudo `::before`) para que el ratón nunca abandone el `.np-volume-group` durante el trayecto.

## F43 · Repaso integral de UI/UX (5 subagentes en paralelo, 13 tareas)

Tras un tour exhaustivo pantalla a pantalla se identificaron 13 problemas de espaciado, controles nativos, layout y comportamiento. Se delegaron a 5 subagentes que trabajaron en paralelo con archivos y secciones CSS acotadas para no pisarse. Todo verificado con `npm run typecheck` + `npm run build` limpios y los tests de regresión (`smoke`, `f36-visualizer-pixels`, `f41-visualizer-real-resize`, `f43-search-resilience` nuevo) pasando.

**Barra now-playing y micro-interacciones (agente A)**
- Barra de progreso ya no roza el borde inferior (`padding-bottom: 8px` en `.nowplaying`).
- Slider de volumen ya no roza el borde derecho (`padding-right: 12px` en `.np-right`).
- Chip activo con contraste reforzado (`color: var(--bg-app)` en vez de `--bg-base`).
- `.np-ctrl:hover` con background circular tintado (antes solo cambiaba color).
- Menú contextual: `<hr class="context-menu-sep">` en vez de `<div class="sep">`, y prop `danger?: boolean` en `MenuItem` que pinta la acción en `#ff6b6b`. Aplicado a "Eliminar playlist".

**Rejillas de Home / Biblioteca / Recap (agente B)**
- `.home-hero` (Sorpréndeme + Mix Personal): pasa de `1fr 1fr` a `repeat(2, minmax(0, 1fr))` — reparto realmente igualitario ignorando `min-content` del hijo. Igual con la fila del trío Recap: `repeat(3, minmax(0, 1fr))` + fallbacks con `:has()` para colapsar cuando el usuario oculta tarjetas.
- `.card-grid` sube el minmax a 180px para aprovechar mejor pantallas anchas (auto-fill se mantiene).
- `.recap-page` pierde su `max-width: 900px` que la dejaba a mitad de ancho; ahora el max-width lo gobierna la regla común `.page.recap-page` que aplica el agente C.

**Ajustes / Perfil / controles nativos / Sleep Timer / Cola (agente C)**
- `.page.settings-page`, `.page.profile-page`, `.page.recap-page` → `max-width: min(1000px, 100% - 48px); margin-inline: auto` — se acabó el hueco vacío de media ventana a la derecha.
- **Toggle switches** custom para todos los `<input type="checkbox">` de la app: pill 36×20 con thumb 14×14, color `--accent` cuando checked, thumb con `--accent-fg` (contrast-aware), transiciones 180ms `ease-out`. Funciona en tema oscuro y en presets claros Nitro sin retocar nada. Excepción: `.picker-check input[type=checkbox]` mantiene el look compacto original (TrackPickerModal).
- **Selects** con `appearance: none` + chevron SVG data-URI, borde `--divider`, focus con `--accent`.
- **`.pill-chip`**: chip nuevo ENTERO clicable (sin checkbox nativo colgando al lado) para las "Selecciones rápidas" de Home → Personalizar Inicio en Ajustes.
- **Sleep Timer**: fila de chips `[10] [20] [30] [60] [Al final]` antes del input; input pasa a `type="text" inputMode="numeric"` (sin spinners nativos).
- **Panel de Cola**: cabecera con botones "Limpiar cola" (papelera → deja solo el track actual) y "Guardar como playlist" (`askText` + `library.playlistCreate` con los videoIds de la cola, refresca biblioteca y toast).

**Blindaje de búsqueda (agente D)**
- `music.search()` en `main/innertube/api.ts` con try/catch en 4 niveles (llamada de red, sección, ítem, filtros F28) — típicamente el TypeError venía de `item.thumbnails[0].url` cuando `thumbnails` era `undefined` en algún resultado exótico. Ahora un ítem roto se descarta silenciosamente.
- Handler `IPC.MUSIC_SEARCH` con try/catch final: si algo escapa, devuelve `{ songs, videos, albums, artists, playlists: [] }` en vez de rechazar y provocar la banda roja "La búsqueda falló…".
- Test nuevo `tests/f43-search-resilience.mjs`: ejecuta 5 queries problemáticas ("Galantis", "daft punk", "aurora", "xxx-improbable-query-123", "$$$") y verifica que ninguna produce `.error-banner` ni el IPC directo lanza. 10/10 OK.

**Páginas Playlist / Álbum / Artista / Letras (agente E)**
- **PlaylistPage** y **AlbumPage**: barra ampliada tras el Play grande — Shuffle (44px), Compartir (32px con `ShareIcon`), Menú ⋯ (32px con `MoreVerticalIcon`) que reutiliza `cardMenu()` filtrando propio/ajeno. Para playlists ajenas guardadas, botón "Quitar de biblioteca" (32px, `HeartIcon` filled).
- **ArtistPage**: botón "Seguir" / "Dejar de seguir" al lado del Play (usa `library.subscribe`, refresca biblioteca, toast). Estado leído de `library.artists` con fallback a `ArtistDetail.isSubscribed`. Eliminado el "N/A" plano bajo el Play — un helper `hasMeaningfulValue` filtra vacíos y el literal "N/A". Suscriptores + oyentes mensuales fusionados en una sola línea `.meta` con separador `·`. Descripción bajo el nombre en `.artist-header-description` (14px, `--text-secondary`, `line-clamp: 3`).
- **LyricsPage** vacía: placeholder tipo hero — `MicIcon size={80}` en `--text-subdued`, título "No hay letra disponible" (20px), sub "Esta canción no tiene letra en ningún proveedor" (14px), botón "Buscar de nuevo" que reinicia el useState y vuelve a llamar `music.lyrics()`.
- 5 iconos nuevos en `Icons.tsx`: `MoreVerticalIcon`, `ShareIcon`, `PlusIcon`, `MinusIcon`, `CheckIcon`.

**Limitación conocida**: "Guardar álbum en biblioteca" no se pintó en `AlbumPage` porque no existe API IPC `library.albumSave/albumRemove` (queda pendiente añadir el handler). Playlists ajenas sí funcionan (`playlistDelete` con outcome `removedFromLibrary`).

**Pendiente para próxima sesión**: paridad de funciones de audio con Android (Varispeed / offload / procesamiento por hardware, tarea #11) — necesita decisión de diseño porque en Electron/Web Audio API no hay equivalente 1:1.

## F42 · Canciones que nunca cuelgan + el volumen ya no desaparece

- **Timeouts en toda la cadena de resolución de streaming** (`main/stream/resolver.ts`): ni `yt.getInfo()` por cliente, ni `format.decipher()`, ni `ensureStreamingReady()`, ni el proceso `yt-dlp` de reserva tenían límite de tiempo — si cualquiera se quedaba colgado (red rara, proxy, DNS que no responde), la promesa nunca se resolvía NI RECHAZABA y la canción se quedaba "cargando" para siempre, sin error visible, sin forma de recuperarse salvo reiniciar la app. Ahora cada paso tiene su propio timeout (`getInfo` 9 s, `decipher` 6 s, `ensureStreamingReady` 20 s, `yt-dlp` 25 s con `kill()` del proceso) — si uno falla, se prueba el siguiente cliente de la cadena en vez de quedarse esperando.
- **Segunda línea de defensa en el renderer** (`player/store.ts`, `loadAndPlay`): timeout de 40 s en `prepare()` y 15 s en `engine.load()`, por si algo se escapa de los timeouts del main (p. ej. el propio `<audio>.play()` del navegador). Todos los puntos de entrada (`playTracks`, `next`, `previous`, `togglePlay`) ya capturaban el error y limpiaban `isBuffering` — la pieza que faltaba era garantizar que la promesa SIEMPRE se resuelve o rechaza, nunca se queda pendiente.
- **El volumen ya no desaparece en ventana estrecha**: por debajo de 960 px el slider inline no cabía sin comprimir la barra de progreso, así que se ocultaba del todo (`display:none`) dejando solo el botón de silenciar. Ahora se sustituye por un popover flotante que aparece al pasar el ratón o enfocar el botón (`.np-volume-group`) — el volumen nunca es inaccesible, solo cambia de forma de interacción según el espacio disponible. Verificado en vivo redimensionando la ventana real por debajo del umbral.

## F41 · El fix de F39 no bastaba: `flex-basis: auto` seguía dejando que el contenido influyera en su propio tamaño

Con `flex-basis: auto` en `.page-transition`, en ventanas pequeñas el contenido "natural" del visualizador (carátula + texto) podía superar por unos píxeles el hueco disponible tras el topbar y desbordar igualmente (`overflow` de ~14 px detectado por test). Fix real: `flex-basis: 0` (no `auto`) — así el tamaño depende SOLO del espacio libre que reparte `flex-grow`, nunca del contenido. Mismo tratamiento aplicado a `.login-page`. Además, la carátula (`artSize`) solo miraba la altura del viewport (`52vh`) y nunca el ancho — en una ventana estrecha (mitad de pantalla) no se encogía y se comía el sitio de las barras; ahora usa Container Queries (`container-type: inline-size` + `min(52vh, 42cqw, 480px)`) para depender del ancho real de la propia página, no del viewport completo (que además incluye el sidebar).

Verificado con `tests/f41-visualizer-real-resize.mjs`, redimensionando la **ventana nativa de Electron de verdad** (vía `BrowserWindow.setContentSize`/`maximize()` desde el proceso main a través de `app.evaluate`, no `page.setViewportSize()` de Playwright — eso último solo cambia el viewport del contenido y no reproduce fielmente un resize real de ventana, dando falsos positivos/negativos) en tamaño normal, maximizada y varios tamaños intermedios/estrechos, incluida la anchura mínima real de la app (900 px).

## F40 · Scroll fantasma en el visualizador: `.page-transition` con `height:100%` no restaba el alto del topbar

El fix de F39 (`height: 100%` en `.page-transition`) arregló el centrado pero introdujo una barra de scroll que no debía existir: `.topbar` (sticky, pero sigue ocupando su propio alto en el flujo normal) es hermano de `.page-transition` dentro de `.main-scroll` — el total topbar + 100% se pasaba exactamente por la altura del topbar (56 px) y disparaba el `overflow-y:auto`. Fix: `.main-scroll` pasa a ser una columna flex (topbar + página) y `.page-transition` usa `flex: 1 0 auto` para ocupar EXACTO el hueco restante, sea cual sea el alto del topbar, sin necesitar saber su valor a mano.

## F39 · El fix de F38 no era el bug real: `.page-transition` sin altura

El usuario probó F38 y seguía viendo el hueco enorme abajo al maximizar — el fix de resize/DPI (real, pero no era la causa de ESTE síntoma) se quedó corto. Con acceso a su pantalla en vivo (`computer-use`) se reprodujo: maximizando la ventana, el bloque carátula+título se quedaba pegado arriba con un hueco gigante debajo, en vez de centrado.

**Causa real:** `.page-transition` (el contenedor de cada página dentro de `.main-scroll`, `overflow-y:auto`) no tenía ninguna regla de altura. Sin una altura *explícita* en el contenedor, el `height:100%` de `VisualizerPage` no tenía nada que resolver contra (CSS: un porcentaje de altura en un hijo solo funciona si el padre tiene una altura especificada, no "auto" por contenido) — el div se encogía a su propio contenido y el `justifyContent:'center'` no tenía espacio real que repartir. El hueco sobrante quedaba como área de scroll vacía por debajo, creciendo cuanto más alta era la ventana.

- **Primer intento (insuficiente):** `min-height: 100%` — no cuenta como "altura especificada" a efectos de que un hijo resuelva porcentajes, así que no arregló nada (verificado con un test que sí lo detectó).
- **Fix real:** `height: 100%` en `.page-transition`. Sin `overflow:hidden` en esa regla, páginas más altas que la ventana (Inicio, Biblioteca) siguen desbordando hacia abajo con total normalidad — `.main-scroll` las sigue scrolleando igual que siempre.
- Verificado con `tests/f39-visualizer-centering.mjs` contra anclas `data-testid` estables (no heurísticas de CSS, que llevaron a medir el elemento equivocado dos veces durante el diagnóstico): hueco simétrico arriba/abajo tanto en ventana normal (93px = 93px) como en ventana grande (173px = 173px), y confirmado que Inicio sigue siendo scrolleable.

## F38 · Visualizador: fix de resize/DPI + más barras y más finas

Reporte del usuario tras F36: "el espacio se ve mal al mover o agrandar la ventana". Causa: el buffer del `<canvas>` solo se resincronizaba con `window.addEventListener('resize', ...)`, que no siempre dispara al mover la ventana a un monitor con otro factor de escala (DPI) — el buffer se quedaba desajustado del tamaño CSS real y todo el dibujo salía desplazado/estirado.

- Sustituido por `ResizeObserver` sobre el propio `<canvas>` (reacciona al tamaño real del elemento, no del `window`) + un watcher de `devicePixelRatio` con `matchMedia('(resolution: Ndppx)')` (patrón estándar para detectar cambios de escala sin evento dedicado). `window.resize` se mantiene como red de seguridad.
- Verificado con `tests/f38-visualizer-resize.mjs`: redimensiona la ventana Electron de verdad dos veces seguidas (900×650 y 1400×850) y comprueba que `canvas.width/height` sigue siendo exactamente `clientWidth/clientHeight × devicePixelRatio` tras cada cambio.
- A petición: de 26 a 32 barras por lado, y más finas (tope 8 px en vez de 14 px, 34 % del hueco en vez de 55 %) — menos "bloque", más detalle.

## F37 · Crossfade real (ver F36) — confirmado en escucha real por el usuario

## F36 · Temas Nitro, CRUD de playlists, reactividad total, crossfade real, visualizador rediseñado

Tanda pedida en una sola sesión: temas predefinidos, gestión completa de playlists desde la app, que los cambios se vean sin recargar, crossfade que de verdad solapa pistas, y un visualizador nuevo. Todo verificado con tests E2E (`tests/f36-batch.mjs`, `tests/f36-visualizer-pixels.mjs`, `tests/f37-crossfade.mjs`) antes de reconstruir el instalador.

- **Temas predefinidos** (`app/themePresets.ts`): 18 paletas de colores fijos estilo Discord Nitro (8 claras + 10 oscuras), seleccionables en Ajustes → Apariencia. Cada preset deriva TODA la paleta (fondos, tarjetas, texto, divisores, scrollbar) a partir de dos colores ancla; en presets claros el texto se oscurece automáticamente para no fundirse con el fondo. `AppSettings.themePreset` (default `'none'` = tema clásico de siempre). El ambiente dinámico (tinte por carátula) se desactiva mientras haya un preset activo, para que sus colores manden de verdad.
- **CRUD de playlists real** (`main/innertube/library.ts`, menú contextual): crear ya existía; ahora también **renombrar** y **eliminar** desde la propia app — nada de "hazlo en YT Music". Borrar usa el endpoint real de YT Music con llamada directa (`client: 'YTMUSIC'`, el mismo fix que ya hizo falta para el like — el manager de youtubei.js manda el cliente equivocado y YT responde 400); si la playlist es ajena (guardada, no tuya) cae a "quitar de biblioteca". Confirmación previa con el nuevo `askConfirm()` de `TextModal.tsx`.
- **Reactividad instantánea**: crear/borrar playlist ya no espera a que YT Music termine de indexar el cambio (consistencia eventual = varios segundos de retraso). `patchCachedLibrary()` parchea la caché local y avisa a toda la app AL INSTANTE; `convergeLibrary()` reintenta en segundo plano hasta que el backend confirma, sin pisar el parche mientras tanto. Además, `PlaylistPage` y `HomePage` (que antes pedían su propia instantánea una vez y nunca más) ahora se resuscriben a `library:changed` y se refrescan solas.
- **Crossfade real** (`player/store.ts`): antes el fundido solo ocurría al saltar manualmente de pista — en el avance natural la pista ya había terminado (`ended`) y no quedaba nada que solapar. Ahora un listener de `timeupdate` dispara la transición `crossfadeSec` segundos antes del final, así que las dos pistas SÍ suenan a la vez durante el fundido, como en Metrolist Android. Verificado detectando dos `<audio>` reproduciendo simultáneamente durante la transición.
- **Visualizador rediseñado** (`VisualizerPage.tsx`, con `/impeccable` + `/taste`): las ondas de línea antiguas llegaban hasta las esquinas de la carátula. Ahora son plumas de barras redondeadas con envolvente de lente (cero en ambos extremos: nacen con aire junto al arte y mueren antes del borde de pantalla), ataque rápido/caída lenta para que el golpe entre seco y se apague como tinta, y un latido mínimo en silencio que también se desvanece en las puntas. Verificado a nivel de píxel: cero píxeles pintados sobre la carátula o sus esquinas.

## Fix · El icono pequeño de la topbar seguía mostrando la foto de Google

Segunda vuelta del fix anterior: la página de Perfil ya mostraba la foto subida, pero el icono siempre visible de la topbar (y Discord Rich Presence) seguían con la foto de Google porque ambos exigen `profile.enabled === true` y ese interruptor viene apagado por defecto — subir la foto no lo activaba. Ahora `onFileChange` en `ProfilePage.tsx` activa `enabled` a la vez que guarda `photoDataUrl`: subir una foto es una señal inequívoca de que se quiere usar, así que no tiene sentido obligar a un segundo paso manual. Verificado con `tests/debug-photo-autoenable.mjs` (sube una foto SIN tocar el checkbox, comprueba que topbar se actualiza, y restaura el perfil real exacto al terminar).

## Fix · Avatar de Perfil no reflejaba la foto subida

Reportado como "sigue sin funcionar el cambio de foto de perfil". El backend (`profile:set`, SQLite) siempre guardaba bien la foto — verificado con un test dirigido (`tests/debug-photo-upload.mjs`) que sube un archivo real por el `<input type=file>` en vez de llamar a `window.api.profile.set` directamente. El bug estaba en la vista: `ProfilePage.tsx` solo mostraba `photoDataUrl` si además `profile.enabled` (el interruptor "Usar perfil personalizado en la app") estaba activo — y ese interruptor viene apagado por defecto. Resultado: subir una foto sin haber activado antes el interruptor no cambiaba nada visualmente en la propia página de Perfil, aunque sí quedaba guardada.

- `ProfilePage.tsx`: la vista previa grande del avatar ahora muestra `photoDataUrl` en cuanto existe, sin depender de `enabled` — esta página es la que edita la foto, así que debe reflejarla siempre.
- El gating por `enabled` se mantiene sin cambios en la topbar y Discord Rich Presence (`App.tsx`, `integrations/discord.ts`), que es donde de verdad decide si la foto personalizada "se usa" en el resto de la app.

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
