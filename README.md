<p align="center">
  <img src="screenshots/icon.png" alt="Logo de ERO'S Music" width="128" />
</p>

<h1 align="center">ERO'S Music</h1>

<p align="center">
  Una interfaz de escritorio alternativa para disfrutar de YouTube Music.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/versión-v1.3.0-6f4e37" alt="Versión v1.3.0" />
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
  <img src="screenshots/search_ambient.png" alt="ERO'S Music — búsqueda con fondo ambient" width="850" />
</p>

---

## ¿Qué es?

ERO'S Music es un cliente de escritorio no oficial de **YouTube Music para Windows**, creado por Zero como proyecto personal. No es un wrapper del navegador: tiene su propio motor de audio, una interfaz construida desde cero y se conecta a tu cuenta de Google — tu biblioteca, tus playlists, tus likes y tu historial, tal cual los tienes.

## ¿Por qué ERO'S Music y no otra cosa?

| | YouTube Music (web) | Spotify Desktop | Otros clientes de YT Music | ERO'S Music |
|---|:---:|:---:|:---:|:---:|
| Crossfade real entre pistas | ❌ | ⚠️ Solo con Premium | ❌ | ✅ |
| Ecualizador de 10 bandas | ❌ | ❌ En escritorio no | ❌ | ✅ |
| Mini-player flotante | ❌ | ❌ | ⚠️ Limitado | ✅ |
| Fondo ambient reactivo | ❌ | ❌ | ❌ | ✅ |
| Karaoke palabra a palabra | ❌ | ⚠️ Parcial | ❌ | ✅ |
| Estadísticas 100% locales | ❌ | ❌ | ❌ | ✅ |
| Gratis, sin suscripción | ✅ | ❌ | ✅ | ✅ |

**Frente a YouTube Music web** — la web oficial no tiene crossfade, ni EQ, ni mini-player, ni fondo ambient, ni karaoke por palabras, ni estadísticas locales. ERO'S Music añade todo eso encima de tu misma cuenta.

**Frente a Spotify Desktop** — Spotify requiere una suscripción de pago para la mayoría de funciones, no tiene EQ real en escritorio ni fondo reactivo, y su catálogo es distinto: hay mucha música (remixes, directos, covers, canales pequeños) que solo existe en YouTube.

**Frente a otros clientes de YT Music** (th-ch/youtube-music y similares) — son wrappers: incrustan la web oficial dentro de Electron y le añaden parches. ERO'S Music tiene un motor de audio propio de doble deck, un pipeline de letras propio y una UI construida desde cero.

En resumen:

- 🎧 **Tu cuenta, tu interfaz** — la cuenta es la tuya, la experiencia es nueva.
- 🔊 **Motor de audio propio** — crossfade real (mezcla dos pistas a la vez), no un fade-out seguido de un fade-in.
- 🔒 **Todo en local** — cero telemetría, tus datos no salen de tu PC.

## Funciones

### 🎵 Streaming con tu cuenta
Inicia sesión con Google y ahí está todo: tu biblioteca, tus playlists, tus likes y tu historial. Lo que hagas en la app se refleja en tu cuenta y viceversa.

### 🎨 Diseño Coffee Cream + 20 temas
El fondo ambient extrae una paleta 60-30-10 de la carátula del álbum y puede reaccionar al audio en tiempo real. Incluye 20 presets de tema sobre base clara, oscura o negra, con color de acento dinámico.

<p align="center">
  <img src="screenshots/settings_themes.png" alt="Ajustes de temas de ERO'S Music" width="750" />
</p>

### 🔀 Crossfade real entre pistas
Motor de doble deck: la siguiente canción empieza a sonar mientras la actual termina, mezcladas de verdad. Configurable de 0 a 12 segundos, con reproducción gapless en álbumes.

<p align="center">
  <img src="screenshots/settings_playback.png" alt="Ajustes de reproducción con el slider de crossfade" width="750" />
</p>

### 🎤 Letras sincronizadas y karaoke
Letras con timing palabra a palabra sincronizadas con la música.

<p align="center">
  <img src="screenshots/lyrics_karaoke.png" alt="Modo karaoke con letras sincronizadas" width="750" />
</p>

### 🎛️ Ecualizador de 10 bandas + visualizador
6 presets (Flat, Bass, Treble, Rock, Pop, Vocal) y control manual completo con preamp. El visualizador muestra barras de frecuencia reactivas al audio en tiempo real.

<p align="center">
  <img src="screenshots/visualizer.png" alt="Visualizador de audio reactivo" width="750" />
</p>

### 🖥️ Mini-player flotante
Siempre visible encima de otras ventanas, se ancla a las esquinas, escalable y con modo karaoke.

### 📊 Estadísticas y recap personal
Tops semanales y mensuales con un resumen de tu actividad. Todo se calcula 100% en local: nada sale de tu máquina.

### 🎮 Discord Rich Presence
Muestra en Discord lo que estás escuchando. Opcional y desactivable.

### 🔄 Auto-actualización
Te avisa antes de actualizar. Nunca descarga nada en silencio.

### 🌐 Español e inglés
Interfaz completa en ambos idiomas.

### 👋 Onboarding guiado
Un asistente de bienvenida te acompaña la primera vez que abres la app.

## Privacidad

ERO'S Music solo se conecta a lo imprescindible:

- **YouTube Music** — para el streaming y tu cuenta.
- **Servicios de letras** — para las letras sincronizadas.
- **Discord** — solo si activas Rich Presence.

Y lo que **no** hace:

- ❌ Cero telemetría.
- ❌ No envía datos a terceros.
- ❌ Sin analytics de ningún tipo.
- ✅ Las estadísticas viven en una base de datos SQLite local, en tu PC.

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
