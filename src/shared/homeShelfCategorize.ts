/**
 * F32 · Categorización de estanterías de Home.
 *
 * Se sitúa en `shared/` porque main (`src/main/home/categorize.ts`) y
 * renderer (`HomePage.tsx`) necesitan usar la misma lógica de `shelfId()`
 * para filtrar/ordenar sin depender de IPC. La tabla de categorías vive en
 * un único sitio para no divergir en typos.
 */

import type { Shelf } from './types'

/** Marcas combinantes (tildes, diéresis) para eliminar tras NFD. */
const DIACRITICS = /[̀-ͯ]/g

function stripDiacritics(input: string): string {
  return String(input ?? '').normalize('NFD').replace(DIACRITICS, '')
}

/**
 * Normaliza un título a un slug estable: sin diacríticos, sin signos,
 * espacios colapsados y todo en minúscula. Usado como id de una estantería
 * en `homeHiddenShelves` y `homeShelvesOrder`.
 */
export function shelfId(title: string): string {
  return stripDiacritics(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, '-')
}

interface CategoryRule {
  id: string
  /** Palabras clave sin diacríticos, en minúscula, coincidencia de subcadena. */
  keywords: string[]
}

/**
 * Reglas de categoría → palabras clave. Cada palabra se comprueba contra el
 * título normalizado (sin acentos, minúscula). La primera categoría cuya
 * palabra clave aparezca en el título gana.
 */
const CATEGORY_RULES: CategoryRule[] = [
  { id: 'recientes', keywords: ['reciente', 'vuelve a escuchar', 'recent'] },
  { id: 'novedades', keywords: ['novedad', 'nuevo', 'new'] },
  { id: 'mixes', keywords: ['mix', 'mezcla'] },
  { id: 'radios', keywords: ['radio'] },
  { id: 'topcharts', keywords: ['top', 'chart', 'mas escuchado'] },
  { id: 'sugerencias', keywords: ['sugerid', 'recomend'] }
]

/** Devuelve la categoría (id) de una estantería o `null` si ninguna matchea. */
export function categorizeShelf(shelf: Shelf): string | null {
  const norm = stripDiacritics(shelf?.title ?? '').toLowerCase()
  for (const rule of CATEGORY_RULES) {
    for (const kw of rule.keywords) {
      const nk = stripDiacritics(kw).toLowerCase()
      if (norm.includes(nk)) return rule.id
    }
  }
  return null
}
