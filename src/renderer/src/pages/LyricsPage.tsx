import { useEffect, useMemo, useRef, useState } from 'react'
import type { LyricsData } from '@shared/types'
import { usePlayer } from '../player/store'
import { engine } from '../player/engine'
import { computeLineFill } from '../app/karaoke'
import { useSettings } from '../app/settingsStore'

// ---------- F30 · Romanización CJK (Hepburn simplificado + Revised Romanization) ----------
// Se replica aquí en el renderer para no depender de IPC en cada línea. La versión
// canónica vive en `main/lyrics/romanize.ts`; ambas tienen que mantenerse en paralelo.

function hasCjkRenderer(text: string): boolean {
  return /[぀-ヿ㐀-鿿가-힯]/.test(text)
}

const KANA: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', ゐ: 'wi', ゑ: 'we', を: 'wo',
  ん: 'n',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
  ゃ: 'ya', ゅ: 'yu', ょ: 'yo',
  ゎ: 'wa', ゔ: 'vu'
}
const YOON: Record<string, string> = {
  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo',
  ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
  しゃ: 'sha', しゅ: 'shu', しょ: 'sho',
  じゃ: 'ja', じゅ: 'ju', じょ: 'jo',
  ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho',
  ぢゃ: 'ja', ぢゅ: 'ju', ぢょ: 'jo',
  にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo',
  ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo',
  びゃ: 'bya', びゅ: 'byu', びょ: 'byo',
  ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo',
  みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
  りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo',
  ふぁ: 'fa', ふぃ: 'fi', ふぇ: 'fe', ふぉ: 'fo',
  ゔぁ: 'va', ゔぃ: 'vi', ゔぇ: 've', ゔぉ: 'vo',
  てぃ: 'ti', でぃ: 'di', でゅ: 'dyu',
  つぁ: 'tsa', つぃ: 'tsi', つぇ: 'tse', つぉ: 'tso',
  うぃ: 'wi', うぇ: 'we', うぉ: 'wo',
  しぇ: 'she', じぇ: 'je', ちぇ: 'che'
}
function kataToHira(ch: string): string {
  const code = ch.charCodeAt(0)
  if (code >= 0x30a1 && code <= 0x30f6) return String.fromCharCode(code - 0x60)
  return ch
}
const HANGUL_ONSET = ['g','kk','n','d','tt','r','m','b','pp','s','ss','','j','jj','ch','k','t','p','h']
const HANGUL_NUCLEUS = ['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i']
const HANGUL_CODA = ['','k','k','k','n','n','n','t','l','k','m','l','l','l','l','l','m','p','p','t','t','ng','t','t','k','t','p','t']
function romanizeHangulChar(ch: string): string {
  const code = ch.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return ch
  const syl = code - 0xac00
  return HANGUL_ONSET[Math.floor(syl / 588)] +
    HANGUL_NUCLEUS[Math.floor((syl % 588) / 28)] +
    HANGUL_CODA[syl % 28]
}
function romanizeRenderer(text: string): string {
  let stage1 = ''
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    stage1 += code >= 0xac00 && code <= 0xd7a3 ? romanizeHangulChar(ch) : ch
  }
  const chars = Array.from(stage1)
  let out = ''
  let sokuon = false
  let lastVowel = ''
  for (let i = 0; i < chars.length; i++) {
    const original = chars[i]
    const hira = kataToHira(original)
    if (original === 'ー' || hira === 'ー') { out += lastVowel; continue }
    if (hira === 'っ') { sokuon = true; continue }
    const nextHira = i + 1 < chars.length ? kataToHira(chars[i + 1]) : ''
    const pair = hira + nextHira
    if (YOON[pair]) {
      let roma = YOON[pair]
      if (sokuon) { roma = roma[0] + roma; sokuon = false }
      out += roma; lastVowel = roma[roma.length - 1]; i++; continue
    }
    if (KANA[hira]) {
      let roma = KANA[hira]
      if (sokuon) { roma = roma[0] + roma; sokuon = false }
      out += roma; lastVowel = roma[roma.length - 1]; continue
    }
    out += original; lastVowel = ''; sokuon = false
  }
  return out
}

/**
 * Vista de letras a pantalla completa: línea activa resaltada con
 * desplazamiento suave y ajuste manual de desfase.
 */

export function LyricsPage(): React.JSX.Element {
  const current = usePlayer((s) => s.current())
  const currentTime = usePlayer((s) => s.currentTime)
  const seek = usePlayer((s) => s.seek)
  const settings = useSettings((s) => s.settings)
  const updateSettings = useSettings((s) => s.update)
  const romanizeOn = settings.romanizeLyrics
  const [lyrics, setLyrics] = useState<LyricsData | null | 'loading'>('loading')
  const [offsetMs, setOffsetMs] = useState(0)
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!current) {
      setLyrics(null)
      return
    }
    let cancelled = false
    setLyrics('loading')
    setOffsetMs(0)
    void window.api.music
      .lyrics({
        videoId: current.videoId,
        title: current.title,
        artists: current.artists.map((a) => a.name),
        album: current.album?.name,
        durationSec: current.durationSec
      })
      .then((data) => {
        if (!cancelled) setLyrics(data)
      })
      .catch(() => {
        if (!cancelled) setLyrics(null)
      })
    return () => {
      cancelled = true
    }
  }, [current?.videoId])

  const timeMs = currentTime * 1000 + offsetMs
  const synced = lyrics !== 'loading' && lyrics?.synced?.length ? lyrics.synced : null

  // F30 · Precomputa la romanización de cada línea cuando el toggle está
  // activo y la letra contiene caracteres CJK. Se memoiza para no reprocesar
  // el bloque entero en cada tick del karaoke.
  const romanizedSynced = useMemo(() => {
    if (!romanizeOn || !synced) return null
    if (!synced.some((l) => hasCjkRenderer(l.text))) return null
    return synced.map((l) => (hasCjkRenderer(l.text) ? romanizeRenderer(l.text) : ''))
  }, [romanizeOn, synced])
  const romanizedPlain = useMemo(() => {
    if (!romanizeOn) return null
    if (lyrics === 'loading' || !lyrics?.plain) return null
    if (!hasCjkRenderer(lyrics.plain)) return null
    return romanizeRenderer(lyrics.plain)
  }, [romanizeOn, lyrics])

  let activeIndex = -1
  if (synced) {
    for (let i = 0; i < synced.length; i++) {
      if (synced[i].timeMs <= timeMs) activeIndex = i
      else break
    }
  }

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeIndex])

  // Animación fluida de karaoke: rellena la línea activa siguiendo el reloj
  // real del audio (rAF), sin pasar por re-renders de React.
  const offsetRef = useRef(offsetMs)
  offsetRef.current = offsetMs
  const syncedRef = useRef(synced)
  syncedRef.current = synced
  const activeIndexRef = useRef(activeIndex)
  activeIndexRef.current = activeIndex

  useEffect(() => {
    let raf = 0
    const tick = (): void => {
      const el = activeRef.current
      const lines = syncedRef.current
      const idx = activeIndexRef.current
      if (el && lines && idx >= 0) {
        const line = lines[idx]
        const nextStart = lines[idx + 1]?.timeMs ?? line.timeMs + 6000
        const nowMs = engine.currentTime * 1000 + offsetRef.current
        const pct = computeLineFill(line, nextStart, nowMs)
        el.style.setProperty('--fill', `${pct.toFixed(1)}%`)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  if (!current) {
    return <div className="empty-state">Reproduce algo para ver su letra</div>
  }

  return (
    <div style={{ position: 'relative', minHeight: '100%' }}>
      {/* Carátula gigante difuminada como fondo (Apple Music "concert mode") */}
      {current.thumbnailUrl && (
        <div
          key={current.videoId}
          className="lyrics-bg"
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${current.thumbnailUrl.replace(/=w\d+-h\d+/, '=w1080-h1080')})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(72px) saturate(1.35) brightness(0.55)',
            transform: 'scale(1.25)',
            opacity: 0,
            animation: 'lyrics-bg-in 1.2s var(--ease-out) forwards',
            zIndex: 0
          }}
        />
      )}
      <div
        className="page"
        style={{
          maxWidth: 820,
          margin: '0 auto',
          position: 'relative',
          zIndex: 1,
          overflowX: 'hidden'
        }}
      >
      <h1 style={{ fontSize: 20, display: 'flex', flexWrap: 'wrap', gap: '0 8px' }}>
        <span>{current.title}</span>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>
          · {current.artists.map((a) => a.name).join(', ')}
        </span>
      </h1>

      {lyrics === 'loading' && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 60 }}>
          <div className="spinner" />
        </div>
      )}

      {lyrics !== 'loading' && !lyrics && (
        <div className="empty-state">No se encontró letra para esta canción</div>
      )}

      {synced && (
        <>
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              color: 'var(--text-subdued)',
              fontSize: 12,
              padding: '4px 0 16px'
            }}
          >
            <span>Fuente: {lyrics !== 'loading' && lyrics ? lyrics.source : ''}</span>
            <span style={{ marginLeft: 'auto' }}>Desfase: {(offsetMs / 1000).toFixed(1)} s</span>
            <button
              className={`chip ${romanizeOn ? 'active' : ''}`}
              title="Muestra romanización (ローマ字) bajo las letras japonesas/coreanas"
              onClick={() => void updateSettings({ romanizeLyrics: !romanizeOn })}
            >
              ローマ字
            </button>
            <button className="chip" onClick={() => setOffsetMs((v) => v - 500)}>
              −0,5 s
            </button>
            <button className="chip" onClick={() => setOffsetMs((v) => v + 500)}>
              +0,5 s
            </button>
            {offsetMs !== 0 && (
              <button className="chip" onClick={() => setOffsetMs(0)}>
                Reset
              </button>
            )}
          </div>
          <div style={{ padding: '2vh 0 40vh' }}>
            {synced.map((line, i) => (
              <button
                key={i}
                ref={i === activeIndex ? activeRef : undefined}
                className={i === activeIndex ? 'karaoke-fill' : undefined}
                onClick={() => seek(Math.max(0, (line.timeMs - offsetMs) / 1000))}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 0',
                  fontSize: 30,
                  fontWeight: 800,
                  lineHeight: 1.25,
                  letterSpacing: '-0.01em',
                  // Cantadas: iluminadas; futuras: apagadas; la activa la pinta .karaoke-fill
                  color: i === activeIndex ? undefined : i < activeIndex ? 'var(--text-primary)' : 'var(--text-subdued)',
                  transition: 'color 0.3s',
                  cursor: 'pointer',
                  ...(i === activeIndex ? { transition: 'none' } : {})
                }}
              >
                {line.text || '♪'}
                {romanizedSynced && romanizedSynced[i] && (
                  <span
                    style={{
                      display: 'block',
                      fontSize: 14,
                      fontWeight: 500,
                      letterSpacing: 0,
                      color: 'var(--text-subdued)',
                      marginTop: 2
                    }}
                  >
                    {romanizedSynced[i]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {lyrics !== 'loading' && lyrics && !synced && lyrics.plain && (
        <div
          style={{
            whiteSpace: 'pre-wrap',
            fontSize: 18,
            lineHeight: 1.7,
            color: 'var(--text-secondary)',
            padding: '12px 0 40px',
            userSelect: 'text'
          }}
        >
          {/* F30 · chip para activar/desactivar romanización también en modo plano */}
          <div style={{ display: 'flex', gap: 8, padding: '0 0 12px' }}>
            <button
              className={`chip ${romanizeOn ? 'active' : ''}`}
              onClick={() => void updateSettings({ romanizeLyrics: !romanizeOn })}
            >
              ローマ字
            </button>
          </div>
          {lyrics.plain}
          {romanizedPlain && (
            <div
              style={{
                marginTop: 16,
                paddingTop: 16,
                borderTop: '1px solid var(--divider)',
                color: 'var(--text-subdued)',
                fontSize: 15,
                lineHeight: 1.7
              }}
            >
              {romanizedPlain}
            </div>
          )}
          <p style={{ fontSize: 12, color: 'var(--text-subdued)', paddingTop: 24 }}>
            Fuente: {lyrics.source} (sin sincronizar)
          </p>
        </div>
      )}
      </div>
    </div>
  )
}
