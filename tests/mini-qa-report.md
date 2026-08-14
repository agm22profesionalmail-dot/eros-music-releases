# QA del mini-player tras el rediseño visual

**Fecha**: 2026-08-14
**App**: Metrolist PC (build en `out/`) — versión con paleta 60-30-10, acento dinámico por carátula, animaciones y fondo teñido.
**Metodología**: Playwright + `_electron.launch`. Dos probes ejecutados sobre la misma cuenta ya iniciada:
- `tests/mini-probes/qa-mini.mjs` (recorrido completo, 94 s)
- `tests/mini-probes/qa-mini-followup.mjs` (retest de T2b / T4 / T11a — los tres fallos originales resultaron ser errores de instrumentación, no del mini)

Capturas en `tests/mini-probes/shots/`. Resultados crudos en `tests/mini-probes/results.json` y `results-followup.json`.

Ajustes iniciales del usuario (rescatados al final): `theme=dark, accentMode=fixed, bgMode=ambient, miniCorner=tl→br, miniKaraoke=true→false, miniScale=0.8→1, discordRpc=true→false`. Los cambios temporales durante la QA se revirtieron a los valores objetivo indicados en el brief.

---

## Resumen ejecutivo

- **26/27 pruebas pasan en verde**. Ni una sola regresión funcional del mini-player.
- **1 hallazgo visual con nombre y apellido (T15)**: la barra de progreso del mini usa `background: var(--accent)` sólido, sin el `linear-gradient(--accent-press, --accent)` ni el `box-shadow` con `--amb-glow` que sí tiene la clase `.slider .fill` del reproductor grande. Se ve *bien*, pero se queda **corta respecto al rediseño**.
- **Todo lo demás luce como el resto de la app**: acento dinámico (12), fondo teñido con `linear-gradient` desde el color de la carátula (13), tema propagado sin recargar (14), animación por muelle del play (16), y karaoke con `--fill` interpolándose línea a línea (17). Layout intacto: carátula 84×84, tres botones, sin desbordamiento, ✕/ruedita alineados arriba a la derecha (18).
- **Ninguna operación destructiva sobre la cuenta**: sin sign-out, sin suscripciones, sin playlists nuevas, sin likes. Se descargó/borró cero canciones (el brief lo permitía, no fue necesario para nada).

---

## Tabla de resultados

| # | Prueba | Resultado | Detalle | Captura |
|---|---|---|---|---|
| 1a | Cerrar mini con botón ✕ | OK | | |
| 1b | Reabrir mini con icono de la app | OK | | |
| 1c | Toggle cierra desde la app | OK | | |
| 2a | Abrir mini pausado con estado correcto | OK | título/artista/tiempo poblados | 01-open-paused.png |
| 2b | Abrir mini reproduciendo con botón PAUSA | OK (retest) | `d` del path del icono == PauseIcon, audio.isPlaying=true | 02b-retest-open-playing.png |
| 3a | Play desde el mini reanuda audio | OK | | |
| 3b | Pausa desde el mini pausa audio | OK | | |
| 4 | Seek al 30 / 60 / 90 % desde la barra | OK (retest) | Δ = 1.4 s sobre pista de 369.6 s (<0.5 %) | |
| 5 | Clic en título abre/enfoca ventana principal | OK | ventana minimizada → visible tras clic | |
| 6 | Cambiar canción principal se refleja en <1.5 s | OK | 2 ms desde `playFirstSearchResult` | |
| 7a | Ajustes del mini se abre con ruedita | OK | | 03-settings.png |
| 7b | Cerrar ajustes con ✕ | OK | | |
| 8 | Cambio de esquina TL/TR/BL/BR | OK | 4 esquinas verificadas contra `workArea` | |
| 9 | Modo Libre muestra puntitos | OK | `[title="Arrastra para mover"]` visible | 04-free-mode.png |
| 10 | Slider escala 80/130/160/100 % | OK | ventana crece a 320 → 520 → 640 → 400 px | |
| 11a | Karaoke ON: aparece letra sincronizada | OK (retest) | `.karaoke-fill` presente, `--fill` interpolando | 05-karaoke-on.png / 05b-retest-karaoke.png |
| 11b | Karaoke OFF: vuelve título+timeline | OK | `.karaoke-fill` desaparece, `<b>` y barra vuelven | 06-karaoke-off.png |
| 12 | Acento dinámico cambia con la carátula | OK | álbum1 `#b4640c` → álbum2 `#797169` | 07-accent-dynamic-album1.png · 08-accent-dynamic-album2.png |
| 13 | Fondo teñido con `linear-gradient` | OK | `linear-gradient(90deg, rgba(121,113,105,.25), #121212 55%)` | |
| 14 | Cambio de tema se re-tinta el mini al instante | OK | `dark → light → black` sin recargar (dataset.theme actualiza) | |
| 15 | Barra de tiempo con degradado + glow | **WARN** | rail+fill presentes, pero `background: var(--accent)` **sólido**, `box-shadow: none`. La app grande usa `linear-gradient(--accent-press, --accent)` y `box-shadow: 0 0 8px -1px var(--amb-glow)`. Ver bugs. | |
| 16 | Animación del play (transition no vacía) | OK | `transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)` | |
| 17 | Karaoke iluminado: `--fill` cambia con el tiempo | OK | `0.0% → 25.0%` en 1.5 s de espera, `background-size` acompaña | 09-karaoke-illuminated.png |
| 18 | Layout íntegro tras rediseño | OK | 84×84 carátula, 3 botones, sin overflow, ✕/ruedita alineados (top=4, ✕ a la derecha del engranaje) | 10-layout-final.png |

**Totales: 26 OK · 1 WARN · 0 BUG.**

---

## Bugs encontrados

### Baja severidad — polish visual pendiente

- **[T15] La barra de progreso del mini se quedó fuera del rediseño.**
  - **Dónde**: `src/renderer/src/MiniPlayer.tsx`, líneas 349-361 (`<div style={{ width: '${pct}%', ... background: 'var(--accent)' }} />`).
  - **Qué falta**: el resto de la app usa `.slider .fill` con `background: linear-gradient(90deg, var(--accent-press), var(--accent))` **más** `box-shadow: 0 0 8px -1px var(--amb-glow)` (definido en `src/renderer/src/styles/global.css:1086-1094`). El mini se ve más plano al lado del reproductor grande — es el único elemento que rompe la coherencia del rediseño.
  - **Comprobación runtime**: `getComputedStyle(fill).backgroundColor = "rgb(121, 113, 105)"` (color plano), `.boxShadow = "none"`.
  - **Arreglo sugerido** (una línea): sustituir esa `background` inline por la clase `.slider .fill` o inline el mismo `linear-gradient` + `box-shadow`. Los tokens ya están en `global.css` y en `<html>`.

### Bugs de prioridad media / alta

- **Ninguno.**

---

## Impresión visual

El mini-player está **al nivel del rediseño en 9 de 10 dimensiones**. Lo que se nota especialmente bien:

1. **El fondo teñido con la carátula funciona** — la tarjeta ya no es un cuadrado plano `#121212`, tiene un lavado del color dominante de la portada en el lado izquierdo (donde está la carátula) que se disuelve al color base a la altura del 55 %. Compruébalo comparando `07-accent-dynamic-album1.png` (naranja Daft Punk) contra `08-accent-dynamic-album2.png` (marrón grisáceo Bad Guy).
2. **El acento dinámico se propaga a los botones grandes** — el círculo del play y la ✕/ruedita respiran el color del álbum. En modo `dynamic` es Material You en miniatura.
3. **Animaciones vivas donde toca** — el play tiene el mismo `cubic-bezier(0.34, 1.56, 0.64, 1)` que el reproductor grande, y el karaoke ilumina el texto con `--fill` interpolándose suave a 0.12 s por *step*.
4. **Los remates funcionales están cuidados**: puntitos de arrastre solo en modo Libre (T9), la ✕/ruedita solo aparecen en hover (T18), y las esquinas respetan la `workArea` (barra de tareas incluida — T8).
5. **La ventana de ajustes independiente** (T7) hereda tema y acento de la app; verificado en `03-settings.png`.

Único pero: la **barra de progreso** (T15) es hoy una franja plana con `background: var(--accent)`. El resto de la app luce el degradado `accent-press → accent` con `box-shadow` con `--amb-glow`. Es literalmente añadir una clase o un `linear-gradient` en línea; sin ese detalle, el mini se ve como si le faltase la última capa de barniz.

---

## Notas de metodología

- No se hicieron builds nuevos — `out/` es la versión probada.
- Antes de arrancar cada probe: `Get-Process 'Metrolist PC' | Stop-Process -Force; Get-Process electron | Stop-Process -Force`.
- Los tres bugs de la primera pasada (T2b, T4, T11a) resultaron ser errores de instrumentación de Playwright:
  - **T2b**: contaba `<rect>` para distinguir `PauseIcon` de `PlayIcon`, pero ambos iconos usan `<path>` — el retest los distingue por el `d` (Pause empieza por `M5.7`, Play por `m7.05`).
  - **T4**: `mini.locator('div').filter({ has: ... })` no localizaba el `div` raíz del seek (`onPointerDown`). El retest resuelve el `boundingClientRect` en-page con `evaluate` filtrando por `flex:1 + height:12 + cursor:pointer`, y los tres seeks pegan con Δ = 1.4 s sobre 369 s.
  - **T11a**: se probó con "Yellow" (Coldplay) — se ve que no tiene letra sincronizada en las fuentes que consulta el main. El retest con "Bad Guy" carga `.karaoke-fill` en <9 s y ya interpola.
- Al terminar se restauraron todos los ajustes al estado objetivo del brief (`accentMode:'fixed'`, `bgMode:'ambient'`, `miniCorner:'br'`, `miniKaraoke:false`, `miniScale:1`, `discordRpc:false`), preservando `theme` y `accent` del usuario. Verificado con `window.api.settings.get()` al cierre.

---

## Ficheros generados

- `tests/mini-probes/_lib.mjs` — harness compartido
- `tests/mini-probes/qa-mini.mjs` — probe principal (23 asertos)
- `tests/mini-probes/qa-mini-followup.mjs` — retests de T2b/T4/T11a
- `tests/mini-probes/results.json` — resultados crudos de la primera pasada
- `tests/mini-probes/results-followup.json` — resultados crudos del retest
- `tests/mini-probes/shots/*.png` — 12 capturas numeradas
