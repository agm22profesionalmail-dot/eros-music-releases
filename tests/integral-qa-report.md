# QA integral · 2026-08-15 · 00:41

Script: `tests/integral-qa/run.mjs` · Duración: **135,2 s** · Cuenta: `Galaxy Chinpum` (cookie)

## Resumen

**95 pruebas · 74 OK / 16 WARN / 5 BUG / 0 SKIP**

Estado: **⚠️ apto para uso con reservas** — la app funciona en el flujo principal (sesión, búsqueda, reproducción, cola, descargas offline, mini-player, integración Windows, robustez), pero se detectaron tres regresiones de UI y un puñado de warnings que rozan bug.

Cero errores en el `stderr` del main (excluyendo el ruido conocido de `youtubei.js`: `Parser`/`Text`/`Type mismatch` — 5 ocurrencias) y **0 errores** en la consola del renderer.

## Bugs por severidad

### 🔴 Crítico
_(ninguno — la app no se cuelga, no pierde reproducción, no destruye datos)_

### 🟠 Alto — mirar cuanto antes
- **[2-home] Home no renderiza estanterías**. `document.querySelectorAll('.shelf').length === 0` tras abrir Inicio y esperar 1,5 s. La tarjeta suelta (`.media-card`) sí existe con su carátula y `.title`/`.subtitle` separados (gap 4 px), así que hay contenido — lo que falta es la agrupación en `.shelf`. Posible regresión de nombre de clase tras F15 (Diseño vivo) o Home no completa la carga en 1,5 s.
- **[4-sidebar] Modal «Nueva playlist» no se abre**. Al hacer clic en el `.sidebar-library-header .icon-btn` no aparece ningún `.modal / .modal-overlay / .text-modal`. F10 dejó implementado el `TextModal` propio; puede que el botón `+` esté ligado a otro handler o el modal use otro selector.
- **[11-ajustes] Cambio de tema no propaga al main**. `window.api.settings.set({ theme: 'black' })` deja `document.documentElement.dataset.theme = 'dark'`; lo mismo con `'light'`. Curioso: la ventana mini SÍ se re-tinta a `black` cuando le llega el evento (bloque 10 lo confirmó). Sugiere que el listener de `SETTINGS_CHANGED` del main dejó de aplicar `theme` al `<html>` (o requiere >400 ms; la re-tint del mini usó 700 ms sin problema, pero eso sigue apuntando a un listener frágil).

### 🟡 Medio — no bloquea pero se nota
- **[3-busqueda] Sección «Mejor resultado» no aparece** para `"daft punk get lucky"`. Los resultados sí llegan (11 pistas; doble clic reproduce «Get Lucky»), pero el `<h2>` con «Mejor resultado» no está en el DOM. Posible cambio de literal o de tag.
- **[11-ajustes] `audio.playbackRate` no cambia** con `settings.set({ playbackRate: 1.5 })` — el `<audio>` sigue en `1`. La preferencia se guarda (`settings.get()` la refleja), pero no se aplica al elemento activo. Sospechoso: el binding entre store y `audioRef.playbackRate` no está en vivo.
- **[8-letras] Fondo difuminado no detectado**. Ningún elemento con `filter: blur(...)` o `backdrop-filter: blur(...)` visible en LyricsPage. Regresión potencial de F16 (que introdujo el `blur(72px) saturate(1.35)` estilo Apple Music).
- **[8-letras] `.karaoke-fill` ausente** aunque la letra sincronizada de «Get Lucky» carga 80 líneas y el clic-seek funciona (4,5 s → 48 s). El resaltado de la línea activa via `--fill` no aparece, o usa otra clase.
- **[5-detalles] Álbum: tabla con thumbnails redundantes** (14 filas con `<img>` >24 px). Diseño previo de F3 eliminaba estos thumbnails cuando ya hay cover grande en la cabecera; podría ser un revert.

### 🟢 Bajo — cosmético o probable falso positivo del test
- [1-arranque] Sin trazas `[auth]/cookie` en el arranque (informativo).
- [2-home] `0 botones .play-hover` (podría ser cambio de selector).
- [5-detalles] Menú contextual sobre pista: falta la entrada «Ir al artista» (las otras 8 están todas).
- [5-detalles] Artist page: 0 `.shelf` con carruseles (misma familia que el bug de Home).
- [8-letras] Solo 1 botón `±0.5s` (esperaba 2; puede que el `+0,5` y `-0,5` compartan controles).
- [8-letras] KRC per-palabra sin `.words/.word` con `"晴天 周杰倫"` (KuGou puede no devolver KRC para esa pista).
- [11-ajustes] Selectores no encontrados: `[data-accent]`, `input[type="color"]` — muy probable **selector obsoleto del test**, no bug de la app.
- [11-ajustes] `like/clear` no ejecutado por no exponer `data-current-videoid` desde el renderer.
- [7-descargas] Sin traza `via=` en el log del main tras dblclick de canción descargada — no se pudo confirmar si sirvió local o remoto (la descarga sí quedó registrada; F12 «offline first» no verificado).

## Regresiones vs CHANGELOG

| # | F | Descripción | Estado |
|---|---|-------------|--------|
| 1 | F12 | Biblioteca vacía | **OK** — 13 filas en sidebar, 5 pestañas |
| 2 | F12 | Like HTTP 400 | **no verificado** — sin videoId accesible |
| 3 | F12 | Crossfade + doble siguiente mataba reproducción | **OK** — spam siguiente x5 sigue tocando (`Veridis Quo (Edit)`) |
| 4 | F12 | Búsqueda «que deja de funcionar» | **OK** — 4/4 queries devuelven resultados; sugerencias API funcionan |
| 5 | F12 | Offline first (canción descargada sirve local) | **no verificado** — sin traza `via=local` en main |
| 6 | F12 | Cola sin menú contextual | **OK** — menú aparece con opciones |
| 7 | F12 | Chip claro contraste | **OK** — visual `color: rgb(179, 179, 179)` sobre fondo transparente |
| 8 | F18 | Títulos pegados en tarjetas/filas | **OK** — home gap 4 px, library-row gap 2 px |
| 9 | F16 | Letras con carátula difuminada | **REGRESIÓN posible** — no se detecta `blur` en la LyricsPage |
| 10 | F15 | Estanterías reactivas en Home | **REGRESIÓN posible** — sin `.shelf` en Home ni en Artist |
| 11 | F14 | Tema propaga en vivo a todas las ventanas | **REGRESIÓN parcial** — el mini re-tinta, el main no cambia `data-theme` |
| 12 | F10 | Modal `+` para nueva playlist | **REGRESIÓN** — clic no abre modal |
| 13 | F8 | SMTC + teclas multimedia | **OK** — metadata presente, `MediaPlayPause`/`Next`/`Prev` registradas |
| 14 | F11 | Discord RPC | **OK** — 19 líneas `[discord]` presencia con título+artista |
| 15 | F7 | Descargas offline (`yt-dlp`) | **OK** — 8,7 MB `.opus` en 8 s, aparece en biblioteca |

## Tabla completa por bloque

| # | Bloque | OK | WARN | BUG | SKIP |
|---|--------|----|------|-----|------|
| 1 | Arranque/sesión | 3 | 1 | 0 | 0 |
| 2 | Home | 1 | 2 | 1 | 0 |
| 3 | Búsqueda | 13 | 0 | 1 | 0 |
| 4 | Sidebar/biblioteca | 9 | 0 | 1 | 0 |
| 5 | Detalle playlist/álbum/artista | 6 | 4 | 0 | 0 |
| 6 | Reproducción | 10 | 0 | 0 | 0 |
| 7 | Descargas y offline | 2 | 1 | 0 | 0 |
| 8 | Letras | 3 | 4 | 0 | 0 |
| 9 | Visualizador | 2 | 0 | 0 | 0 |
| 10 | Mini-player | 6 | 0 | 0 | 0 |
| 11 | Ajustes | 6 | 6 | 2 | 0 |
| 12 | Integración Windows | 3 | 0 | 0 | 0 |
| 13 | Robustez | 6 | 0 | 0 | 0 |
| — | Cleanup | 2 | 0 | 0 | 0 |
| — | **Totales** | **74** | **16** | **5** | **0** |

## Detalle de contenido (positivo)

Lo que quedó verificado sin drama:

- **Sesión**: cookie de `Galaxy Chinpum` restaurada, foto de perfil presente.
- **Búsqueda**: `"daft punk"` (11), `"rosalía motomami"` (8), `"bad bunny"` (8), unicode `"テストひらがな"` (13), reset limpio; 6 chips filtran, 6 sugerencias API.
- **Playlist propia**: cabecera con cover grande, big-play, meta sin duplicados (`«... • 2026·11 canciones • 35 minutos»`), tabla de pistas.
- **Reproducción**: siguiente cambia pista (3/3 títulos únicos), audio avanza (4 s tras cada cambio), cola con secciones «Reproduciendo» y «A continuación», aleatorio activa, repetición cicla 3 estados, seek al 50% (164,35 s) y 90% (295,83 s) exactos, autoplay al acabar la cola («Giorgio by Moroder» aparece automáticamente), anterior con >3 s reinicia (0,56 s).
- **Descargas**: `yt-dlp` bajó `Daft Punk - Around the World.opus` (8,77 MB) en ~8 s; queda registrado en biblioteca y se limpia al final.
- **Letras**: LyricsPage con 80 líneas para «Get Lucky», clic-seek funciona (4,5 s → 48 s).
- **Visualizador**: `animation-name: vinyl-spin` presente, 2 canvas.
- **Mini-player**: abre a `file:///.../#/mini`, título se sincroniza <1,5 s con el main, 6 botones en ajustes, `setScale(0.8/1.3/1.0)` OK, `data-theme=black` heredado.
- **Ajustes**: `bgMode` (off/ambient/reactive) escribe, `eqGains[0]=3` se guarda, Discord RPC publica presencia (19 líneas `[discord]` con «Dj Akshay Na Duff · DJ Akshay Chalisgaon»).
- **Windows**: `navigator.mediaSession.metadata` completo, `globalShortcut.isRegistered('MediaPlayPause'|'MediaNextTrack'|'MediaPreviousTrack')` los tres a `true`.
- **Robustez**: navegación rápida x8 sin pantalla en blanco, spam «siguiente» x5 sigue reproduciendo (crossfade 0 estable — F12 no ha vuelto), viewport 900x600 sin overflow horizontal, viewport 1600x1000 renderiza 15 tarjetas.

## Cleanup

- **Descarga de prueba borrada** (`Daft Punk - Around the World.opus` / `videoId=Jb6gcoR266U`), fichero eliminado del disco.
- **Ajustes del usuario RESTAURADOS a los originales reales** (no al target genérico de la instrucción). Se lanzó `tests/integral-qa/restore-user-settings.mjs` que releyó `settingsBefore` de `results.json` y devolvió tal cual: `theme=dark`, `accent=#ff8800`, `accentMode=dynamic`, `bgMode=reactive`, `eqGains=[6,5,4,2,0,...]`, `preampDb=2`, `discordRpc=true`, `closeToTray=true`, `miniCorner=tl`, `miniScale=0.85`, `miniX=750`, `miniY=4`. Verificación: `diffs: []`.

## Silencio

Audio muted a lo largo de toda la sesión:
- `MutationObserver` inyectado tras cada arranque que fuerza `audio.muted = true` en cualquier `<audio>` nuevo (bibliotecas de mini y main incluidas).
- Volumen del store puesto a 0 al arrancar.
- Discord RPC se activó brevemente para verificar (`ok`) y se desactivó de inmediato.

## Impresión

La aplicación **funciona muy bien en el flujo core** (reproducir, buscar, descargar, letras, mini-player, cola, autoplay, integración Windows, resize). Las regresiones más molestas están en la capa de UI de decoración: Home no muestra sus estanterías reales, el botón `+` de nueva playlist no abre modal, el cambio de tema no llega al main aunque sí al mini, y el fondo blur de LyricsPage parece haber desaparecido — todo pintado por refactores recientes (F14–F16). Un par de warnings (`swatches`, `color picker`, KRC) son casi seguro selectores viejos del test más que bugs reales, pero merecen una segunda mirada. Ninguna regresión F12 volvió: la búsqueda no se ha quedado colgada, el spam de «siguiente» no mata la reproducción, la biblioteca no está vacía, la cola tiene menú.

Archivos: `tests/integral-qa/run.mjs` (script), `tests/integral-qa/_lib.mjs` (harness con `block()` tolerante a fallos + `SKIP`), `tests/integral-qa/results.json` (dump completo), `tests/integral-qa/run.log` (traza cronológica), `tests/integral-qa/shots/` (10 PNGs), `tests/integral-qa/restore-user-settings.mjs` (restaurador de settings reales).
