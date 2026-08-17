# Check integral final v2 · F27-F34 · 2026-08-15T03:25:29.815Z

## Resumen
46 pruebas · 46 OK / 0 WARN / 0 BUG
Estado: ✅ apto para uso
- errores no controlados del renderer al final: 0
- líneas con "Error" en stderr del main: 0
- sesión: signedIn

## Tabla por bloque
| # | Bloque | Feature | OK | WARN | BUG |
| - | ------ | ------- | -- | ---- | --- |
| A | Paridad reproducción | F27 | 4 | 0 | 0 |
| B | Filtros de contenido | F28 | 2 | 0 | 0 |
| C | Fuentes de streaming | F29 | 4 | 0 | 0 |
| D | Proveedores letras | F30 | 4 | 0 | 0 |
| E | Wrapped | F31 | 7 | 0 | 0 |
| F | Personalización Home | F32 | 6 | 0 | 0 |
| G | Proxy | F33 | 4 | 0 | 0 |
| H | i18n | F34 | 4 | 0 | 0 |
| I | v0.2 (F20-F26) | Regresiones | 5 | 0 | 0 |
| J | nav/spam/viewport | Robustez | 3 | 0 | 0 |
| restore | restauración final | Cleanup | 3 | 0 | 0 |


## Bugs por severidad

(sin bugs)

## Regresiones respecto a v0.2 (F26 ya validó 64/64)
ninguna — sidebar, menú contextual, reproducción y errores mantienen el nivel de F26.

## Restauración
Ajustes → OK · Perfil → OK · Cuenta → OK

## Veredicto
LISTO PARA v0.3

---

<details><summary>Detalle completo (46 filas)</summary>

- [A] **OK** · 15 claves F27 presentes en settings.get()
- [A] **OK** · botón sleep timer [data-testid="sleep-timer-btn"] presente — count=1
- [A] **OK** · audioQuality:high persiste
- [A] **OK** · avoidDuplicatesInQueue:false persiste
- [B] **OK** · 9 claves F28 presentes en settings.get()
- [B] **OK** · con hideVideos:true no hay kind:video en resultados — total=7 videos=0
- [C] **OK** · streamingSources es array con ≥4 items — len=4
- [C] **OK** · useYtDlpFallback es boolean — value=true
- [C] **OK** · contiene los 4 clientes históricos — ids=YTMUSIC,IOS,ANDROID,TV_EMBEDDED
- [C] **OK** · sección "Fuentes de streaming" visible en Ajustes
- [D] **OK** · lyricsProviders es array con 3 items — len=3
- [D] **OK** · romanizeLyrics es boolean — value=false
- [D] **OK** · contiene los 3 proveedores esperados — ids=LRCLIB,KUGOU,YTMUSIC
- [D] **OK** · music.lyrics(...) responde sin lanzar — type=object
- [E] **OK** · wrappedTopN es number — value=50
- [E] **OK** · showWrappedRecapCard es boolean
- [E] **OK** · showTopWeekly es boolean
- [E] **OK** · showTopMonthly es boolean
- [E] **OK** · stats.recap() devuelve estructura correcta — hours=7.2
- [E] **OK** · Home muestra ≥1 .recap-card con showWrappedRecapCard=true — cards=3
- [E] **OK** · .recap-page renderiza al navegar a Recap
- [F] **OK** · homeShuffleShelves es boolean
- [F] **OK** · homeShelvesOrder es array
- [F] **OK** · homeHiddenShelves es array
- [F] **OK** · homeQuickPicks es array — value=["recientes","novedades","mixes","radios"]
- [F] **OK** · sidebar-nav contiene item "Recap"
- [F] **OK** · Home renderiza al menos una sección conocida
- [G] **OK** · proxyMode default 'off' — value=off
- [G] **OK** · proxyUrl default '' — value=""
- [G] **OK** · settings.set proxy http no lanza — proxyMode=http proxyUrl=127.0.0.1:9999
- [G] **OK** · ventana sigue viva tras aplicar proxy inexistente
- [H] **OK** · uiLanguage está definido — value=auto
- [H] **OK** · uiLanguage con valor válido (auto|es|en) — value=auto
- [H] **OK** · sidebar cambia con uiLanguage=en (Home) — "Inicio" → "Home"
- [H] **OK** · sidebar vuelve a "Inicio" con uiLanguage=es — got="Inicio"
- [I] **OK** · sidebar tiene ≥1 .library-row — rows=13
- [I] **OK** · clic derecho en .media-card abre .context-menu
- [I] **OK** · reproducción arranca (audio.src cambia)
- [I] **OK** · sin errores del renderer
- [I] **OK** · sin líneas Error en stderr del main — errCount=0
- [J] **OK** · tras 8 navegaciones no hay pantalla en blanco
- [J] **OK** · spam siguiente x5 no cuelga
- [J] **OK** · viewport 900×600 sin overflow horizontal
- [restore] **OK** · ajustes restaurados al snapshot inicial — uiLang=auto proxy=off hideV=false aq=auto
- [restore] **OK** · perfil restaurado a valores originales
- [restore] **OK** · sesión intacta (no signOut) — status=signedIn

</details>

<details><summary>Errores del renderer</summary>

(ninguno)

</details>

<details><summary>Trazas relevantes del main</summary>

(nada relevante)

</details>
