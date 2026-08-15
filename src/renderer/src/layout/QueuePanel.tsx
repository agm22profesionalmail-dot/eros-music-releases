import { usePlayer } from '../player/store'
import { CloseIcon, MusicNoteIcon } from '../components/Icons'
import { openContextMenu } from '../components/ContextMenu'
import { useT } from '../app/i18n'

export function QueuePanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const t = useT()
  const queue = usePlayer((s) => s.queue)
  const index = usePlayer((s) => s.index)
  const current = usePlayer((s) => s.current())
  const removeFromQueue = usePlayer((s) => s.removeFromQueue)

  const upcoming = queue.slice(index + 1)

  return (
    <aside className="queue-panel">
      <div className="qp-header">
        <span>{t('queue.title')}</span>
        <button className="icon-btn" onClick={onClose} aria-label={t('queue.close')}>
          <CloseIcon size={16} />
        </button>
      </div>
      <div className="qp-list">
        {current && (
          <>
            <div className="qp-section">{t('queue.playing')}</div>
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
        {upcoming.length > 0 && <div className="qp-section">{t('queue.next')}</div>}
        {upcoming.map((item) => (
          <button
            key={item.queueId}
            className="library-row"
            onDoubleClick={() => {
              const idx = queue.findIndex((q) => q.queueId === item.queueId)
              if (idx >= 0) void usePlayer.getState().playTracks(queue, idx)
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
