// F34 · i18n mínimo — dict JSON por idioma + hook useT().
// Sin dependencias externas: solo Zustand (ya en el proyecto).

import { create } from 'zustand'
import esDict from '../i18n/es.json'
import enDict from '../i18n/en.json'

export type Locale = 'es' | 'en'
/** Valor persistido en Ajustes: 'auto' = detectar del sistema, 'es' | 'en' explícitos. */
export type UILanguagePref = 'auto' | Locale

type Dict = Record<string, string>

const dictionaries: Record<Locale, Dict> = {
  es: esDict as Dict,
  en: enDict as Dict
}

interface I18nState {
  /** Locale efectivo (resuelto: nunca 'auto'). */
  locale: Locale
  /** Cambia el locale efectivo. */
  setLocale: (l: Locale) => void
  /** Traduce una clave, sustituyendo `{param}` por su valor. */
  t: (key: string, params?: Record<string, string | number>) => string
}

/**
 * Resuelve la preferencia 'auto' | 'es' | 'en' a un locale efectivo.
 * En 'auto' mira `navigator.language` — si no es 'en', cae a 'es' (idioma base).
 */
export function resolveLocale(pref: UILanguagePref | undefined): Locale {
  if (pref === 'en') return 'en'
  if (pref === 'es') return 'es'
  // 'auto' o no definido → detecta del sistema
  try {
    const nav = typeof navigator !== 'undefined' ? navigator.language : ''
    return nav.toLowerCase().startsWith('en') ? 'en' : 'es'
  } catch {
    return 'es'
  }
}

export const useI18n = create<I18nState>((set, get) => ({
  locale: 'es',
  setLocale: (l) => {
    if (get().locale !== l) set({ locale: l })
  },
  t: (key, params) => {
    const dict = dictionaries[get().locale] ?? dictionaries.es
    // Fallback en cadena: locale → español → clave literal (útil en dev)
    let s = dict[key] ?? dictionaries.es[key] ?? key
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        s = s.replaceAll(`{${k}}`, String(v))
      }
    }
    return s
  }
}))

/**
 * Hook cómodo — se suscribe al locale (no a `t`, cuya referencia es estable en
 * Zustand) para que un cambio de idioma re-renderice al componente. Devuelve
 * una función `t` recién capturada del store, así lee el dict actualizado.
 */
export function useT(): (key: string, params?: Record<string, string | number>) => string {
  // Subscribirse al locale fuerza re-render cuando cambia — no basta con leer
  // `s.t` porque su referencia no cambia (Zustand no la sustituye).
  useI18n((s) => s.locale)
  return useI18n.getState().t
}

/** Acceso imperativo (fuera de un componente React). */
export function t(key: string, params?: Record<string, string | number>): string {
  return useI18n.getState().t(key, params)
}
