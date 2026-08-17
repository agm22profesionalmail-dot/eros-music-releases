import { useCallback, useRef, useState } from 'react'

/**
 * F60 · Bolita "i" con bocadillo de ayuda contextual. Visibilidad 100% CSS
 * (:hover / :focus-within), sin estado en JS — sigue el mismo patrón que
 * `.volume-popover` en global.css (opacity + transform + transition).
 *
 * F61 · El único estado en JS es el desplazamiento horizontal (--tooltip-shift):
 * cerca del borde de una ventana estrecha, el bocadillo centrado con
 * translate(-50%) se corta contra el borde. Al entrar en hover/foco se mide
 * el rect real y se calcula el mínimo desplazamiento para que quepa dentro
 * del viewport (con un margen), sin tocar la lógica de visibilidad CSS.
 */
interface InfoTooltipProps {
  text: string
  placement?: 'top' | 'bottom'
}

export function InfoTooltip({ text, placement = 'top' }: InfoTooltipProps): React.JSX.Element {
  const bubbleRef = useRef<HTMLSpanElement>(null)
  const [shift, setShift] = useState(0)

  const reposition = useCallback(() => {
    const el = bubbleRef.current
    if (!el) return
    const margin = 12
    // Reescribe el shift a 0 directamente en el DOM antes de medir, para no
    // arrastrar el desplazamiento de una apertura anterior en el cálculo.
    el.style.setProperty('--tooltip-shift', '0px')
    const rect = el.getBoundingClientRect()
    let delta = 0
    if (rect.left < margin) delta = margin - rect.left
    else if (rect.right > window.innerWidth - margin) delta = window.innerWidth - margin - rect.right
    setShift(delta)
  }, [])

  return (
    <span
      className={`info-tooltip info-tooltip--${placement}`}
      tabIndex={0}
      onMouseEnter={reposition}
      onFocus={reposition}
    >
      <span className="info-tooltip-dot" aria-hidden="true">
        i
      </span>
      <span
        ref={bubbleRef}
        className="info-tooltip-bubble"
        role="tooltip"
        style={{ ['--tooltip-shift' as string]: `${shift}px` }}
      >
        {text}
      </span>
    </span>
  )
}
