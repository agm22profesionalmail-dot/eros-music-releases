import type { MediaCard, Shelf as ShelfData } from '@shared/types'
import { Card } from './Card'

interface ShelfProps {
  shelf: ShelfData
  onPlayItem?: (item: MediaCard) => void
  limit?: number
}

export function ShelfRow({ shelf, onPlayItem, limit = 7 }: ShelfProps): React.JSX.Element {
  return (
    <section>
      <div className="shelf-header">
        <h2>{shelf.title}</h2>
      </div>
      <div className="card-grid">
        {shelf.items.slice(0, limit).map((item, i) => (
          <Card key={`${item.id}-${i}`} item={item} index={i} onPlay={onPlayItem} />
        ))}
      </div>
    </section>
  )
}
