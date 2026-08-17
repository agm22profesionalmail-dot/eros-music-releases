# Check integral final · F20-F25 · 2026-08-15T02:02:40.613Z

## Resumen
64 pruebas · 64 OK / 0 WARN / 0 BUG
Estado: apto para uso
- errores no controlados del renderer al final: 0
- líneas con "Error" en stderr del main: 0
- sesión: signedIn

## Tabla por bloque
| # | Bloque | Feature | OK | WARN | BUG |
| - | ------ | ------- | -- | ---- | --- |
| 1 | regresiones básicas | Arranque | 9 | 0 | 0 |
| 2 | Perfil | F20 | 7 | 0 | 0 |
| 3 | Búsquedas en listas | F21 | 7 | 0 | 0 |
| 4 | Botones playlist (+, ↗, ✎) | F22 | 11 | 0 | 0 |
| 5 | Menú contextual + multi-género | F22b | 8 | 0 | 0 |
| 6 | Reactividad | F22c | 2 | 0 | 0 |
| 7 | Géneros — chip "Todos" | F23 | 2 | 0 | 0 |
| 8 | Home Sorpréndeme + Mix | F24 | 6 | 0 | 0 |
| 9 | Visualizador Tuneform | F24b | 4 | 0 | 0 |
| 10 | Discord con perfil | F25 | 3 | 0 | 0 |
| 11 | regresiones históricas | Robustez | 2 | 0 | 0 |
| restore | restauración final | Cleanup | 3 | 0 | 0 |


## Bugs por severidad

(sin bugs)

## Regresiones vs CHANGELOG
none

## Restauración
Ajustes → OK · Perfil → OK · Cuenta → OK

## Veredicto
LISTO PARA v0.2

---

<details><summary>Detalle completo (64 filas)</summary>

- [1] **OK** · sesión iniciada (auth.getState === signedIn) — status=signedIn
- [1] **OK** · sin errores no controlados del renderer al arrancar
- [1] **OK** · sin errores del main al arrancar
- [1] **OK** · biblioteca en sidebar (≥1 fila) — rows=13
- [1] **OK** · window.api.music.library() responde
- [1] **OK** · reproducción arranca (audio.src cambia)
- [1] **OK** · seek al 50% aplica sin excepción
- [1] **OK** · botón siguiente presente
- [1] **OK** · botón anterior presente
- [2] **OK** · topbar tiene ≥2 .avatar-btn (Ajustes + Perfil) — count=2
- [2] **OK** · clic en foto de topbar navega DIRECTO a Perfil
- [2] **OK** · displayName autoguardado — got="F26 Check"
- [2] **OK** · bio autoguardada
- [2] **OK** · enabled=true persistido
- [2] **OK** · añadir artista favorito crece la lista — 0 → 1
- [2] **OK** · quitar artista favorito reduce la lista — 1 → 0
- [3] **OK** · ListSearchInput visible en playlist "Música que me gusta"
- [3] **OK** · filtro "a" reduce 12→10
- [3] **OK** · borrar filtro devuelve todas (12/12)
- [3] **OK** · filtro en playlist funciona
- [3] **OK** · .library-toolbar visible en Tu biblioteca
- [3] **OK** · input de búsqueda visible en Tu biblioteca (algún tab) — tab="Playlists"
- [3] **OK** · filtro biblioteca "la" reduce 5→1
- [4] **OK** · preload expone library.playlistEdit
- [4] **OK** · abierta playlist editable
- [4] **OK** · botón + (Añadir) visible
- [4] **OK** · botón ↗ (Compartir) visible
- [4] **OK** · botón ✎ (Editar) visible
- [4] **OK** · clipboard contiene music.youtube.com/playlist?list= — clip="https://music.youtube.com/playlist?list=PLe9dA42WpKnw"
- [4] **OK** · TrackPickerModal abre con +
- [4] **OK** · chip contador "2 canciones seleccionadas" — chip="2 canciones seleccionadas" r1=20 r2=20
- [4] **OK** · PlaylistEditModal abre con ✎
- [4] **OK** · preview cuadrado en modal editar — w=240 h=240
- [4] **OK** · título de la playlist intacto tras Cancelar — header="Me gusta · Pop"
- [5] **OK** · clic derecho en .media-card abre .context-menu
- [5] **OK** · menú de tarjeta con ≥3 items — items=8
- [5] **OK** · clic derecho en .library-row abre .context-menu
- [5] **OK** · menú sidebar con ≥3 items — items=5
- [5] **OK** · chips de género aparecen (≤10s) — chips=9
- [5] **OK** · multi-select ("Pop" + "Rap") — active=2
- [5] **OK** · botón "Crear playlist con [A+B]" visible
- [5] **OK** · label del botón menciona ambos géneros — label="Crear playlist con Pop + Rap"
- [7] **OK** · chip "Todos" resetea a un chip activo — active=1
- [7] **OK** · tras "Todos" hay filas visibles — rows=12
- [6] **OK** · library.onChanged expuesto y devuelve cleanup
- [6] **OK** · avatar <img> cambia a data:image/png tras profile.set (<1s) — src=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAA
- [8] **OK** · window.api.discovery.surprise expuesto
- [8] **OK** · window.api.discovery.mix expuesto
- [8] **OK** · hay exactamente 2 tarjetas .hero-card — count=2
- [8] **OK** · una tarjeta se titula "Sorpréndeme" — ["Sorpréndeme","Mix Personal"]
- [8] **OK** · una tarjeta se titula "Mix Personal"
- [8] **OK** · Sorpréndeme responde (toast o cambio de pista) — toast="Radio de Kordhell" changed=true
- [9] **OK** · botón [aria-label="Visualizador"] presente
- [9] **OK** · hay ≥1 canvas visible con dimensiones > 0 — {"total":2,"vis":2,"first":{"w":64,"h":40},"imgs":1}
- [9] **OK** · hay ≥1 <img> centrado con src http — imgs=1
- [9] **OK** · canvas se congela en ventana minimizada (rAF pausado) — no bug de la app — tries=3 h1=800x240:5067638 h2=800x240:5067638 audio={"paused":false,"currentTime":11.55066,"readyState":4}
- [10] **OK** · main emite trazas [discord] — 2 líneas
- [10] **OK** · traza de presencia enviada tras conectar — [discord] presencia: Get Lucky (feat. Pharrell Williams and Nile Rodgers) · Daft Punk, Pharrell Williams, Nile Rodgers  · perfil="F26 Check" +foto
- [10] **OK** · presencia menciona perfil "F26 Check"
- [11] **OK** · tras 8 navegaciones no hay pantalla en blanco
- [11] **OK** · viewport 900×600 sin overflow horizontal
- [restore] **OK** · ajustes restaurados a defaults exigidos
- [restore] **OK** · perfil restaurado a valores originales
- [restore] **OK** · sesión intacta (no signOut) — status=signedIn

</details>

<details><summary>Errores del renderer</summary>

(ninguno)

</details>

<details><summary>Trazas relevantes del main</summary>

- [discord] conectado como _zerosplat
- [discord] presencia: Get Lucky (feat. Pharrell Williams and Nile Rodgers) · Daft Punk, Pharrell Williams, Nile Rodgers  · perfil="F26 Check" +foto

</details>
