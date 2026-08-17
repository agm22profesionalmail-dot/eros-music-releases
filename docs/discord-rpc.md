# Discord Rich Presence · ERO'S Music

> **Aviso para agentes/desarrolladores que trabajen en este repo o compilen la app**
> Antes de tocar `src/main/integrations/discord.ts`, `mediaSession.ts` (publish),
> el handler IPC `MINI_STATE` o el toggle `discordRpc` de settings, **lee esta
> nota entera**. La integración es delicada por un motivo no obvio (ver
> "punto rojo" abajo) y ya se ha roto antes por cambios cosméticos.

---

## Qué es

Rich Presence en Discord con el track sonando: cabecera `Listening to ERO'S
Music`, título de la canción, artista(s), carátula grande, insignia pequeña
con logo, barra de progreso viva. Modo perfil personalizado (F25): si el
usuario activa `profile.enabled`, la foto y nombre del perfil ocupan la
imagen grande y la carátula cae a la insignia pequeña; el `details` pasa a
`por <artista>` y `state` al título.

## Punto rojo · el Application ID NO es un detalle cosmético

`src/main/integrations/discord.ts` tiene una constante `DEFAULT_CLIENT_ID`.
La cabecera `Listening to <lo-que-sea>` que ve el resto del mundo NO se pone
desde este código — Discord la deriva del **nombre registrado en el Discord
Developer Portal para ese Application ID**.

- Si el ID es el de la app **ERO'S Music** (registrada por Zero en su cuenta
  de Discord Developer Portal): Discord muestra `Listening to ERO'S Music`. ✅
- Si el ID se cambia a otro (por ejemplo, se "revierte" al público de
  `th-ch/youtube-music` `1177081335727267940` durante un rebase o merge):
  Discord muestra `Listening to YouTube Music`. ❌

**Regla**: no reemplazar ese Client ID por "el que aparece en un tutorial"
ni por el genérico de th-ch. Es propiedad de la cuenta del usuario y está
registrado con el nombre y los assets correctos. Si de verdad hace falta
rotarlo (cuenta nueva, app perdida en el portal), hay que registrar una
aplicación nueva con nombre **exacto** `ERO'S Music` (apóstrofo recto ASCII
`'`, U+0027) y volver a subir los assets antes de tocar el código.

## Assets e imágenes (largeImageKey / smallImageKey)

Discord acepta dos formas para estos keys:
1. **URL http/https directa** — Discord la cachea. Ejemplos:
   - `info.thumbnailUrl` (carátula del track, servida por Google).
   - `sessionManager.authState.accountPhotoUrl` (foto HTTPS del avatar de
     Google del usuario logueado, extraída por `session.ts` de la respuesta
     de InnerTube `getAccountInfo`).
2. **Nombre de asset registrado** en Rich Presence → Art Assets del portal
   (ej. `'icon'`). Si se referencia un key inexistente, Discord no pinta y
   deja el hueco vacío.

**Data URLs NO están soportadas** — Discord las rechaza. La foto de perfil
personalizada de la app se guarda como `photoDataUrl` (base64 en SQLite),
así que casi nunca pasa directa; por eso la lógica de `discord.ts` da
prioridad al `accountPhotoUrl` HTTPS de Google sobre el data URL cuando
existe (F60).

**Layout (F61)**: la carátula del track SIEMPRE va como imagen grande
(protagonista); la foto del usuario cae como insignia pequeña, tipo
Spotify. Antes se probó al revés y perdía protagonismo la portada.

**Prioridad de la insignia pequeña / foto del usuario** (F62):
1. `photoDataUrl` si es http(s) explícita.
2. `photoDataUrl` como data URL (base64 subida por el usuario en Ajustes)
   → se sube a **catbox.moe** por el módulo `imageHost.ts` y se usa la URL
   pública HTTPS resultante. La subida es asíncrona: la primera vez con
   una foto nueva devuelve `null` (o la URL previamente cacheada) y
   dispara `refreshDiscordPresence()` cuando termina — típicamente 1–3 s
   más tarde la presencia se reenvía con la URL nueva sin esperar al
   siguiente track. Cache por hash del data URL persistida en SQLite
   (`discord.profilePhotoUpload`) para no reuploadear.
3. `accountPhotoUrl` de Google (siempre HTTPS, siempre pasa) — fallback
   mientras la subida está en vuelo, o cuando el usuario no tiene foto
   personalizada.
4. `undefined` (sin insignia). **Nunca** el favicon de YT Music — reforzaba
   visualmente la marca que precisamente queríamos evitar cambiando el
   Application ID.

**Por qué no localhost**: Discord tiene un media-proxy en
`media.discordapp.net` que fetchea las URLs de largeImageKey/smallImageKey
desde SUS servidores para cachearlas y servirlas a otros usuarios que ven
el estado. Localhost/127.0.0.1 es inalcanzable desde ahí, por eso el
servidor HTTP interno del stream proxy NO puede usarse para esto y hay
que subir a un host público. Catbox.moe se eligió porque acepta uploads
anónimos sin API key y persiste indefinidamente.

Assets del portal (opcional, para robustez):
- `icon` — logo de ERO'S Music (mínimo 512×512). Solo se usa como fallback
  literal cuando `trackThumb` es undefined (track sin carátula, muy raro).

## Arquitectura (flujo de datos)

```
usePlayer (Zustand, renderer)
  │
  ├─► navigator.mediaSession   → Chromium → Windows SMTC (panel de medios)
  │
  └─► window.api.mini.publishState(state)          [preload/index.ts]
          │  ipcRenderer.send('mini:state', …)
          ▼
      main/index.ts  ipcMain.on(IPC.MINI_STATE)
          │
          ├─► miniWindow.webContents.send(…)       (ventana del mini-player)
          └─► updateDiscordPresence(state)         [integrations/discord.ts]
                     │
                     ▼
              @xhayper/discord-rpc  Client.user.setActivity({ type: 2, … })
```

Frecuencia: ~1 Hz (throttling en `mediaSession.ts`). Deduplicación en
`updateDiscordPresence()` — solo reenvía si cambia el key (título+artista+
estado+perfil) o hay un seek > 3 s. Los timestamps de start/end hacen que la
barra de Discord avance sola, así que no hace falta reenviar cada segundo.

## Archivos clave (no tocar sin entender por qué)

| Archivo | Rol |
|---|---|
| `src/main/integrations/discord.ts` | Toda la integración Discord. `DEFAULT_CLIENT_ID`, `setDiscordEnabled`, `updateDiscordPresence`, `refreshDiscordPresence`. |
| `src/main/integrations/imageHost.ts` | F62 · Sube la foto personalizada (data URL) a catbox.moe y devuelve URL HTTPS cacheada. `getOrUploadProfilePhotoUrl(dataUrl, onFresh)`. La cache vive en `discord.profilePhotoUpload` (SQLite). |
| `src/main/index.ts` (líneas ~385–402) | Wire de `ipcMain.on(IPC.MINI_STATE)` → `updateDiscordPresence`. Enable inicial desde settings. |
| `src/main/ipc/index.ts` | Handler `discordRpc` (toggle en Ajustes) → llama a `setDiscordEnabled`. Handler `PROFILE_SET` → llama a `refreshDiscordPresence` (para que un cambio de foto/nombre se refleje al instante). |
| `src/renderer/src/player/mediaSession.ts` | Publica `NowPlayingInfo` al main a ~1 Hz. También alimenta `navigator.mediaSession` (SMTC de Windows). |
| `src/preload/index.ts` (línea ~146) | Expone `window.api.mini.publishState`. |
| `src/renderer/src/pages/SettingsPage.tsx` (líneas 969–975) | UI del toggle "Discord RPC". |

## Reconexión y modo offline

- Discord cerrado al arrancar: `ensureConnected()` reintenta como mucho una
  vez cada 30 s. No spamea, no bloquea. Se conecta al primer trigger válido
  tras abrir Discord.
- Toggle OFF en Ajustes: `clearActivity()` + `client.destroy()`. El estado
  desaparece de Discord al instante.
- Toggle ON tras un OFF: la próxima publicación del renderer dispara
  `ensureConnected()` y vuelve a arrancar. No hace falta reiniciar la app.
- Modo perfil personalizado (F25): si Discord rechaza la foto de perfil como
  `data:` URL (algunos backends solo aceptan HTTPS), hay un `catch` que
  reintenta con la carátula del track como imagen grande — no romper ese
  fallback.

## Cómo verificar tras un build (`npm run dist` + reinstalar)

1. Cerrar Discord y la app (evitar RPC "colgado" del cliente viejo).
2. Abrir Discord.
3. Abrir ERO'S Music, reproducir cualquier canción.
4. En Discord (perfil propio o de un amigo mirando tu estado):
   - Cabecera: **Listening to ERO'S Music** — si dice "YouTube Music", el
     Client ID está mal. Volver a leer "Punto rojo".
   - `details`: título del track (o `por <artista>` si perfil personalizado
     activo).
   - `state`: artista (o título si perfil personalizado activo).
   - Carátula grande + barra de progreso avanzando sola.
5. Pausar la reproducción → la presencia desaparece (o marca pausa, según
   Discord). Reanudar → vuelve.
6. Toggle en Ajustes OFF/ON → desaparece y reaparece.
7. Cerrar Discord, esperar 30 s con la canción sonando, reabrirlo → la
   presencia reaparece sola en ≤30 s (backoff de `ensureConnected`).

## Qué NO tocar y por qué

- **`DEFAULT_CLIENT_ID`**: ver "Punto rojo". Cualquier cambio requiere que
  la nueva app ya esté registrada en el portal con nombre y assets
  correctos. No es un valor de ejemplo.
- **Nombre del asset fallback `'icon'`**: debe coincidir con el key subido
  en el portal. Renombrar en el código = renombrar también en el portal.
- **`type: 2`** (Listening) en el `setActivity`: es lo que produce la
  cabecera "Listening to X". Cambiar a `0` (Playing) haría que Discord diga
  "Playing ERO'S Music" — feo para un reproductor.
- **Publicación desde `mediaSession.ts`**: sirve al mini-player Y a Discord
  con el MISMO evento. No dividir en dos publicaciones distintas ni bajar
  la frecuencia por debajo de ~1 Hz sin actualizar la deduplicación.
- **`appId` / `AppUserModelId`** (`com.zero.erosmusic` desde v1.2.0; antes
  `com.zero.metrolistpc`): irrelevantes para Discord RPC (bypasea SMTC),
  pero críticos para que Windows agrupe la ventana bien. El cambio de
  v1.2.0 fue deliberado (rebranding F63) y está cubierto: installer.nsh
  desinstala las versiones con el appId viejo por DisplayName. No volver a
  cambiarlos por "limpieza".

## Historial breve

- **Inicio**: RPC arrancó reusando el Client ID público `1177081335727267940`
  de `th-ch/youtube-music`, así que Discord decía "Listening to YouTube
  Music". Todo lo demás (canción, arte, barra) ya salía del código de ERO'S
  Music.
- **2026-08-16**: Zero registró su propia app "ERO'S Music" en el Discord
  Developer Portal y se sustituyó el `DEFAULT_CLIENT_ID` por el propio.
  Desde entonces la cabecera es la correcta. El archivo `discord.ts`
  documenta el nuevo ID en su JSDoc de cabecera.
