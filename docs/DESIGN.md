# Sistema de diseño

## Regla 60-30-10

Toda la piel de la app se compone de tres tonos extraídos en tiempo real de la carátula que suena, con el reparto clásico:

- **60 %** — fondo dominante. Es la base del shell y las superficies grandes. Nunca sale del color; siempre muy oscurecido para preservar contraste.
- **30 %** — superficie secundaria. Sidebar, main-view, cabeceras. Se aplica con `color-mix()` sobre el tema base.
- **10 %** — acento. Corazones, controles activos, glow. Solo se pinta si `accentMode === 'dynamic'`; si es `fixed`, el usuario eligió su color y no lo tocamos.

## Variables CSS

Vivas en `:root`, pintadas por `ambientStore.paintPalette()`:

```
--amb-60         Base oscurecida con el tinte del disco (l ≈ 9%)
--amb-60-soft    La misma más clara (l ≈ 14%)
--amb-30         Superficie secundaria con el tono medio (l ≈ 16%)
--amb-30-hue     El hue puro por si haces algo con hsl()
--amb-glow       Acento puro para halos y sombras teñidas
--accent         Color operativo del acento (dinámico o fijo)
--accent-hover   +8 % luminosidad
--accent-press   -8 % luminosidad
```

Usar SIEMPRE con transición suave (`transition: background 0.8s var(--ease-out)`) para que el cambio de canción se sienta orgánico, no un flash.

## Curvas de movimiento

Definidas en `:root`, ninguna función custom en componentes:

```
--ease-out    cubic-bezier(0.16, 1, 0.3, 1)      Apariciones (sin ease-in)
--ease-spring cubic-bezier(0.34, 1.56, 0.64, 1)  Botones y muelles con overshoot ligero
```

Duración típica: **150-300 ms**. Nunca más de 500 ms. Nada de `animation: bounce 2s infinite` sin motivo.

## Animaciones globales

Todas viven en `styles/global.css`. Reutilizar antes de crear una nueva.

- `card-in` — entrada escalonada de tarjetas. El índice va en la variable `--i` del elemento (0 → 20 típicamente). Delay: `calc(var(--i) * 35ms)`.
- `detail-in` — cabeceras de álbum/playlist/artista al entrar.
- `page-transition` — cross-fade al cambiar de ruta.
- `slide-in-left` — sidebar al arrancar.
- `heart-pop` — latido del corazón al marcar Me gusta. Se dispara cambiando `key` del span.
- `play-pulse` — halo pulsante del big-play cuando esa lista suena (`className="big-play is-playing"`).
- `cover-swap` — crossfade + blur de la carátula en la barra inferior al cambiar de canción.
- `vinyl-spin` — rotación del disco en el visualizador. `animationPlayState: isPlaying ? 'running' : 'paused'`.
- `lyrics-bg-in` — fade-in de la carátula difuminada en la vista de letras.
- `karaoke-fill` — clase que rellena texto de izquierda a derecha con el acento; controlada por la variable `--fill: X%`.

## Accesibilidad

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Todo desaparece automáticamente para quien lo pida en Windows. No añadir animaciones que no respeten esa regla (si escribes `animation: ... !important` en un elemento, la regla no puede quitarlo).

## Superficies translúcidas

Ejemplo del patrón que usa el sidebar:

```css
.sidebar-nav {
  background: color-mix(in srgb, var(--amb-30) 30%, var(--bg-base) 82%);
  backdrop-filter: blur(24px);
  transition: background 0.8s var(--ease-out);
}
```

- `color-mix` mezcla el tinte de la carátula con el color base del tema, así el resultado nunca es puro `--amb-30` (evita fondos morados chillones para álbumes muy saturados).
- `backdrop-filter: blur` deja pasar el ambiente animado detrás (efecto Nitro).
- `transition` sobre `background`: el cambio de canción es un movimiento, no un salto.

## Fondo animado (Nitro)

`components/AmbientBackground.tsx` es un canvas 64×40 con tres blobs (60 %, 30 %, glow) dibujados en modo `lighter`, con `filter: blur(64px) saturate(1.4) scale(1.2)` desde CSS. Coste de pintado despreciable, resultado orgánico.

Modo `reactive`: llama a `engine.getFrequencyData` y escala los blobs con la energía de los primeros 16 bins (graves), factor `1 + bass * 0.35`. Los blobs "respiran" con la canción sin ser hipnóticos.

## Cuándo NO usar el ambiente

- Cabecera de la playlist "Música que me gusta" — tiene su propio tinte violeta canon de YT Music.
- Tema claro — el 60 % se aclara mucho para no romper la legibilidad. Ya ajustado con las variantes de `[data-theme='light']`.

## Tipografía

Una sola familia: **Segoe UI Variable Display** con fallback a `Segoe UI` y `system-ui`. El SO ya la sirve; no descargar Inter ni Roboto solo porque sí (regla impeccable).

Escala:

- 12 px — metadatos y captions
- 13-14 px — cuerpo
- 15 px — títulos de sidebar
- 20-22 px — H1/H2 de páginas
- clamp(32px, 5vw, 64px) — nombre grande de las cabeceras de detalle

## Reglas no negociables

1. Nunca `border-radius: 9999px` ni `rounded-full` gratis. Elementos redondos donde el diseño lo justifica: avatares, discos, botón de play principal.
2. Nunca degradado morado→cian por defecto. El acento viene de la carátula o de la elección del usuario.
3. Nunca sombras uniformes negras. Todas las sombras teñidas con `--amb-glow`.
4. Nunca `transition: all`. Especifica siempre `background, transform, box-shadow, ...`.
5. Nunca dependencias de UI kit (no Tailwind, no MUI, no shadcn). El CSS es el sistema y cabe en un solo fichero.
