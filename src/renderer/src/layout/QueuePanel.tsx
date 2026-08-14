import { usePlayer } from '../player/store'
import { CloseIcon, MusicNoteIcon } from '../components/Icons'

export function QueuePanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const queue = usePlayer((s) => s.queue)
  const index = usePlayer((s) => s.index)
  const current = usePlayer((s) => s.current())
  const removeFromQueue = usePlayer((s) => s.removeFromQueue)

  const upcoming = queue.slice(index + 1)

  return (
    <aside className="queue-panel">
      <div className="qp-header">
        <span>Cola</span>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar cola">
          <CloseIcon size={16} />
        </button>
      </div>
      <div className="qp-list">
        {current && (
          <>
            <div className="qp-section">Reproduciendo</div>
            <div className="library-row active">
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
            </div>
          </>
        )}
        {upcoming.length > 0 && <div className="qp-section">A continuación</div>}
        {upcoming.map((item) => (
          <button
            key={item.queueId}
            className="library-row"
            onContextMenu={(e) => {
              e.preventDefault()
              removeFromQueue(item.queueId)
            }}
            title="Clic derecho para quitar de la cola"
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
            La cola está vacía
          </div>
        )}
      </div>
    </aside>
  )
}
