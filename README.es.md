<p align="center">
  <img src="screenshots/icon.png" alt="Logo de ERO'S Music" width="128" />
</p>

<h1 align="center">ERO'S Music</h1>

<p align="center">
  Una interfaz de escritorio alternativa para disfrutar de YouTube Music.
</p>

<p align="center">
  <a href="README.md">English</a> · <strong>Español</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/versión-v1.5.17-6f4e37" alt="Versión v1.5.17" />
  <img src="https://img.shields.io/badge/plataforma-Windows-0078d4" alt="Plataforma Windows" />
  <img src="https://img.shields.io/badge/licencia-GPL--3.0-green" alt="Licencia GPL-3.0" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/JavaScript-f7df1e?logo=javascript&logoColor=black" alt="JavaScript" />
  <img src="https://img.shields.io/badge/Electron-47848f?logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/HTML5-e34f26?logo=html5&logoColor=white" alt="HTML5" />
  <img src="https://img.shields.io/badge/CSS3-1572b6?logo=css3&logoColor=white" alt="CSS3" />
</p>

<p align="center">
  <img src="screenshots/home_spiral.png" alt="ERO'S Music — pantalla principal con la Espiral Musical y la cola de reproducción" width="850" />
</p>

---

## ¿Qué es?

ERO'S Music es un cliente de escritorio no oficial de **YouTube Music para Windows**, creado por Zero como proyecto personal. No es un wrapper del navegador: tiene su propio motor de audio, una interfaz construida desde cero y se conecta a tu cuenta de Google — tu biblioteca, tus playlists, tus likes y tu historial, tal cual los tienes.

## ¿Por qué ERO'S Music y no otra cosa?

| | YouTube Music (web) | Spotify Desktop | Otros clientes de YT Music | ERO'S Music |
|---|:---:|:---:|:---:|:---:|
| Crossfade real entre pistas | ❌ | ⚠️ Solo con Premium | ❌ | ✅ |
| Ecualizador de 10/15/31 bandas | ❌ | ❌ En escritorio no | ❌ | ✅ |
| Importar perfiles de ecualizador de AutoEq | ❌ | ❌ | ❌ | ✅ |
| Mini-player flotante | ❌ | ❌ | ⚠️ Limitado | ✅ |
| Fondo ambient reactivo | ❌ | ❌ | ❌ | ✅ |
| Karaoke palabra a palabra | ❌ | ⚠️ Parcial | ❌ | ✅ |
| Estadísticas 100% locales | ❌ | ❌ | ❌ | ✅ |
| Last.fm / ListenBrainz | ❌ | ❌ | ⚠️ Solo Last.fm | ✅ Ambos |
| Importar playlists de cualquier servicio | ❌ | ❌ | ❌ | ✅ |
| Música local con edición de metadatos | ❌ | ✅ Parcial | ❌ | ✅ |
| Gratis, sin suscripción | ✅ | ❌ | ✅ | ✅ |

**Frente a YouTube Music web** — la web oficial no tiene crossfade, ni EQ, ni mini-player, ni fondo ambient, ni karaoke por palabras, ni estadísticas locales. ERO'S Music añade todo eso encima de tu misma cuenta.

**Frente a Spotify Desktop** — Spotify requiere una suscripción de pago para la mayoría de funciones, no tiene EQ real en escritorio ni fondo reactivo, y su catálogo es distinto: hay mucha música (remixes, directos, covers, canales pequeños) que solo existe en YouTube.

**Frente a otros clientes de YT Music** (th-ch/youtube-music y similares) — son wrappers: incrustan la web oficial dentro de Electron y le añaden parches. ERO'S Music tiene un motor de audio propio de doble deck, un pipeline de letras propio y una UI construida desde cero.

En resumen:

- 🎧 **Tu cuenta, tu interfaz** — la cuenta es la tuya, la experiencia es nueva.
- 🔊 **Motor de audio propio** — crossfade real (mezcla dos pistas a la vez), no un fade-out seguido de un fade-in.
- 🔒 **Local por defecto** — tu biblioteca, tus estadísticas y tu historial no salen de tu equipo.

## Funciones

### 🎵 Streaming con tu cuenta
Inicia sesión con Google y ahí está todo: tu biblioteca, tus playlists, tus likes y tu historial. Lo que hagas en la app se refleja en tu cuenta y viceversa.

<p align="center">
  <img src="screenshots/search_ambient.png" alt="Búsqueda en ERO'S Music con el fondo ambient teñido por la canción en curso" width="750" />
</p>

### 🎨 Diseño Coffee Cream + 20 temas
El fondo ambient extrae una paleta 60-30-10 de la carátula del álbum y reacciona al audio en tiempo real, con **5 diseños a elegir**: Manchas, Ondas, Partículas, Aurora y Carátula difuminada. Incluye 20 presets de tema sobre base clara, oscura o negra, con color de acento dinámico. Toda la interfaz usa un set de iconos de trazo dibujado a medida para la app.

<p align="center">
  <img src="screenshots/settings_themes.png" alt="Ajustes de apariencia con los temas predefinidos y los diseños de fondo" width="750" />
</p>

Y como el color sale de la carátula, la app entera cambia de tono al cambiar de canción:

<p align="center">
  <img src="screenshots/ambient_shift.gif" alt="El fondo reactivo interpolando los colores de una canción a la siguiente" width="720" />
</p>

### 🔀 Crossfade real entre pistas
Motor de doble deck: la siguiente canción empieza a sonar mientras la actual termina, mezcladas de verdad. Configurable de 0 a 12 segundos, con reproducción gapless en álbumes.

La cola lo enseña mientras pasa: la canción que sale se marca como «Mezclando…», una barra de acento se llena durante exactamente lo que dura el fundido y la lista se reordena sola cuando termina.

<p align="center">
  <img src="screenshots/crossfade_queue.gif" alt="La cola de reproducción durante un crossfade, con la barra de mezcla llenándose" width="300" />
</p>

<p align="center">
  <img src="screenshots/settings_playback.png" alt="Ajustes de reproducción con el slider de crossfade" width="750" />
</p>

### 🎤 Letras sincronizadas y karaoke
Letras sincronizadas con la música. La línea que suena se enciende en cascada, letra a letra, y el resto se apaga y se desenfoca según lo lejos que esté. Se lee sobre cualquier carátula, por clara que sea, y puede ir centrada o alineada a la izquierda.

<p align="center">
  <img src="screenshots/lyrics_karaoke.png" alt="Modo karaoke con letras sincronizadas" width="750" />
</p>

### 🎛️ Ecualizador de 10, 15 y 31 bandas + visualizador
3 modos de ecualizador (10, 15 y 31 bandas) con 6 presets que se interpolan automáticamente a cualquier modo. Control manual completo con preamp. El visualizador muestra barras de frecuencia reactivas al audio en tiempo real.

También se pueden importar archivos de ecualizador desde *Ajustes → Ecualizador*: AutoEq y Equalizer APO (`ParametricEQ.txt`), AutoEq y Wavelet (`GraphicEQ.txt`), curvas de medición en CSV y perfiles en JSON de la aplicación móvil. Las bandas del archivo se traducen a las del ecualizador de la aplicación para los modos de 10, 15 y 31 bandas a la vez. **Mis ecualizadores** reúne todo lo importado, junto a lo que se guarde con **Guardar el ajuste actual**.

<p align="center">
  <img src="screenshots/visualizer.png" alt="Visualizador de audio reactivo con la cola de reproducción abierta" width="750" />
</p>

<p align="center">
  <img src="screenshots/settings_eq.png" alt="Ajustes del ecualizador con los modos de 10, 15 y 31 bandas" width="750" />
</p>

### 🌀 Espiral Musical
Sección de descubrimiento en la pantalla principal con 3 filas de tarjetas en scroll continuo. Sugiere música basándose en tus artistas favoritos, historial y likes. Las canciones rotan automáticamente desde un pool de reserva para que siempre haya algo nuevo.

<p align="center">
  <img src="screenshots/home_spiral.gif" alt="Las tres filas de la Espiral Musical desplazándose en sentidos alternos" width="640" />
</p>

### 🎧 Last.fm scrobbling
Conecta tu cuenta de Last.fm desde Ajustes y tus escuchas se registran automáticamente. Envía nowPlaying al empezar cada canción y scrobble cuando llevas más del 50% o 30 segundos.

### 📡 ListenBrainz sync
Alternativa libre a Last.fm. Pega tu token en Ajustes y listo — playing_now y submit-listens, compartiendo el mismo trigger que Last.fm.

### 📥 Importar playlists de cualquier servicio
Tres vías en *Tu biblioteca → Importar playlist*. **Enlace**: Spotify, Apple Music, Deezer, TIDAL, SoundCloud, Bandcamp, Last.fm y YouTube / YT Music, álbumes incluidos — el servicio se reconoce mientras se escribe el enlace. **Archivo**: M3U/M3U8, PLS, XSPF, WPL/ZPL, ASX, CSV/TSV, JSON y TXT, deduciendo el formato del contenido. **Pegar lista**: cualquier lista de canciones como texto, que funciona hasta con los servicios que no publican nada. Cada canción se busca en YouTube Music, se muestran los resultados y la playlist se crea en tu cuenta.

### 🖥️ Mini-player flotante
Siempre visible encima de otras ventanas, se ancla a las esquinas, escalable y con modo karaoke.

### 📊 Estadísticas y recap personal
Tops semanales y mensuales con un resumen de tu actividad. Todo se calcula 100% en local: nada sale de tu máquina. Desde la v1.5.17 cada escucha se registra individualmente en lugar de solo la última vez que sonó una pista, así que las estadísticas ganan precisión cuanto más se usa la app, y una reproducción solo cuenta cuando se ha escuchado un umbral configurable de la pista.

### 🎮 Discord Rich Presence
Muestra en Discord lo que estás escuchando. Opcional y desactivable.

### 🔄 Auto-actualización
Te avisa antes de actualizar. Nunca descarga nada en silencio. El primer aviso de cada sesión es un diálogo centrado nada más arrancar, para resolver la actualización antes de ponerse a usar la aplicación; **Más tarde** lo cierra del todo y deja la actualización a un clic en *Ajustes → Sistema*, que entonces muestra **Actualizar ahora** en vez de pedir que se busque. Los avisos que llegan con la aplicación ya en marcha —la comprobación cada seis horas, o los que lleguen con música sonando— van a una tarjeta discreta en la esquina.

### 🌐 Español e inglés
Interfaz completa en ambos idiomas.

### 👋 Onboarding guiado
Un asistente de bienvenida te acompaña la primera vez que abres la app.

### 📮 Reportar problemas y proponer mejoras
Desde **Ajustes → Ayuda y comentarios** se pueden reportar fallos o proponer mejoras, adjuntando capturas o vídeos para mostrar el problema. Opcionalmente se puede dejar un contacto por si hacen falta más detalles. Los reportes se leen y se atienden: el listado de secciones de Ajustes y el arreglo de la Espiral Musical, ambos en la v1.5.13, salieron de este canal.

### 🔗 Compartir listas de reproducción
El enlace de una lista privada no le funciona a quien lo recibe. Al compartir una lista propia que sigue siendo privada, la aplicación avisa y pide confirmación antes de hacerla pública. Cada lista muestra si es pública, privada u oculta.

### 🎶 Música local
Añade tus archivos de audio (MP3, FLAC, OGG, OPUS, WAV, M4A…) a la biblioteca y reprodúcelos junto a tu música de YouTube Music. Puedes editar título, artista, álbum y carátula directamente desde la app, y el fondo ambient se adapta a la portada igual que con cualquier otra canción.

### 💾 Copias de seguridad
Los ajustes, las listas, el historial de escucha y la caché de "me gusta" se pueden exportar a un único fichero y restaurar desde él, con una copia de seguridad automática antes de cada restauración. También se puede activar una copia programada (diaria o semanal), y hacer doble clic en un fichero de copia abre la app directamente en el diálogo de restauración.

<p align="center">
  <img src="screenshots/settings_backup.png" alt="Ajustes de sistema con las filas de copia de seguridad, restauración y copia programada" width="750" />
</p>

### 🎵 Gestión de la cola
Las pistas de la cola "a continuación" se pueden reordenar desde el menú contextual, encolar varias canciones seguidas con *Reproducir a continuación* ahora las mantiene en el orden en que se añadieron, y cualquier pista se puede dejar repitiendo un número de veces a elegir.

### ✅ Seleccionar varias pistas a la vez
Clic, Shift+clic y Ctrl+clic funcionan en cualquier lista de pistas. Con una selección activa, se puede encolar, añadir a una lista, guardar en caché o quitar de una lista de una sola vez.

<p align="center">
  <img src="screenshots/library_multiselect.png" alt="Una playlist con cuatro pistas seleccionadas y la barra de acciones al pie de la lista" width="750" />
</p>

### 🔊 Dispositivo de salida de audio
El dispositivo por el que suena el audio se puede elegir desde Ajustes, en lugar de seguir siempre el predeterminado del sistema.

### 🚫 Artistas bloqueados y una biblioteca más ordenada
Bloquear un artista desde el menú contextual de una pista o un álbum saca su contenido de la biblioteca, la búsqueda, las listas y las estanterías de Inicio. Las pestañas de Biblioteca también se pueden reordenar u ocultar, y cada una recuerda su propio criterio de orden — por nombre, artista, duración o fecha de adición.

<p align="center">
  <img src="screenshots/settings_content_blocked.png" alt="Ajustes de contenido con la lista de artistas bloqueados y el editor de pestañas de la biblioteca" width="750" />
</p>

## Privacidad

ERO'S Music solo se conecta a lo imprescindible:

- **YouTube Music** — para el streaming y tu cuenta.
- **Servicios de letras** — para las letras sincronizadas.
- **Discord** — solo si activas Rich Presence.
- **Last.fm / ListenBrainz** — solo si conectas tu cuenta en Ajustes.

### 🔒 Informes de rendimiento (v1.5.7)

Desde la v1.5.7 la aplicación puede enviar **informes de rendimiento**, lo que permite detectar y corregir fallos sin depender de que alguien los reporte. Las condiciones, sin letra pequeña:

- 🔒 **No llega a terceros. A nadie.** Los informes se destinan únicamente al desarrollo de la aplicación. Sin empresas de analítica, sin anunciantes y sin servicios de seguimiento. No se venden, no se comparten ni se ceden.
- 🔧 **El único objetivo es mejorar la aplicación.** Detectar qué va lento, se bloquea o se rompe, y corregirlo. Nada más.
- ✅ **Es completamente opcional.** La primera vez que se abre la aplicación aparece una ventana explicándolo, con el interruptor ahí mismo, y se puede activar o desactivar en cualquier momento desde **Ajustes → Ayuda y comentarios**. Con el envío desactivado la aplicación funciona exactamente igual: no se pierde ninguna función.

**Qué contiene el informe:** cuánto tarda en arrancar, cuánta memoria y procesador consume, si la interfaz se ha bloqueado, los errores técnicos que se hayan producido y la versión de Windows. Nada más.

**Qué no sale de tu equipo, nunca:**

- ❌ Tu música, tus búsquedas y tus listas.
- ❌ Tu cuenta de Google.
- ❌ El nombre de tu equipo y tus carpetas personales (se enmascaran antes de cualquier envío).
- ❌ Sin analítica de terceros, sin publicidad y sin perfilado.
- ✅ Las estadísticas viven en una base de datos SQLite local, en tu equipo.

Los reportes escritos desde **Ajustes → Ayuda y comentarios** siguen las mismas condiciones: se envían únicamente al pulsar el botón y contienen solo lo que se haya escrito y adjuntado.

## Requisitos

- Windows 10/11 (64 bits)
- Cuenta de Google
- ~150 MB de espacio en disco
- Instalación por usuario: **no requiere permisos de administrador ni UAC**

## Hacia dónde va ERO'S Music

ERO'S Music es un proyecto vivo con la ambición de ir más allá. La idea a largo plazo es:

- 🔗 **Integrar más plataformas** — poder acceder a tus bibliotecas y playlists de distintos servicios de streaming desde un solo sitio.
- 🧩 **Muchas más funciones** — el roadmap está abierto y crece con cada versión. Esto no es un producto terminado: es un proyecto personal con ganas de llegar lejos.

## Descarga

<p align="center">
  <a href="https://github.com/agm22profesionalmail-dot/eros-music-releases/releases/latest">
    <img src="https://img.shields.io/badge/⬇_Descargar_última_versión-6f4e37?style=for-the-badge" alt="Descargar última versión" />
  </a>
</p>

Descarga el instalador desde la [última release](https://github.com/agm22profesionalmail-dot/eros-music-releases/releases/latest) y ejecútalo. Si ya tienes una versión anterior instalada, el instalador la detecta y actualiza limpiamente sin que tengas que hacer nada.

> ⚠️ **Nota sobre Windows SmartScreen**
>
> Al ejecutar el instalador es posible que Windows muestre un aviso de "Windows protegió su PC" con "Editor desconocido". Esto ocurre porque la app no tiene un certificado de firma de código de pago — es un proyecto personal sin ánimo de lucro.
>
> **Es seguro.** Para continuar, haz clic en **"Más información"** y luego en **"Ejecutar de todas formas"**. El aviso aparece únicamente porque un certificado de firma de código comercial tiene un coste anual que este proyecto personal sin ánimo de lucro no cubre.

---

<p align="center">
  Hecho con ☕ por <strong>Zero</strong> · Proyecto personal, sin ánimo de lucro.
</p>

<p align="center">
  <em>ERO'S Music es un proyecto independiente y no oficial.<br/>
  No está afiliado, patrocinado ni respaldado por Google, YouTube, Spotify, Discord<br/>
  ni ninguna otra marca mencionada. Todos los nombres de productos y marcas son<br/>
  propiedad de sus respectivos titulares y se usan únicamente con fines descriptivos.<br/>
  El uso de esta aplicación queda bajo la responsabilidad del usuario.</em>
</p>
