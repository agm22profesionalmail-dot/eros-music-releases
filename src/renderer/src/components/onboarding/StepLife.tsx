import { useEffect, useRef, useState } from 'react'
import { CoverLayer, hiRes } from '../CrossfadeVisual'
import { hslCss, type ArtPalette } from '../../app/palette'
import { useT } from '../../app/i18n'
import { demoAmbientSamples } from '../../data/onboardingDemoData'

const XFADE_MS = 2600

type DemoSample = { cover: string; palette: ArtPalette | null }

/**
 * F61 · Paso "life": crossfade + fondo reactivo fusionados en un solo panel.
 *
 * La demo del crossfade es la de siempre (dos carátulas de la muestra con
 * `CoverLayer` + keyframes np-cover-fade-in/out, sin tocar `player/engine.ts`
 * ni sonar audio). La novedad es el TOGGLE "Previsualizar fondo reactivo":
 * un `useState` local — NO cambia ningún ajuste real — que enciende un glow
 * detrás de las carátulas con la paleta precomputada de la canción actual
 * (`demoAmbientSamples()`). Durante el fundido, el glow viaja del color de la
 * canción saliente al de la entrante AL MISMO RITMO (2.6 s): los colores van
 * en las custom properties --_a/--_b, registradas como `<color>` vía
 * `@property` en global.css para que su `transition` interpole frame a frame.
 *
 * Al terminar el fundido las carátulas intercambian papeles para poder
 * repetirlo; como el glow en reposo pinta la paleta de la actual, tras el
 * swap los colores ya coinciden con el destino de la transición — sin saltos.
 * El timer se limpia al desmontar (sin fugas si se cierra el wizard a mitad).
 */

/** Colores del glow para una paleta 60-30-10 (o neutros si faltara). */
function glowColors(p: ArtPalette | null): { a: string; b: string } {
  if (!p) return { a: 'var(--bg-elevated)', b: 'var(--accent)' }
  return {
    a: hslCss(p.baseHue, Math.min(0.5, p.baseSat), 0.2),
    b: hslCss(p.accentHue, 0.65, 0.45)
  }
}

export function StepLife(): React.JSX.Element {
  const t = useT()
  const samples = demoAmbientSamples()
  const [pair, setPair] = useState<[DemoSample, DemoSample] | null>(
    samples.length >= 2 ? [samples[0], samples[1]] : null
  )
  const [xfading, setXfading] = useState(false)
  const [ambientOn, setAmbientOn] = useState(false)
  const [run, setRun] = useState(0)
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current)
    },
    []
  )

  const play = (): void => {
    if (xfading || !pair) return
    setXfading(true)
    setRun((r) => r + 1)
    timer.current = window.setTimeout(() => {
      timer.current = null
      setXfading(false)
      setPair((p) => (p ? ([p[1], p[0]] as [DemoSample, DemoSample]) : p))
    }, XFADE_MS + 150)
  }

  // En fundido, el glow apunta a la paleta de la entrante (la transición CSS
  // hace el viaje de 2.6 s); en reposo, a la de la actual.
  const target = pair ? (xfading ? pair[1] : pair[0]) : null
  const colors = glowColors(target?.palette ?? null)

  return (
    <div className="onb-step onb-step-life">
      <h1>{t('onboarding.life.title')}</h1>
      <p className="onb-lead">{t('onboarding.life.body')}</p>

      {pair ? (
        <>
          <div className="onb-life-panel">
            <div
              className={`onb-life-glow ${ambientOn ? 'on' : ''}`}
              style={{ ['--_a' as string]: colors.a, ['--_b' as string]: colors.b }}
              aria-hidden="true"
            />
            <div className="onb-xfade-stage" aria-hidden="true">
              <img
                key={`out-${pair[0].cover}-${run}`}
                src={hiRes(pair[0].cover)}
                alt=""
                style={
                  xfading
                    ? { animation: `np-cover-fade-out ${XFADE_MS}ms linear both` }
                    : undefined
                }
              />
              {xfading && (
                <CoverLayer
                  key={`in-${pair[1].cover}-${run}`}
                  src={hiRes(pair[1].cover)}
                  enterFadeMs={XFADE_MS}
                  idleAnim="none"
                />
              )}
            </div>
          </div>
          <div className="onb-life-toolbar">
            <button className="btn btn-primary" onClick={play} disabled={xfading}>
              {xfading ? t('onboarding.life.mixing') : t('onboarding.life.play')}
            </button>
            <label className="onb-toggle">
              <input
                type="checkbox"
                checked={ambientOn}
                onChange={(e) => setAmbientOn(e.target.checked)}
              />
              <span>{t('onboarding.life.ambientToggle')}</span>
            </label>
          </div>
          <p className="onb-finePrint">{t('onboarding.life.note')}</p>
        </>
      ) : (
        <p className="onb-finePrint">{t('onboarding.tour.samplePending')}</p>
      )}
    </div>
  )
}
