import { usePlayer } from './store'

/**
 * Integración con el panel multimedia del sistema (SMTC en Windows) vía
 * la API estándar mediaSession de Chromium, y con las teclas multimedia
 * globales reenviadas por el main (funciona con la ventana en segundo plano).
 */

export function initMediaIntegration(): () => void {
  const ms = navigator.mediaSession

  ms.setActionHandler('play', () => usePlayer.getState().togglePlay())
  ms.setActionHandler('pause', () => usePlayer.getState().togglePlay())
  ms.setActionHandler('nexttrack', () => void usePlayer.getState().next())
  ms.setActionHandler('previoustrack', () => void usePlayer.getState().previous())
  ms.setActionHandler('seekto', (e) => {
    if (e.seekTime != null) usePlayer.getState().seek(e.seekTime)
  })

  // Metadatos: reflejar la pista actual en el panel del sistema
  const unsubscribe = usePlayer.subscribe((state) => {
    const current = state.current()
    if (!current) {
      ms.metadata = null
      ms.playbackState = 'none'
      return
    }
    ms.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artists.map((a) => a.name).join(', '),
      album: current.album?.name,
      artwork: current.thumbnailUrl
        ? [{ src: current.thumbnailUrl, sizes: '256x256', type: 'image/jpeg' }]
        : []
    })
    ms.playbackState = state.isPlaying ? 'playing' : 'paused'
  })

  // Teclas multimedia globales (main -> renderer)
  const offCommand = window.api.media.onCommand((cmd) => {
    const p = usePlayer.getState()
    if (cmd === 'playpause') p.togglePlay()
    else if (cmd === 'next') void p.next()
    else if (cmd === 'previous') void p.previous()
    else if (cmd === 'pause' && p.isPlaying) p.togglePlay()
    else if (cmd.startsWith('seek:')) {
      const t = Number(cmd.slice(5))
      if (Number.isFinite(t)) p.seek(t)
    }
  })

  // Publica el estado al main (alimenta mini-player y Discord RPC), 1 Hz máx.
  let lastPublish = 0
  let lastKey = ''
  const publish = (): void => {
    const state = usePlayer.getState()
    const current = state.current()
    const key = `${current?.videoId ?? ''}|${state.isPlaying}`
    const now = Date.now()
    if (key === lastKey && now - lastPublish < 1000) return
    lastKey = key
    lastPublish = now
    window.api.mini.publishState(
      current
        ? {
            title: current.title,
            artists: current.artists.map((a) => a.name).join(', '),
            album: current.album?.name,
            thumbnailUrl: current.thumbnailUrl,
            isPlaying: state.isPlaying,
            positionSec: state.currentTime,
            durationSec: state.duration || current.durationSec || 0
          }
        : null
    )
  }
  const unsubPublish = usePlayer.subscribe(publish)
  const publishTimer = window.setInterval(publish, 1000)

  return () => {
    unsubscribe()
    offCommand()
    unsubPublish()
    window.clearInterval(publishTimer)
  }
}
