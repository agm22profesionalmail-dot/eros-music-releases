import type { Shelf } from '@shared/types'
import { HOME_QUICK_PICK_CATEGORIES } from '@shared/types'
import { categorizeShelf } from '@shared/homeShelfCategorize'
import { useSettings } from '../app/settingsStore'

/**
 * F32 · Fila de chips grandes de selecciones rápidas en Home.
 *
 * Se pinta bajo el saludo y antes de HomeHero. Cada chip lleva emoji +
 * nombre y hace scroll a la primera estantería que caiga en esa categoría.
 * Si el usuario tiene `homeQuickPicks` vacío no renderiza nada. Si el chip
 * no encuentra estantería que matchee, se pinta desactivado.
 */
export function HomeQuickPicks({ shelves }: { shelves: Shelf[] | null }): React.JSX.Element | null {
  const { settings } = useSettings()
  const picks = settings.homeQuickPicks ?? []
  if (picks.length === 0) return null

  // Mapa categoría → índice de la primera estantería que matchee.
  const targetByCategory = new Map<string, number>()
  if (shelves) {
    for (let i = 0; i < shelves.length; i++) {
      const cat = categorizeShelf(shelves[i])
      if (cat && !targetByCategory.has(cat)) targetByCategory.set(cat, i)
    }
  }

  const scrollToShelf = (index: number): void => {
    // Las estanterías se pintan como .shelf en HomePage; buscamos por índice
    // de aparición para ser robustos ante cambios de estilo.
    const el = document.querySelectorAll<HTMLElement>('.shelf')[index]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const items = picks
    .map((id) => HOME_QUICK_PICK_CATEGORIES.find((c) => c.id === id))
    .filter((c): c is (typeof HOME_QUICK_PICK_CATEGORIES)[number] => Boolean(c))

  if (items.length === 0) return null

  return (
    <div className="home-quickpicks" role="list" aria-label="Selecciones rápidas">
      {items.map((cat) => {
        const target = targetByCategory.get(cat.id)
        const disabled = target === undefined
        return (
          <button
            key={cat.id}
            type="button"
            role="listitem"
            className={`home-quickpick ${disabled ? 'is-disabled' : ''}`}
            onClick={() => (target !== undefined ? scrollToShelf(target) : undefined)}
            disabled={disabled}
            aria-label={`Ir a ${cat.label}`}
            title={disabled ? `Sin estantería de ${cat.label} ahora mismo` : `Saltar a ${cat.label}`}
          >
            <span className="home-quickpick-emoji" aria-hidden="true">
              {cat.emoji}
            </span>
            <span className="home-quickpick-label">{cat.label}</span>
          </button>
        )
      })}
    </div>
  )
}
