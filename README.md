<p align="center">
  <img src="screenshots/icon.png" alt="Logo de ERO'S Music" width="128" />
</p>

<h1 align="center">ERO'S Music</h1>

<p align="center">
  Tu música de YouTube Music, con la interfaz que siempre quisiste.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/versión-v1.3.0-6f4e37" alt="Versión v1.3.0" />
  <img src="https://img.shields.io/badge/plataforma-Windows-0078d4" alt="Plataforma Windows" />
  <img src="https://img.shields.io/badge/licencia-GPL--3.0-green" alt="Licencia GPL-3.0" />
</p>

<p align="center">
  <img src="screenshots/search_ambient.png" alt="ERO'S Music — búsqueda con fondo ambient" width="850" />
</p>

---

## ¿Qué es?

ERO'S Music es un cliente de escritorio nativo de **YouTube Music para Windows**, creado por Zero como proyecto personal. No es un wrapper del navegador: tiene su propio motor de audio, una interfaz construida desde cero con un diseño al estilo Spotify, y se conecta a tu cuenta real de Google/YouTube Music — tu biblioteca, tus playlists, tus likes y tu historial, tal cual los tienes.

## ¿Por qué ERO'S Music y no otra cosa?

| | YouTube Music (web) | Spotify Desktop | Otros clientes de YT Music | ERO'S Music |
|---|:---:|:---:|:---:|:---:|
| Crossfade real entre pistas | ❌ | ⚠️ Solo con Premium | ❌ | ✅ |
| Ecualizador de 10 bandas | ❌ | ❌ En escritorio no | ❌ | ✅ |
| Mini-player flotante | ❌ | ❌ | ⚠️ Limitado | ✅ |
| Descargas con tags y carátula | ❌ | ⚠️ Solo Premium, en su app | ❌ | ✅ |
| Fondo ambient reactivo | ❌ | ❌ | ❌ | ✅ |
| Karaoke palabra a palabra | ❌ | ⚠️ Parcial | ❌ | ✅ |
| Estadísticas 100% locales | ❌ | ❌ | ❌ | ✅ |
| Gratis, sin suscripción | ✅ | ❌ | ✅ | ✅ |

**Frente a YouTube Music web** — la web oficial no tiene crossfade, ni EQ, ni mini-player, ni descargas con tags, ni fondo ambient, ni karaoke por palabras, ni estadísticas locales. ERO'S Music añade todo eso encima de tu misma cuenta.

**Frente a Spotify Desktop** — Spotify te ata a una suscripción Premium para casi todo, no tiene EQ real en escritorio ni fondo reactivo, y su catálogo es distinto: hay muchísima música (remixes, directos, covers, canales pequeños) que solo existe en YouTube.

**Frente a otros clientes de YT Music** (th-ch/youtube-music y similares) — son wrappers: meten la web oficial dentro de Electron y le añaden parches. ERO'S Music no incrusta la web en ningún sitio: tiene un motor de audio propio de doble deck, un pipeline de letras propio, descargas vía yt-dlp y una UI construida desde cero.

En resumen:

- 🎧 **Tu música de YouTube + tu interfaz** — la cuenta es la tuya, la experiencia es nueva.
- 🔊 **Motor de audio propio** — crossfade real (mezcla dos pistas a la vez), no un fade-out seguido de un fade-in.
- 🔒 **Todo en local** — cero telemetría, tus datos no salen de tu PC.
- ✨ **Funciones que la web oficial no tiene** — y sin pagar Premium.

## Funciones

### 🎵 Streaming con tu cuenta real
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
Letras con timing palabra a palabra obtenidas de fuentes reales (LRCLIB + KuGou KRC), no aproximaciones generadas.

<p align="center">
  <img src="screenshots/lyrics_karaoke.png" alt="Modo karaoke con letras sincronizadas" width="750" />
</p>

### 🎛️ Ecualizador de 10 bandas
6 presets (Flat, Bass, Treble, Rock, Pop, Vocal) y control manual completo con preamp.

### 📥 Descargas offline
Descargas permanentes con tags y carátula incrustados, vía yt-dlp + ffmpeg.

### 🖥️ Mini-player flotante
Siempre visible encima de otras ventanas, se ancla a las esquinas, escalable y con modo karaoke.

### 📊 Estadísticas y Wrapped
Recap al estilo Wrapped, tops semanales y mensuales. Todo se calcula 100% en local: nada sale de tu máquina.

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
- **LRCLIB y KuGou** — para las letras sincronizadas.
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
