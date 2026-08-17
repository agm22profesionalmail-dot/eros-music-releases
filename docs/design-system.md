# ERO'S Music · Guía de Diseño y Arquitectura

> **Audiencia:** Desarrolladores y colaboradores del proyecto.
> **Versión base:** 1.4.6 · Última revisión: 2026-08-17

---

## 1. Stack tecnológico

| Capa | Tecnología | Notas |
|------|-----------|-------|
| Runtime | Electron 43 | Chromium embebido, IPC main↔renderer |
| Renderer | React 19 + TypeScript | SPA, Vite (electron-vite 5) |
| Estado | Zustand | Stores: `playerStore`, `settingsStore`, `authStore`, `ambientStore`, `profileStore`, `homeStore`, `libraryStore` |
| Estilos | CSS global (`global.css`) | ~3 400 líneas, CSS custom properties, sin preprocesador |
| Build | electron-vite 5 → electron-builder NSIS | `npm run build` + `npx electron-builder --win nsis --config` |
| API | InnerTube (YouTube Music) | `src/main/innertube/` — cliente no oficial, proxy local |
| BD | SQLite (better-sqlite3) | Descargas, historial, géneros, letras |
| i18n | JSON (`es.json`, `en.json`) | Helper `useT()` |

---

## 2. Paleta y tokens de color

### 2.1 Regla de oro

**Nunca hardcodear un color en un componente.** Usar siempre tokens CSS (`var(--nombre)`). La única excepción son los colores `#fff`/`rgba(255,…)` dentro de las tarjetas hero (que siempre son fondos vibrantes + texto blanco).

### 2.2 Tokens raíz (tema oscuro por defecto)

```css
--bg-app:           #000000      /* fondo del titlebar / borde exterior */
--bg-base:          #121212      /* fondo principal */
--bg-highlight:     #1a1a1a      /* fondo ligeramente elevado */
--bg-elevated:      #242424      /* superficies flotantes (modales, popovers) */
--bg-press:         #2a2a2a      /* estado pressed */
--bg-card:          #181818      /* tarjetas, placeholders, skeletons */
--bg-card-hover:    #282828      /* hover de tarjetas */
--bg-tinted:        rgba(255,255,255,0.07)   /* tint sutil */
--bg-tinted-hover:  rgba(255,255,255,0.12)
--text-primary:     #ffffff
--text-secondary:   #b3b3b3
--text-subdued:     #6a6a6a
--accent:           #c98f55      /* caramelo ERO'S (personalizable en Ajustes) */
--accent-hover:     #d7a367
--accent-press:     #b57d45
--divider:          #2a2a2a
--shadow-card:      0 8px 24px rgba(0,0,0,0.5)
```

### 2.3 Temas alternativos

- **`data-theme="black"`** — AMOLED: todo a `#000` base
- **`data-theme="light"`** — fondos claros, sombras más sutiles
- **19 presets de acento** — solo cambian `--accent`, `--accent-hover`, `--accent-press`

### 2.4 Colores ambientales

El sistema de colores ambientales extrae 3 colores de la carátula en reproducción:
```
--amb-60      → fondo principal (60%)
--amb-60-soft → fondo suave
--amb-30      → superficies secundarias (30%)
--amb-glow    → sombra/resplandor de la carátula
```
**Nunca usar los tokens amb-* para elementos estáticos.** Solo para superficies que cambian con la canción.

---

## 3. Tipografía

| Rol | Fuente | Notas |
|-----|--------|-------|
| Todo | `Segoe UI Variable Display` → `Segoe UI` → `system-ui` | La pila de fallback es importante; nunca añadir fuentes CDN |

No se usan fuentes web externas (CSP las bloquea en artifacts, y en Electron preferimos la nativa del sistema).

---

## 4. Layout y espaciado

### 4.1 Estructura global

```
┌──────────────────────────────────────────┐
│  Titlebar (--titlebar-h: 36px)           │
├──────────┬───────────────────────────────┤
│ Sidebar  │  Contenido principal          │
│ 280px    │  (scroll-y, padding 24px)     │
│          │                               │
│          │                               │
├──────────┴───────────────────────────────┤
│  NowPlayingBar (--nowplaying-h: 90px)    │
└──────────────────────────────────────────┘
```

### 4.2 Curvas de movimiento

```css
--ease-out:    cubic-bezier(0.16, 1, 0.3, 1)    /* apariciones, transiciones */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1) /* rebotes, popups */
```

**Regla:** NUNCA usar `ease-in` para apariciones. Las cosas aparecen rápido y frenan suavemente (`ease-out`). `ease-in` solo para desapariciones.

### 4.3 Accesibilidad de movimiento

```css
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

---

## 5. Componentes de Home

### 5.1 Hero Cards (`.home-hero`)

**Grid:** `repeat(3, minmax(0, 1fr))`, gap 14px. Colapsa a 1 columna a ≤860px.

**Reglas visuales:**
- Las 3 tarjetas DEBEN usar el **acento** del usuario. NUNCA hardcodear un color de fondo independiente (como `#c23616`).
- Diferenciación entre tarjetas: invertir el degradado, mezclar con otro tono vía `color-mix()`.
- Hover: `scale(1.02)` + `brightness(1.05)`. Sutil, no exagerado.
- Active: `scale(0.99)`.
- Disabled (loading): `cursor: progress`, `brightness(0.9)`.
- Los botones que hacen operaciones async DEBEN tener estado de carga visible (texto cambia a "Preparando…", se deshabilitan).
- Los que solo navegan (e.g. "Lo más escuchado" → recap) NO necesitan loading.

**Variantes de degradado (solo ángulo, MISMOS tokens de acento):**
```css
.hero-card           { background: linear-gradient(135deg, var(--accent), var(--accent-press)); }
.hero-card--mix      { background: linear-gradient(135deg, var(--accent-press), var(--accent)); }
.hero-card--hot      { background: linear-gradient(315deg, var(--accent), var(--accent-press)); }
```
NUNCA mezclar con hex hardcodeados (`color-mix(… #d35400)`) — resulta en colores sucios.

### 5.2 Quick Picks (`.home-quick-picks`)

Fila de chips/tags arriba del hero. Filtran las estanterías por categoría.

### 5.3 Estanterías (`.shelf` + `.card-grid`)

**Grid:** `repeat(auto-fill, minmax(180px, 1fr))`, gap 16px.
**Tarjetas (`.media-card`):** fondo transparente, hover `translateY(-4px)`.
**Entrada:** `@keyframes card-in` con delay escalonado `calc(var(--i) * 35ms)`.

### 5.4 Espiral Musical (`.home-spiral`)

Sección al final de Home. 3 filas de tarjetas en scroll continuo tipo marquee.

**Tamaño de tarjetas — FLUIDO:**
```css
.spiral-card { --_sz: clamp(72px, calc((100vh - 300px) / 3.5), 120px); }
```
- NUNCA usar `@media (max-height)` para cambiar tamaños de la espiral.
- Todo (badges, gaps, textos) escala proporcionalmente vía `calc(var(--_sz) * factor)`.

**Scroll:**
- Animación CSS `spiralScroll` 80s linear infinite, `translateX(0 → -50%)`.
- Contenido duplicado `[...row, ...row]` para loop sin costuras.
- Dirección aleatoria por fila (`.spiral-reverse`).

**Interacción:**
- Hover **PAUSA** la animación → solo en contenido real.
- Skeleton **NUNCA** pausa (`pointer-events: none` en `.spiral-row--skeleton`).
- Hover en tarjeta real → `brightness(1.25)` + triple box-shadow (borde accent + halo interior + glow exterior).
- El `.spiral-row` tiene `padding: 6px 0` para dar espacio al glow exterior.

**Rotación (pool):**
- ~70% de las pistas van a las 3 filas, ~30% al pool de reserva.
- Cada 2 ciclos de animación (`CYCLES_BEFORE_SWAP`), se intercambian 2 cards con el pool.
- Una canción NUNCA aparece en dos filas simultáneamente.

**Filtros obligatorios:**
- Pistas sin `thumbnailUrl` → descartadas (el escaparate necesita imagen).
- Pistas de Home (shelves) excluidas vía `homeVideoIds`.
- Dedup por `videoId` + máximo 1 por artista principal.
- `isSmallArtist` solo si suscriptores < 100k (verificado vía `getArtist()`).

### 5.5 Skeleton / Loading

**Regla general:** Mientras carga contenido, mostrar placeholders grises con shimmer que replican la forma del contenido real. NUNCA mostrar un espacio en blanco vacío.

**Estanterías:**
- `LoadingSpinner` (loading.webm tintado con acento) centrado arriba.
- 3 secciones `.shelf` con título placeholder + 5 tarjetas grises cada una.
- Shimmer: `@keyframes spiralShimmer` (recorre de izquierda a derecha, 1.6s).

**Espiral:**
- `LoadingSpinner` centrado sobre las filas.
- 3 filas de 14 tarjetas grises con shimmer + scroll activo.
- `pointer-events: none` → el ratón NO interactúa con el skeleton.
- El scroll del skeleton NUNCA se pausa por hover.

**Shimmer CSS universal:**
```css
background: linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.06) 50%, transparent 75%);
background-size: 200% 100%;
animation: spiralShimmer 1.6s ease-in-out infinite;
```

---

## 6. Caché y rendimiento

### 6.1 Home cacheada (`homeStore.ts`)

Los datos de las estanterías se cargan UNA vez y se reutilizan al volver a Home. Usar `fetchIfNeeded()` en el componente, no fetch directo.

**Refresco:** solo cuando cambia la biblioteca (`library.onChanged` con reason `playlist*` o `subscribe`).

### 6.2 Espiral cacheada (módulo)

Variables `cachedTracks` y `cacheLoading` a nivel de módulo. Si ya hay caché, se usa instantáneamente sin fetch.

### 6.3 Regla: no remontar innecesariamente

El `key={routeKey(route)}` en `App.tsx` desmonta las páginas al navegar. Por eso los datos van en stores/caché de módulo, no en `useState` efímero.

---

## 7. Internacionalización (i18n)

- Todo string visible al usuario DEBE estar en `es.json` y `en.json`.
- Helper: `const t = useT()` → `t('clave.anidada')`, `t('clave', { n: 5 })`.
- Las claves siguen el patrón `seccion.subseccion.nombre` (e.g. `home.hero.hot`).
- NUNCA hardcodear texto en componentes.

---

## 8. Integración / IPC

- Handlers en `src/main/ipc/index.ts`.
- Preload expone `window.api.*` (tipado en `src/shared/types.ts`).
- Canales IPC tipados: definir en `types.ts` → implementar handler → exponer en preload.

---

## 9. Ecualizador (EQ)

### 9.1 Modos: 10 / 15 / 31 bandas

| Modo | Frecuencias | Q | Key en settings |
|------|-------------|---|-----------------|
| 10 | 31–16k Hz | 1.0 | `eqGains` |
| 15 | 25–16k Hz | 1.5 | `eqGains15` |
| 31 | 20–20k Hz | 2.0 | `eqGains31` |

### 9.2 Presets e interpolación

Los presets (`EQ_PRESETS`) se definen para 10 bandas. Al aplicar un preset en modo 15 o 31:
- `interpolatePreset()` mapea los 10 valores a N bandas usando **interpolación lineal en escala log₂(frecuencia)**.
- Se aplican los gains interpolados a **los tres modos** simultáneamente (`eqGains`, `eqGains15`, `eqGains31`).
- El motor recibe los gains del modo activo vía `engine.setEq()`.

**Regla:** NUNCA aplicar un preset solo a `eqGains` (10 bandas) — siempre interpolar y aplicar a los tres.

### 9.3 Preamp

Rango: -12 a +12 dB. Se aplica antes de los filtros.

---

## 10. Build y despliegue

```bash
# 1. Type-check ambos configs
npx tsc --noEmit -p tsconfig.json
npx tsc --noEmit -p tsconfig.web.json

# 2. Build Vite
npm run build

# 3. Empaquetar NSIS
npx electron-builder --win nsis --config

# 4. Instalar silenciosamente
Start-Process -FilePath "release\EROSMusic-Setup-X.Y.Z.exe" -ArgumentList "/S" -Wait
```

**NUNCA:**
- `taskkill /F` en la app (corrompe cookie store, desloguea al usuario).
- Subir a GitHub sin autorización explícita.
- Usar `git push` sin que el usuario lo pida.

---

## 10. Modales

### Import Playlist (`ImportPlaylistModal.tsx`)

**Fases:** `idle` → `matching` → `creating` → `done` → `results`

- `matching`: `LoadingSpinner` centrado + barra de progreso.
- `creating`: `LoadingSpinner` centrado.
- `done`: preview visual (mosaico 2×2 de carátulas, nombre, nº de pistas, "Creada por ti").
- Botones de acción en fila inferior unificada, NUNCA inline con las secciones.

---

## 11. Reglas de estilo CSS

1. **Fluido > breakpoints.** Preferir `clamp()` sobre `@media (max-height/width)` para tamaños adaptativos.
2. **Gap > margin.** Espaciar con `gap` en flex/grid, no con márgenes individuales.
3. **overflow-x: auto** en contenido ancho (tablas, código, filas de tarjetas).
4. **No duplicar reglas.** Al añadir variantes, modificar la regla existente. Si hay que sobreescribir, hacerlo en cascada, no repetir el bloque entero.
5. **Comentar secciones.** `/* ---------- Nombre ---------- */` para separar bloques.
6. **Prefijo F##.** Los comentarios que referencian features usan el ID interno (e.g. `F80`, `F81`, `F88`).

---

## 12. Checklist antes de commit

- [ ] `npx tsc --noEmit -p tsconfig.json` → limpio
- [ ] `npx tsc --noEmit -p tsconfig.web.json` → limpio
- [ ] `npm run build` → sin errores
- [ ] Strings nuevos en AMBOS `es.json` y `en.json`
- [ ] Colores nuevos usan tokens CSS, no hex hardcodeado
- [ ] Skeletons para estados de carga (no espacios en blanco)
- [ ] Hover/focus visibles en elementos interactivos
- [ ] `@media (prefers-reduced-motion)` respetado (no crear animaciones que ignoren el flag)
- [ ] Probar tema claro + oscuro + AMOLED si se tocan colores
