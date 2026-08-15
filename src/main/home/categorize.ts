/**
 * F32 · Módulo main de categorización de estanterías de Home.
 *
 * La lógica pura vive en `src/shared/homeShelfCategorize.ts` para poder
 * compartirse con el renderer (que no puede importar de `@main/*`). Este
 * archivo existe para que el resto del código de main tenga un punto de
 * entrada dentro de `src/main/home/`.
 */

export { shelfId, categorizeShelf } from '@shared/homeShelfCategorize'
