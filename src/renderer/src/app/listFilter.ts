import { useEffect, useRef, useState } from 'react'
import type { MediaCard, TrackSummary } from '@shared/types'

/**
 * Helpers de filtrado in-memory para las listas de la app (playlists,
 * biblioteca, álbum). No consulta backend — solo criba lo que ya está
 * en pantalla.
 *
 * F21: buscador dentro de listas. Debounce + normalización de tildes y
 * mayúsculas para que «beyoncé» encuentre «Beyonce» y viceversa.
 */

// Rango de marcas combinantes Unicode U+0300–U+036F (los "acentos"
// que aparecen tras NFD). Se construye con `new RegExp` para no
// depender de que el fichero se guarde en UTF-8.
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')

/** Quita mayúsculas, diacríticos y espacios extremos: `Beyoncé ` → `beyonce`. */
export function normalizeQuery(s: string): string {
  return s.normalize('NFD').replace(DIACRITICS, '').toLowerCase().trim()
}

/** ¿Coincide una pista con el patrón (título o artistas)? */
export function matchesTrack(track: TrackSummary, needle: string): boolean {
  if (!needle) return true
  const n = normalizeQuery(needle)
  if (!n) return true
  if (normalizeQuery(track.title).includes(n)) return true
  for (const a of track.artists) if (normalizeQuery(a.name).includes(n)) return true
  return false
}

/** ¿Coincide una tarjeta (playlist/álbum/artista) con el patrón? */
export function matchesCard(card: MediaCard, needle: string): boolean {
  if (!needle) return true
  const n = normalizeQuery(needle)
  if (!n) return true
  if (normalizeQuery(card.title).includes(n)) return true
  if (card.subtitle && normalizeQuery(card.subtitle).includes(n)) return true
  return false
}

/**
 * Rebota los cambios de `value` con retardo `delay` ms.
 * Sencillo, con `useRef` para no recrear el timeout en cada render.
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebounced(value), delay)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [value, delay])
  return debounced
}
