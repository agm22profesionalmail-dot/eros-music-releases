import { useState } from 'react'
import { usePlayer } from '../player/store'
import type { QueueItem } from '@shared/types'

/**
 * F51 · Utilidades de crossfade visual para cualquier superficie de la UI.
 *
 * La duración SIEMPRE viene de `crossfading.durationMs`, que el store calcula
 * a partir del `crossfadeSec` de Ajustes en el momento del trigger — si el
 * usuario cambia el ajuste, el siguiente fundido visual dura lo nuevo, en
 * sincronía exacta con el fade de audio.
 */

/** URL de carátula en alta resolución (las de YT vienen con =wNNN-hNNN). */
export function hiRes(url: string): string {
  return url.replace(/=w\d+-h\d+/, '=w1080-h1080')
}

/**
 * F52 · Congela el valor del PRIMER render. Clave anti-parpadeo: si la
 * propiedad `animation` de un elemento cambia de valor cuando `crossfading`
 * pasa a null (fin del fade), el navegador REINICIA la animación desde
 * opacity 0 → la misma carátula "reaparece" y rompe la inmersión. Con el
 * valor congelado en el montaje, el fin del crossfade no toca el estilo.
 */
function useMountConst<T>(value: T): T {
  return useState(value)[0]
}

/**
 * F52 · Capa de imagen "entrante" con animación decidida en el montaje:
 * con `enterFadeMs` hace el fade-in del crossfade; sin él, la animación
 * idle que pida la superficie. Cambios posteriores de props no re-animan.
 */
export function CoverLayer({
  src,
  enterFadeMs,
  idleAnim,
  style
}: {
  src: string
  enterFadeMs: number | null
  idleAnim: string
  style?: React.CSSProperties
}): React.JSX.Element {
  const animation = useMountConst(
    enterFadeMs != null ? `np-cover-fade-in ${enterFadeMs}ms linear both` : idleAnim
  )
  return <img src={src} alt="" style={{ ...style, animation }} />
}

/**
 * Pista saliente y duración del fundido en curso. `from` solo llega cuando
 * hay una transición real entre pistas distintas — fuera de un crossfade (o
 * si la saliente es la misma pista) devuelve `null` y la superficie pinta su
 * estado normal.
 */
export function useCrossfadeFrom(current: QueueItem | null): {
  from: QueueItem | null
  durMs: number
} {
  const crossfading = usePlayer((s) => s.crossfading)
  const from = crossfading?.fromTrack ?? null
  const durMs = crossfading?.durationMs ?? 500
  if (!from || !current || from.videoId === current.videoId) return { from: null, durMs }
  return { from, durMs }
}

/**
 * Fondo de página con la carátula difuminada, en doble capa durante el
 * crossfade: la saliente se desvanece mientras la entrante aparece, ambas
 * con la duración del fade de audio. Sin crossfade cae al fade-in suave de
 * siempre (`lyrics-bg-in`, 1.2 s).
 */
export function CrossfadeBlurBg({
  current,
  from,
  durMs,
  filter,
  scale
}: {
  current: QueueItem
  from: QueueItem | null
  durMs: number
  filter: string
  scale: number
}): React.JSX.Element | null {
  if (!current.thumbnailUrl) return null
  const base: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    filter,
    transform: `scale(${scale})`,
    zIndex: 0
  }
  return (
    <>
      {from?.thumbnailUrl && (
        <div
          key={`xf-from-${from.videoId}`}
          className="lyrics-bg xf-bg-out"
          aria-hidden="true"
          style={{
            ...base,
            backgroundImage: `url(${hiRes(from.thumbnailUrl)})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 1,
            animation: `np-cover-fade-out ${durMs}ms linear both`
          }}
        />
      )}
      <BgCurrentLayer
        key={`xf-cur-${current.videoId}`}
        url={hiRes(current.thumbnailUrl)}
        enterFadeMs={from ? durMs : null}
        base={base}
      />
    </>
  )
}

/**
 * F52 · Capa entrante del fondo con la animación CONGELADA en el montaje —
 * cuando `crossfading` se limpia, el estilo no cambia y no hay "reaparición".
 */
function BgCurrentLayer({
  url,
  enterFadeMs,
  base
}: {
  url: string
  enterFadeMs: number | null
  base: React.CSSProperties
}): React.JSX.Element {
  const animation = useMountConst(
    enterFadeMs != null
      ? `np-cover-fade-in ${enterFadeMs}ms linear both`
      : 'lyrics-bg-in 1.2s var(--ease-out) forwards'
  )
  return (
    <div
      className="lyrics-bg"
      aria-hidden="true"
      style={{
        ...base,
        backgroundImage: `url(${url})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        opacity: 0,
        animation
      }}
    />
  )
}
