/**
 * Catálogo de diseños del fondo ambiental (ajuste `bgDesign`). Sigue el mismo
 * patrón de datos que THEME_PRESETS: una lista de entradas con `id` + claves
 * i18n, consumida por el selector de Ajustes y por `AmbientBackground`.
 *
 * OJO: esto NO es el visualizador a pantalla completa. Todos estos diseños son
 * capas ambientales difuminadas que viven detrás del contenido; comparten el
 * mismo canvas a baja resolución + blur y sólo cambian la rutina de dibujo.
 */
import type { AppSettings } from '@shared/types'

export type BgDesignId = AppSettings['bgDesign']

export interface BgDesign {
  id: BgDesignId
  /** Clave i18n del nombre visible en Ajustes */
  nameKey: string
}

export const BG_DESIGNS: BgDesign[] = [
  { id: 'blobs', nameKey: 'settings.bg.design.blobs' },
  { id: 'waves', nameKey: 'settings.bg.design.waves' },
  { id: 'particles', nameKey: 'settings.bg.design.particles' },
  { id: 'aurora', nameKey: 'settings.bg.design.aurora' },
  { id: 'artwork', nameKey: 'settings.bg.design.artwork' }
]
