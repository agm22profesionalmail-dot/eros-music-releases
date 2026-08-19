import { usePlayer } from '../player/store'
import { CloseIcon, MusicNoteIcon } from '../components/Icons'
import { useCrossfadeFrom } from '../components/CrossfadeVisual'
import { openContextMenu } from '../components/ContextMenu'
import { useT } from '../app/i18n'
import { askText } from '../components/TextModal'
import { pushToast } from '../components/Toast'
import { useLibrary } from '../app/libraryStore'

// F43 · agente C · task #23: iconos inline dedicados a la cabecera de la cola.
// Estilo "trazo redondeado" a juego con Icons.tsx (rediseño propio, sin clones
// de Spotify). Se mantienen locales por ser exclusivos de esta cabecera.
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
}

function TrashIcon({ size = 16 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

function PlaylistPlusIcon({ size = 16 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M3 7h12M3 12h8M3 17h6" />
      <path d="M17 13v7M13.5 16.5h7" />
    </svg>
  )
}

export function QueuePanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const t = useT()
  const queue = usePlayer((s) => s.queue)
  const index = usePlayer((s) => s.index)
  const current = usePlayer((s) => s.current())
  const removeFromQueue = usePlayer((s) => s.removeFromQueue)

  const upcoming = queue.slice(index + 1)

  // F51 · Animación de "mezcla" durante el crossfade: la fila saliente se
  // encoge y desvanece (con lo que TODA la lista sube suavemente durante el
  // fade), la entrante asciende a su hueco de "Sonando ahora" y un subrayado
  // acento se llena con la duración exacta del crossfade de audio.
  const { from: mixFrom, durMs: mixDurMs } = useCrossfadeFrom(current)
  // F54 · Fila clicada mientras se resuelve su stream: pulso "cargando"
  const pendingJump = usePlayer((s) => s.pendingJump)

  // F43 · agente C · task #23: "Limpiar cola" — deja SOLO la canción actual.
  // Si no hay actual y no hay upcoming, no tiene sentido (botón deshabilitado).
  // Usamos playTracks([current], 0) para no romper el estado del engine: eso
  // es lo mismo que hacer "reproduce solo este track", que es exactamente lo
  // que queremos (cola limpia con la que suena ahora dentro).
  const canClear = Boolean(current) && upcoming.length > 0
  const onClear = (): void => {
    if (!current) return
    void usePlayer.getState().playTracks([current], 0)
    pushToast(t('queue.cleared'))
  }

  // F43 · agente C · task #23: "Guardar como playlist" — pide nombre y crea
  // una playlist con TODOS los tracks de la cola (incluida la actual y las de
  // atrás; el orden natural de la cola es el histórico y no lo alteramos).
  // Solo aparece cuando la cola tiene 2+ tracks para no ensuciar la cabecera.
  const canSave = queue.length > 1
  const onSaveAsPlaylist = (): void => {
    if (queue.length === 0) return
    const videoIds = queue.map((q) => q.videoId).filter(Boolean)
    if (videoIds.length === 0) return
    void askText({
      title: t('queue.saveAsPlaylist'),
      placeholder: t('sidebar.newPlaylistPlaceholder'),
      confirmLabel: t('btn.create')
    }).then((name) => {
      if (!name) return
      void window.api.library
        .playlistCreate(name, videoIds)
        .then((id) => {
          if (id) {
            pushToast(t('queue.playlistCreatedNamed', { name }))
            void useLibrary.getState().refresh()
          } else {
            pushToast(t('toast.playlistCreateFailed'))
          }
        })
        .catch(() => pushToast(t('toast.playlistCreateFailed')))
    })
  }

  return (
    <aside className="queue-panel">
      <div className="qp-header">
        <span>{t('queue.title')}</span>
        {/* F43 · agente C · task #23: agrupamos las acciones a la derecha en un
            único contenedor flex. El botón cerrar sigue siendo el último por
            hábito muscular. Los otros dos solo aparecen cuando tienen sentido. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            className="icon-btn"
            onClick={onClear}
            disabled={!canClear}
            aria-label={t('queue.clear')}
            title={t('queue.clearTitle')}
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              display: 'grid',
              placeItems: 'center',
              opacity: canClear ? 1 : 0.4,
              cursor: canClear ? 'pointer' : 'default'
            }}
          >
            <TrashIcon size={16} />
          </button>
          <button
            className="icon-btn"
            onClick={onSaveAsPlaylist}
            disabled={!canSave}
            aria-label={t('queue.saveAsPlaylist')}
            title={t('queue.saveAsPlaylist')}
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              display: 'grid',
              placeItems: 'center',
              opacity: canSave ? 1 : 0.4,
              cursor: canSave ? 'pointer' : 'default'
            }}
          >
            <PlaylistPlusIcon size={16} />
          </button>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label={t('queue.close')}
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              display: 'grid',
              placeItems: 'center'
            }}
          >
            <CloseIcon size={16} />
          </button>
        </div>
      </div>
      <div className="qp-list">
        {current && (
          <>
            <div className="qp-section">
              {mixFrom ? t('queue.mixing') : t('queue.playing')}
            </div>
            {/* F51 · Fila saliente: colapsa (alto + opacidad) durante el fade,
                haciendo que la entrante y toda la lista SUBAN con suavidad */}
            {mixFrom && (
              <div
                key={`mix-out-${mixFrom.videoId}`}
                className="library-row qp-mix-out"
                aria-hidden="true"
                style={{ ['--xfade-visual-ms' as string]: `${mixDurMs}ms` }}
              >
                {mixFrom.thumbnailUrl ? (
                  <img src={mixFrom.thumbnailUrl} alt="" />
                ) : (
                  <span className="ph">
                    <MusicNoteIcon size={20} />
                  </span>
                )}
                <span className="meta">
                  <span className="title">{mixFrom.title}</span>
                  <span className="subtitle">
                    {mixFrom.artists.map((a) => a.name).join(', ')}
                  </span>
                </span>
              </div>
            )}
            <div
              key={`playing-${current.queueId}`}
              className={`library-row active ${mixFrom ? 'qp-mix-in' : ''}`}
              style={mixFrom ? { ['--xfade-visual-ms' as string]: `${mixDurMs}ms` } : undefined}
            >
              {current.thumbnailUrl ? (
                <img src={current.thumbnailUrl} alt="" />
              ) : (
                <span className="ph">
                  <MusicNoteIcon size={20} />
                </span>
              )}
              <span className="meta">
                <span className="title" style={{ color: 'var(--accent)' }}>
                  {current.title}
                </span>
                <span className="subtitle">{current.artists.map((a) => a.name).join(', ')}</span>
              </span>
              {/* Subrayado de progreso: se llena en la duración del crossfade */}
              {mixFrom && <span className="qp-mix-progress" aria-hidden="true" />}
            </div>
          </>
        )}
        {upcoming.length > 0 && <div className="qp-section">{t('queue.next')}</div>}
        {upcoming.map((item) => (
          <button
            key={item.queueId}
            className={`library-row ${pendingJump?.videoId === item.videoId ? 'pending-jump' : ''}`}
            // F55 · UN solo clic salta a la canción (antes hacía falta doble).
            // Estado fresco + guard: si ya suena o su salto está en curso,
            // los clics repetidos (p. ej. un doble clic por costumbre) se
            // ignoran en vez de reiniciar la pista con otro fundido.
            onClick={() => {
              const st = usePlayer.getState()
              if (
                st.current()?.videoId === item.videoId ||
                st.pendingJump?.videoId === item.videoId
              ) {
                return
              }
              const idx = st.queue.findIndex((q) => q.queueId === item.queueId)
              if (idx >= 0) void st.playTracks(st.queue, idx)
            }}
            onContextMenu={(e) =>
              openContextMenu(e, [
                {
                  label: t('queue.playNow'),
                  action: () => {
                    const idx = queue.findIndex((q) => q.queueId === item.queueId)
                    if (idx >= 0) void usePlayer.getState().playTracks(queue, idx)
                  }
                },
                { label: t('queue.remove'), action: () => removeFromQueue(item.queueId) }
              ])
            }
          >
            {item.thumbnailUrl ? (
              <img src={item.thumbnailUrl} alt="" loading="lazy" />
            ) : (
              <span className="ph">
                <MusicNoteIcon size={20} />
              </span>
            )}
            <span className="meta">
              <span className="title">{item.title}</span>
              <span className="subtitle">{item.artists.map((a) => a.name).join(', ')}</span>
            </span>
          </button>
        ))}
        {!current && !upcoming.length && (
          <div className="empty-state" style={{ fontSize: 13 }}>
            {t('queue.empty')}
          </div>
        )}
      </div>
    </aside>
  )
}
