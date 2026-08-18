import { useEffect, useState } from 'react'
import { useSettings } from '../app/settingsStore'
import { useAuth } from '../app/authStore'
import { THEME_PRESETS } from '../app/themePresets'
import { t as ti18n, useT } from '../app/i18n'
import { EQ_BANDS, EQ_BANDS_10, EQ_BANDS_15, EQ_BANDS_31 } from '../player/engine'
import {
  DEFAULT_HOME_QUICK_PICKS,
  DEFAULT_LYRICS_PROVIDERS,
  DEFAULT_STREAMING_SOURCES,
  HOME_QUICK_PICK_CATEGORIES,
  type HomeQuickPickIcon,
  type LyricsProvider,
  type StreamingSource
} from '@shared/types'
import {
  SparkleIcon,
  ClockIcon,
  HeadphonesIcon,
  RadioIcon,
  ChartIcon,
  LightbulbIcon
} from '../components/Icons'

import { InfoTooltip } from '../components/InfoTooltip'
import { Collapsible } from '../components/Collapsible'
import { ThemePresetGrid } from '../components/ThemePresetGrid'
import { useOnboarding } from '../app/onboardingStore'
import { useUpdater } from '../app/updaterStore'

// F58 · Icono SVG por categoría del catálogo de selecciones rápidas
// (comparte mapa de intención con HomeQuickPicks.tsx, ver Icons.tsx).
const QUICK_PICK_ICONS: Record<HomeQuickPickIcon, (props: { size?: number }) => React.JSX.Element> = {
  recent: ClockIcon,
  sparkle: SparkleIcon,
  headphones: HeadphonesIcon,
  radio: RadioIcon,
  chart: ChartIcon,
  lightbulb: LightbulbIcon
}

// F29 · Metadatos visibles de cada fuente de streaming. El backend usa el id
// tal cual (con alias normalizados) — este mapa solo alimenta la UI.
// F58 · Las descripciones (y el único nombre traducible) son claves i18n que
// se resuelven en el momento de pintar con `ti18n()`.
const STREAMING_SOURCE_META: Record<string, { nameKey?: string; name?: string; descKey: string }> = {
  YTMUSIC: {
    name: 'YouTube Music (WEB_REMIX)',
    descKey: 'settings.source.desc.ytmusic'
  },
  IOS: {
    name: 'iOS',
    descKey: 'settings.source.desc.ios'
  },
  ANDROID: {
    name: 'Android',
    descKey: 'settings.source.desc.android'
  },
  TV_EMBEDDED: {
    name: 'TV embed (TVHTML5)',
    descKey: 'settings.source.desc.tvEmbedded'
  },
  ANDROID_VR: {
    name: 'Android VR',
    descKey: 'settings.source.desc.androidVr'
  },
  WEB_CREATOR: {
    name: 'YouTube Studio (WEB_CREATOR)',
    descKey: 'settings.source.desc.webCreator'
  },
  MWEB: {
    nameKey: 'settings.source.name.mweb',
    descKey: 'settings.source.desc.mweb'
  }
}

function sourceMeta(id: string): { name: string; description: string } {
  const meta = STREAMING_SOURCE_META[id]
  if (!meta) return { name: id, description: ti18n('settings.source.desc.custom') }
  return {
    name: meta.nameKey ? ti18n(meta.nameKey) : (meta.name ?? id),
    description: ti18n(meta.descKey)
  }
}

// F30 · Metadatos de los proveedores de letras. La lógica del backend recorre
// la cadena en orden; este mapa solo alimenta la UI.
const LYRICS_PROVIDER_META: Record<string, { name: string; descKey: string }> = {
  LRCLIB: {
    name: 'LRCLIB',
    descKey: 'settings.lyrics.desc.lrclib'
  },
  KUGOU: {
    name: 'KuGou',
    descKey: 'settings.lyrics.desc.kugou'
  },
  YTMUSIC: {
    name: 'YouTube Music',
    descKey: 'settings.lyrics.desc.ytmusic'
  }
}

function lyricsProviderMeta(id: string): { name: string; description: string } {
  const meta = LYRICS_PROVIDER_META[id]
  if (!meta) return { name: id, description: ti18n('settings.lyrics.desc.custom') }
  return { name: meta.name, description: ti18n(meta.descKey) }
}

const EQ_PRESETS: Record<string, number[]> = {
  Plano: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  Bajos: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  Agudos: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6],
  Rock: [4, 3, 1, 0, -1, 0, 1, 3, 4, 4],
  Pop: [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2],
  Voz: [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1]
}

/**
 * F70 · Interpola un preset de 10 bandas a N bandas (15 o 31).
 * Usa interpolación lineal en escala logarítmica de frecuencia para que el
 * preset suene consistente independientemente del número de bandas activo.
 */
function interpolatePreset(preset10: number[], targetBands: readonly number[]): number[] {
  const srcBands = EQ_BANDS_10
  if (targetBands.length === srcBands.length) return [...preset10]

  return targetBands.map((freq) => {
    const logFreq = Math.log2(freq)

    // Si coincide exactamente con una banda fuente, devolver su valor
    const exact = srcBands.indexOf(freq as (typeof srcBands)[number])
    if (exact !== -1) return preset10[exact]

    // Encontrar las dos bandas fuente más cercanas
    const logSrc = srcBands.map((f) => Math.log2(f))

    // Por debajo de la primera banda fuente → usar su valor
    if (logFreq <= logSrc[0]) return preset10[0]
    // Por encima de la última banda fuente → usar su valor
    if (logFreq >= logSrc[logSrc.length - 1]) return preset10[preset10.length - 1]

    // Interpolar entre las dos bandas más cercanas
    for (let i = 0; i < logSrc.length - 1; i++) {
      if (logFreq >= logSrc[i] && logFreq <= logSrc[i + 1]) {
        const ratio = (logFreq - logSrc[i]) / (logSrc[i + 1] - logSrc[i])
        return Math.round((preset10[i] + ratio * (preset10[i + 1] - preset10[i])) * 10) / 10
      }
    }
    return 0
  })
}

// F58 · Etiqueta visible de cada preset del EQ (la clave del objeto de arriba
// queda como identificador interno).
const EQ_PRESET_LABEL_KEYS: Record<string, string> = {
  Plano: 'settings.eq.flat',
  Bajos: 'settings.eq.bass',
  Agudos: 'settings.eq.treble',
  Rock: 'settings.eq.rock',
  Pop: 'settings.eq.pop',
  Voz: 'settings.eq.voice'
}

const ACCENTS: { nameKey: string; value: string }[] = [
  // El rojo `#f43f4f` heredado de la app Android original; renombrado a
  // "clásico" con el rebranding v1.2.0 (el valor hex NO cambia: los ajustes
  // guardados referencian el color, no la clave).
  { nameKey: 'settings.accent.classic', value: '#f43f4f' },
  { nameKey: 'settings.accent.green', value: '#1ed760' },
  { nameKey: 'settings.accent.blue', value: '#3d91f4' },
  { nameKey: 'settings.accent.purple', value: '#b45cf0' },
  { nameKey: 'settings.accent.orange', value: '#ff8a3d' },
  { nameKey: 'settings.accent.cyan', value: '#2dd4bf' }
]

function Row({
  label,
  info,
  children
}: {
  label: string
  info?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '14px 0',
        borderBottom: '1px solid var(--divider)'
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {label}
        {info && <InfoTooltip text={info} />}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{children}</span>
    </div>
  )
}

/**
 * F32 · Editor de las selecciones rápidas de Inicio. Presenta las categorías
 * conocidas como checkboxes y persiste el array `homeQuickPicks` respetando
 * el orden del catálogo (así el usuario ve siempre los chips en el mismo
 * orden aunque active/desactive).
 */
function HomeQuickPicksEditor(): React.JSX.Element {
  const t = useT()
  const { settings, update } = useSettings()
  const active = new Set(settings.homeQuickPicks ?? [])

  const toggle = (id: string, on: boolean): void => {
    const next = HOME_QUICK_PICK_CATEGORIES
      .map((c) => c.id)
      .filter((cid) => (cid === id ? on : active.has(cid)))
    void update({ homeQuickPicks: next })
  }

  return (
    <div style={{ padding: '10px 0 6px' }}>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', paddingBottom: 6 }}>
        {t('settings.home.quickPicksHint')}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {HOME_QUICK_PICK_CATEGORIES.map((cat) => {
          const on = active.has(cat.id)
          const Icon = QUICK_PICK_ICONS[cat.icon]
          return (
            // F43 · agente C · task #17: chip ENTERO clicable — todo el pill es
            // el botón, sin checkbox nativo colgando al lado. El estado activo
            // pinta con --accent/--accent-fg definidos en global.css (.pill-chip).
            <button
              key={cat.id}
              type="button"
              className={`pill-chip ${on ? 'active' : ''}`}
              aria-pressed={on}
              onClick={() => toggle(cat.id, !on)}
            >
              <span aria-hidden="true" style={{ display: 'inline-flex' }}>
                <Icon size={16} />
              </span>
              <span>{t(`quickpick.${cat.id}`)}</span>
            </button>
          )
        })}
      </div>
      <div style={{ paddingTop: 8 }}>
        <button
          className="btn btn-secondary"
          onClick={() => void update({ homeQuickPicks: DEFAULT_HOME_QUICK_PICKS })}
        >
          {t('btn.restore')}
        </button>
      </div>
    </div>
  )
}

/**
 * F32 · Editor de orden/ocultación de estanterías. Pide al main la lista
 * actual con `homeShelfIndex()` y presenta un modal-lite (panel expandible)
 * con checkbox "Mostrar" y flechas ↑/↓ por estantería. Las estanterías
 * conocidas por `homeShelvesOrder` que no aparezcan hoy se conservan al
 * final para no perder configuración.
 */
function HomeShelvesEditor(): React.JSX.Element {
  const t = useT()
  const { settings, update } = useSettings()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<{ id: string; title: string }[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setRows(null)
    setErr(null)
    void window.api.music
      .homeShelfIndex()
      .then((data) => {
        if (cancelled) return
        // Mantén el orden custom actual arriba (respetando su posición); el
        // resto va detrás en el orden natural del proveedor.
        const known = new Map(data.map((r) => [r.id, r] as const))
        const orderIds = settings.homeShelvesOrder ?? []
        const arranged: { id: string; title: string }[] = []
        for (const id of orderIds) {
          const r = known.get(id)
          if (r) {
            arranged.push({ id: r.id, title: r.title })
            known.delete(id)
          } else {
            arranged.push({ id, title: ti18n('settings.home.notDetected', { id }) })
          }
        }
        for (const r of data) {
          if (known.has(r.id)) arranged.push({ id: r.id, title: r.title })
        }
        setRows(arranged)
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e?.message ?? e))
      })
    return () => {
      cancelled = true
    }
  }, [open, settings.homeShelvesOrder])

  const hidden = new Set(settings.homeHiddenShelves ?? [])

  const toggleHidden = (id: string, show: boolean): void => {
    const next = new Set(hidden)
    if (show) next.delete(id)
    else next.add(id)
    void update({ homeHiddenShelves: Array.from(next) })
  }

  const move = (index: number, dir: -1 | 1): void => {
    if (!rows) return
    const j = index + dir
    if (j < 0 || j >= rows.length) return
    const next = [...rows]
    ;[next[index], next[j]] = [next[j], next[index]]
    setRows(next)
    void update({ homeShelvesOrder: next.map((r) => r.id) })
  }

  return (
    <div style={{ padding: '10px 0' }}>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', paddingBottom: 6 }}>
        {t('settings.home.shelvesHint')}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" onClick={() => setOpen((v) => !v)}>
          {open ? t('settings.home.closeEditor') : t('settings.home.viewShelves')}
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => void update({ homeShelvesOrder: [], homeHiddenShelves: [] })}
        >
          {t('btn.restoreOrder')}
        </button>
      </div>
      {open && (
        <div
          style={{
            marginTop: 10,
            border: '1px solid var(--divider)',
            borderRadius: 10,
            padding: '10px 12px',
            background: 'var(--bg-elevated)'
          }}
        >
          {err && <div className="error-banner">{err}</div>}
          {!rows && !err && (
            <div style={{ padding: '8px 0', color: 'var(--text-subdued)' }}>{t('common.loading')}</div>
          )}
          {rows && rows.length === 0 && (
            <div style={{ padding: '8px 0', color: 'var(--text-subdued)' }}>
              {t('settings.home.noShelves')}
            </div>
          )}
          {rows?.map((r, i) => {
            const show = !hidden.has(r.id)
            return (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '8px 0',
                  borderBottom: '1px solid var(--divider)'
                }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.title}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={show}
                      onChange={(e) => toggleHidden(r.id, e.target.checked)}
                    />
                    {t('settings.home.show')}
                  </label>
                  <button
                    className="btn btn-secondary"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={t('settings.home.moveUp')}
                    title={t('settings.home.moveUp')}
                    style={{ padding: '2px 8px' }}
                  >
                    ↑
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => move(i, 1)}
                    disabled={i === rows.length - 1}
                    aria-label={t('settings.home.moveDown')}
                    title={t('settings.home.moveDown')}
                    style={{ padding: '2px 8px' }}
                  >
                    ↓
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * F33 · Sección "Red". Botón "Probar conexión" que hace un HEAD/GET simple
 * a `generate_204` (200 sin cuerpo) para validar que el proxy configurado
 * deja pasar el tráfico. Se ejecuta desde el renderer, así que sale por la
 * sesión por defecto de Electron — la misma a la que se aplica el proxy.
 */
function ProxyTestButton(): React.JSX.Element {
  const t = useT()
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const run = async (): Promise<void> => {
    setPending(true)
    setMsg(ti18n('settings.network.checking'))
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8000)
      const res = await fetch('https://www.google.com/generate_204', {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal
      })
      clearTimeout(timer)
      // 204 es el esperado; cualquier 2xx/3xx también vale como "hay red"
      if (res.status === 204 || (res.status >= 200 && res.status < 400)) {
        setMsg(ti18n('settings.network.okHttp', { status: res.status }))
      } else {
        setMsg(ti18n('settings.network.errHttp', { status: res.status }))
      }
    } catch (e) {
      setMsg(ti18n('settings.network.errMsg', { msg: String((e as Error)?.message ?? e) }))
    } finally {
      setPending(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <button className="btn btn-secondary" onClick={() => void run()} disabled={pending}>
        {pending ? t('settings.network.testing') : t('settings.network.testBtn')}
      </button>
      {msg && (
        <span
          style={{
            fontSize: 12,
            color: msg.startsWith('OK') ? 'var(--accent)' : 'var(--text-secondary)'
          }}
        >
          {msg}
        </span>
      )}
    </div>
  )
}

export function SettingsPage(): React.JSX.Element {
  const t = useT()
  const { settings, update } = useSettings()
  const auth = useAuth((s) => s.state)
  const [dirMsg, setDirMsg] = useState<string | null>(null)
  const [eqAdvancedOpen, setEqAdvancedOpen] = useState(false)
  // F68 · Last.fm auth flow
  const [lastfmAuthPending, setLastfmAuthPending] = useState(false)
  const [lastfmToken, setLastfmToken] = useState('')
  const [lastfmError, setLastfmError] = useState<string | null>(null)
  // F69 · ListenBrainz validation
  const [lbValidating, setLbValidating] = useState(false)
  const [lbValidResult, setLbValidResult] = useState<{ valid: boolean; user?: string } | null>(null)
  // F67 · Estado del updater para el botón "Buscar actualizaciones".
  const updaterState = useUpdater((s) => s.state)
  // F65 · Versión instalada (Ajustes → Sistema): una única llamada al montar.
  const [appVersion, setAppVersion] = useState('')
  useEffect(() => {
    let alive = true
    void window.api.app.getVersion().then((v) => {
      if (alive) setAppVersion(v)
    })
    return () => {
      alive = false
    }
  }, [])

  return (
    // F43 · agente C · task #16: quitamos el max-width inline (780px) que dejaba
    // media pantalla vacía en 1440px+. El ancho lo controla `.settings-page` en
    // global.css (min(1000px, 100% - 48px) + margin-inline: auto).
    <div className="page settings-page">
      <h1>{t('settings.title')}</h1>

      <h2>{t('settings.section.account')}</h2>
      <Row label={auth.status === 'signedIn' ? t('settings.account.signedIn') : t('settings.account.signedOut')}>
        {auth.status === 'signedIn' && (
          <button className="btn btn-secondary" onClick={() => void window.api.auth.signOut()}>
            {t('btn.signOut')}
          </button>
        )}
      </Row>

      {/* F60 · Reproducción — básico: lo que se toca a diario. El resto de
          ajustes de reproducción vive en "Ajustes avanzados" más abajo. */}
      <h2>{t('settings.section.playback')}</h2>
      <Row label={t('settings.playback.quality')}>
        {(
          [
            ['auto', 'settings.quality.auto'],
            ['high', 'settings.quality.high'],
            ['medium', 'settings.quality.medium'],
            ['low', 'settings.quality.low']
          ] as const
        ).map(([value, labelKey]) => (
          <button
            key={value}
            className={`chip ${settings.audioQuality === value ? 'active' : ''}`}
            onClick={() => void update({ audioQuality: value })}
          >
            {t(labelKey)}
          </button>
        ))}
      </Row>
      <Row label={t('settings.playback.autoplay')}>
        <input
          type="checkbox"
          checked={settings.autoplay}
          onChange={(e) => void update({ autoplay: e.target.checked })}
        />
      </Row>
      <Row label={t('settings.playback.similar')}>
        <input
          type="checkbox"
          checked={settings.enableSimilarContent}
          onChange={(e) => void update({ enableSimilarContent: e.target.checked })}
        />
      </Row>
      <Row label={t('settings.playback.normalize')}>
        <input
          type="checkbox"
          checked={settings.normalize}
          onChange={(e) => void update({ normalize: e.target.checked })}
        />
        {(
          [
            ['soft', 'settings.normalize.soft'],
            ['normal', 'settings.normalize.normal'],
            ['loud', 'settings.normalize.loud'],
            ['aggressive', 'settings.normalize.aggressive']
          ] as const
        ).map(([value, labelKey]) => (
          <button
            key={value}
            className={`chip ${settings.normalizeLevel === value ? 'active' : ''}`}
            onClick={() => void update({ normalizeLevel: value })}
            disabled={!settings.normalize}
          >
            {t(labelKey)}
          </button>
        ))}
      </Row>
      <Row label={t('settings.playback.rate', { rate: settings.playbackRate.toFixed(2) })}>
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.05}
          value={settings.playbackRate}
          onChange={(e) => void update({ playbackRate: Number(e.target.value) })}
        />
        <button
          className="chip"
          onClick={() => void update({ playbackRate: 1 })}
          disabled={settings.playbackRate === 1}
        >
          1x
        </button>
      </Row>
      <Row label={t('settings.playback.preservePitch')}>
        <input
          type="checkbox"
          checked={settings.preservePitch}
          onChange={(e) => void update({ preservePitch: e.target.checked })}
        />
      </Row>
      <Row label={t('settings.playback.historyLength', { n: settings.historyMaxEntries })}>
        <input
          type="range"
          min={100}
          max={5000}
          step={100}
          value={settings.historyMaxEntries}
          onChange={(e) => void update({ historyMaxEntries: Number(e.target.value) })}
        />
      </Row>
      <Row
        label={t('settings.playback.crossfade', { sec: settings.crossfadeSec })}
        info={t('settings.tooltip.crossfade')}
      >
        <input
          type="range"
          min={0}
          max={12}
          step={1}
          value={settings.crossfadeSec}
          onChange={(e) => void update({ crossfadeSec: Number(e.target.value) })}
        />
      </Row>

      <h2>{t('settings.section.content')}</h2>
      <Row label={t('settings.content.hideExplicit')}>
        <input
          type="checkbox"
          checked={settings.hideExplicit}
          onChange={(e) => void update({ hideExplicit: e.target.checked })}
        />
      </Row>
      <Row label={t('settings.content.hideVideos')}>
        <input
          type="checkbox"
          checked={settings.hideVideos}
          onChange={(e) => void update({ hideVideos: e.target.checked })}
        />
      </Row>
      <Row label={t('settings.content.hideShorts')}>
        <input
          type="checkbox"
          checked={settings.hideShorts}
          onChange={(e) => void update({ hideShorts: e.target.checked })}
        />
      </Row>
      <Row label={t('settings.content.language')}>
        {/* F43 · agente C · task #17: quitamos estilos inline — el select
            recibe el look custom (fondo, borde, flecha SVG) desde global.css. */}
        <select
          value={settings.contentLanguage}
          onChange={(e) => void update({ contentLanguage: e.target.value })}
        >
          <option value="auto">{t('settings.appearance.uiLanguage.auto')}</option>
          <option value="es">Español</option>
          <option value="en">English</option>
          <option value="fr">Français</option>
          <option value="de">Deutsch</option>
          <option value="it">Italiano</option>
          <option value="pt">Português</option>
        </select>
      </Row>
      <Row label={t('settings.content.country')}>
        {/* F43 · agente C · task #17: mismo tratamiento — el look sale del CSS. */}
        <select
          value={settings.contentCountry}
          onChange={(e) => void update({ contentCountry: e.target.value })}
        >
          <option value="auto">{t('settings.appearance.uiLanguage.auto')}</option>
          {(['ES', 'US', 'AR', 'MX', 'CO', 'CL', 'PE', 'UY', 'BR', 'FR', 'DE', 'IT', 'PT', 'GB'] as const).map(
            (code) => (
              <option key={code} value={code}>
                {t(`country.${code}`)}
              </option>
            )
          )}
        </select>
      </Row>
      <p style={{ color: 'var(--text-subdued)', fontSize: 12, padding: '4px 0 0' }}>
        {t('settings.content.note')}
      </p>

      {/* F60 · Estadísticas y Wrapped — básico */}
      <h2>{t('settings.section.stats')}</h2>
      <p style={{ color: 'var(--text-subdued)', fontSize: 12, padding: '0 0 8px' }}>
        {t('settings.stats.note')}
      </p>
      <Row label={t('settings.stats.showRecapCard')}>
        <input
          type="checkbox"
          checked={settings.showWrappedRecapCard}
          onChange={(e) => void update({ showWrappedRecapCard: e.target.checked })}
        />
      </Row>
      <Row label={t('settings.stats.showTopWeekly')}>
        <input
          type="checkbox"
          checked={settings.showTopWeekly}
          onChange={(e) => void update({ showTopWeekly: e.target.checked })}
        />
      </Row>
      <Row label={t('settings.stats.showTopMonthly')}>
        <input
          type="checkbox"
          checked={settings.showTopMonthly}
          onChange={(e) => void update({ showTopMonthly: e.target.checked })}
        />
      </Row>

      {/* F60 · Personalizar Inicio — básico */}
      <h2>{t('settings.section.customizeHome')}</h2>
      <p style={{ color: 'var(--text-subdued)', fontSize: 12, padding: '0 0 8px' }}>
        {t('settings.home.note')}
      </p>
      <Row label={t('settings.home.shuffleShelves')}>
        <input
          type="checkbox"
          checked={settings.homeShuffleShelves}
          onChange={(e) => void update({ homeShuffleShelves: e.target.checked })}
        />
      </Row>
      <HomeQuickPicksEditor />

      <h2>{t('settings.section.artistPage')}</h2>
      <Row label={t('settings.artist.showDescription')}>
        <input
          type="checkbox"
          checked={settings.showArtistDescription}
          onChange={(e) => void update({ showArtistDescription: e.target.checked })}
        />
      </Row>
      <Row label={t('settings.artist.showSubscribers')}>
        <input
          type="checkbox"
          checked={settings.showArtistSubscribers}
          onChange={(e) => void update({ showArtistSubscribers: e.target.checked })}
        />
      </Row>
      <Row label={t('settings.artist.showMonthly')}>
        <input
          type="checkbox"
          checked={settings.showArtistMonthlyListeners}
          onChange={(e) => void update({ showArtistMonthlyListeners: e.target.checked })}
        />
      </Row>

      {/* F60 · Ecualizador — excepción acordada: presets siempre visibles,
          las 10 bandas + preamp se revelan inline con un toggle propio (no
          en el desplegable general) para no partir la sección en dos sitios. */}
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {t('settings.section.equalizer')}
        <InfoTooltip text={t('settings.tooltip.equalizer')} />
      </h2>
      <div className="sidebar-filters" style={{ padding: '4px 0 12px' }}>
        {Object.entries(EQ_PRESETS).map(([name, gains10]) => {
          // Comparar contra las ganancias del modo activo
          const eqMode = settings.eqMode ?? '10'
          const activeGainsKey = eqMode === '31' ? 'eqGains31' : eqMode === '15' ? 'eqGains15' : 'eqGains'
          const activeGains = settings[activeGainsKey] as number[]
          const targetBands = eqMode === '31' ? EQ_BANDS_31 : eqMode === '15' ? EQ_BANDS_15 : EQ_BANDS_10
          const interpolated = interpolatePreset(gains10, targetBands)
          const isActive = JSON.stringify(activeGains) === JSON.stringify(interpolated)

          return (
            <button
              key={name}
              className={`chip ${isActive ? 'active' : ''}`}
              onClick={() => {
                // Aplicar a TODOS los modos para coherencia, pero forzar el motor
                // con los gains del modo activo
                const g10 = interpolatePreset(gains10, EQ_BANDS_10)
                const g15 = interpolatePreset(gains10, EQ_BANDS_15)
                const g31 = interpolatePreset(gains10, EQ_BANDS_31)
                void update({ eqGains: g10, eqGains15: g15, eqGains31: g31 })
                void import('../player/engine').then(({ engine }) => {
                  engine.setEq(interpolated)
                })
              }}
            >
              {t(EQ_PRESET_LABEL_KEYS[name] ?? name)}
            </button>
          )
        })}
      </div>
      {/* F70 · Selector de modo EQ: 10 / 15 / 31 bandas */}
      <Row label={t('settings.eq.mode')}>
        <div className="sidebar-filters" style={{ padding: 0 }}>
          {(['10', '15', '31'] as const).map((mode) => (
            <button
              key={mode}
              className={`chip ${(settings.eqMode ?? '10') === mode ? 'active' : ''}`}
              onClick={() => {
                const gains =
                  mode === '31' ? settings.eqGains31 : mode === '15' ? settings.eqGains15 : settings.eqGains
                void update({ eqMode: mode })
                // Forzar aplicación al motor
                void import('../player/engine').then(({ engine }) => engine.setEqMode(mode, gains))
              }}
            >
              {t(`settings.eq.mode${mode}`)}
            </button>
          ))}
        </div>
      </Row>
      <div style={{ paddingBottom: 4 }}>
        <button
          type="button"
          className="btn btn-secondary"
          aria-expanded={eqAdvancedOpen}
          onClick={() => setEqAdvancedOpen((v) => !v)}
        >
          {eqAdvancedOpen ? t('settings.eq.hideAdvanced') : t('settings.eq.showAdvanced')}
        </button>
      </div>
      {eqAdvancedOpen && (() => {
        const eqMode = settings.eqMode ?? '10'
        const activeBands = eqMode === '31' ? EQ_BANDS_31 : eqMode === '15' ? EQ_BANDS_15 : EQ_BANDS_10
        const activeGainsKey = eqMode === '31' ? 'eqGains31' : eqMode === '15' ? 'eqGains15' : 'eqGains'
        const activeGains = settings[activeGainsKey] as number[]
        return (
        <>
          <div
            style={{
              display: 'flex',
              gap: eqMode === '31' ? 4 : eqMode === '15' ? 8 : 12,
              alignItems: 'flex-end',
              padding: '8px 0 4px',
              justifyContent: 'space-between',
              maxWidth: 640,
              overflowX: eqMode === '31' ? 'auto' : undefined
            }}
          >
            {activeBands.map((freq, i) => (
              <div key={freq} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={1}
                  value={activeGains[i] ?? 0}
                  onChange={(e) => {
                    const gains = [...activeGains]
                    gains[i] = Number(e.target.value)
                    void update({ [activeGainsKey]: gains })
                  }}
                  style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 110 }}
                />
                <span style={{ fontSize: eqMode === '31' ? 9 : 11, color: 'var(--text-secondary)' }}>
                  {freq >= 1000 ? `${freq / 1000}k` : freq}
                </span>
              </div>
            ))}
          </div>
          <Row
            label={t('settings.eq.preamp', { db: `${settings.preampDb > 0 ? '+' : ''}${settings.preampDb}` })}
            info={t('settings.tooltip.preamp')}
          >
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={settings.preampDb}
              onChange={(e) => void update({ preampDb: Number(e.target.value) })}
            />
          </Row>
        </>
        )
      })()}

      <h2>{t('settings.section.downloads')}</h2>
      <Row label={t('settings.downloads.folder')}>
        <code
          style={{
            background: 'var(--bg-elevated)',
            padding: '6px 10px',
            borderRadius: 4,
            fontSize: 12,
            maxWidth: 320,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {settings.localMusicDir || settings.downloadsDir || t('settings.downloads.default')}
        </code>
        <button
          className="btn btn-secondary"
          style={{ padding: '8px 16px' }}
          onClick={() => {
            void window.api.localMusic.changeDir().then((newDir) => {
              if (newDir) {
                void update({ localMusicDir: newDir })
                setDirMsg(ti18n('settings.downloads.changed'))
              }
            })
          }}
        >
          {t('btn.change')}
        </button>
        <button
          className="btn btn-secondary"
          style={{ padding: '8px 16px' }}
          onClick={() => void window.api.localMusic.openDir()}
        >
          {t('btn.open')}
        </button>
      </Row>
      {dirMsg && <p style={{ color: 'var(--accent)', padding: '8px 0' }}>{dirMsg}</p>}
      <p style={{ color: 'var(--text-subdued)', fontSize: 12, padding: '4px 0 0' }}>
        {t('settings.downloads.note')}
      </p>
      <p style={{ color: 'var(--text-subdued)', fontSize: 11, padding: '4px 0 0', fontStyle: 'italic' }}>
        {t('settings.localMusic.cacheInfo')}
      </p>

      <h2>{t('settings.section.appearance')}</h2>
      {/* F34 · Selector de idioma de la UI (auto/es/en) */}
      <Row label={t('settings.appearance.uiLanguage')}>
        {/* F43 · agente C · task #17: look del select desde global.css. */}
        <select
          value={settings.uiLanguage}
          onChange={(e) =>
            void update({ uiLanguage: e.target.value as 'auto' | 'es' | 'en' })
          }
        >
          <option value="auto">{t('settings.appearance.uiLanguage.auto')}</option>
          <option value="es">{t('settings.appearance.uiLanguage.es')}</option>
          <option value="en">{t('settings.appearance.uiLanguage.en')}</option>
        </select>
      </Row>
      <Row label={t('settings.appearance.theme')}>
        {(
          [
            ['dark', 'settings.theme.dark'],
            ['black', 'settings.theme.black'],
            ['light', 'settings.theme.light']
          ] as const
        ).map(([value, labelKey]) => (
          <button
            key={value}
            className={`chip ${settings.theme === value && settings.themePreset === 'none' ? 'active' : ''}`}
            onClick={() => void update({ theme: value, themePreset: 'none' })}
          >
            {t(labelKey)}
          </button>
        ))}
      </Row>

      {/* F36 · Temas predefinidos con colores fijos (estilo Discord Nitro) */}
      <div className="profile-block" style={{ paddingTop: 4 }}>
        <div style={{ fontWeight: 600, paddingBottom: 2 }}>{t('settings.themes.title')}</div>
        <p style={{ color: 'var(--text-subdued)', fontSize: 12, padding: '0 0 10px' }}>
          {t('settings.themes.note')}
        </p>
        {/* F61 · Grid extraído a ThemePresetGrid, compartido con el paso
            `theme` del onboarding. Mismo comportamiento (toggle a 'none'). */}
        <ThemePresetGrid
          value={settings.themePreset}
          onChange={(id) => void update({ themePreset: id })}
        />
        {settings.themePreset !== 'none' && (
          <p style={{ color: 'var(--text-secondary)', fontSize: 12, paddingTop: 8 }}>
            {t('settings.themes.active')}{' '}
            <strong>
              {THEME_PRESETS.find((p) => p.id === settings.themePreset)?.name ?? '—'}
            </strong>{' '}
            {t('settings.themes.pressAgain')}
          </p>
        )}
      </div>
      <Row label={t('settings.appearance.bg')}>
        {(
          [
            ['off', 'settings.bg.off'],
            ['ambient', 'settings.bg.ambient'],
            ['reactive', 'settings.bg.reactive']
          ] as const
        ).map(([value, labelKey]) => (
          <button
            key={value}
            className={`chip ${settings.bgMode === value ? 'active' : ''}`}
            onClick={() => void update({ bgMode: value })}
          >
            {t(labelKey)}
          </button>
        ))}
      </Row>
      <p style={{ color: 'var(--text-subdued)', fontSize: 12, padding: '4px 0 0' }}>
        {t('settings.bg.note')}
      </p>

      <Row label={t('settings.appearance.accent')}>
        <button
          className={`chip ${settings.accentMode === 'dynamic' ? 'active' : ''}`}
          title={t('settings.accent.dynamicTitle')}
          onClick={() =>
            void update({ accentMode: settings.accentMode === 'dynamic' ? 'fixed' : 'dynamic' })
          }
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <SparkleIcon size={13} /> {t('settings.accent.dynamic')}
        </button>
        {ACCENTS.map((a) => (
          <button
            key={a.value}
            title={t(a.nameKey)}
            onClick={() => void update({ accent: a.value, accentMode: 'fixed' })}
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: a.value,
              border:
                settings.accentMode === 'fixed' && settings.accent === a.value
                  ? '3px solid var(--text-primary)'
                  : '3px solid transparent'
            }}
          />
        ))}
        <input
          type="color"
          title={t('settings.accent.customTitle')}
          value={settings.accent}
          onChange={(e) => void update({ accent: e.target.value, accentMode: 'fixed' })}
          style={{
            width: 32,
            height: 32,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer'
          }}
        />
      </Row>

      <h2>{t('settings.section.integrations')}</h2>
      <Row label={t('settings.integrations.discord')}>
        <input
          type="checkbox"
          checked={settings.discordRpc}
          onChange={(e) => void update({ discordRpc: e.target.checked })}
        />
      </Row>
      <p style={{ color: 'var(--text-subdued)', fontSize: 12, padding: '4px 0 0' }}>
        {t('settings.integrations.discordNote')}
      </p>

      {/* F68 · Last.fm scrobbling */}
      <Row label={t('settings.integrations.lastfm')}>
        <input
          type="checkbox"
          checked={settings.lastfmEnabled}
          onChange={(e) => void update({ lastfmEnabled: e.target.checked })}
        />
      </Row>
      {settings.lastfmEnabled && (
        <div style={{ padding: '8px 0 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
          {settings.lastfmSessionKey && settings.lastfmUsername ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span>{t('settings.integrations.lastfmConnected', { user: settings.lastfmUsername })}</span>
              <button
                className="btn btn-secondary"
                style={{ padding: '4px 12px', fontSize: 12 }}
                onClick={() => {
                  void window.api.lastfm.disconnect()
                  void update({ lastfmSessionKey: '', lastfmUsername: '', lastfmEnabled: false })
                }}
              >
                {t('settings.integrations.lastfmDisconnect')}
              </button>
            </div>
          ) : lastfmAuthPending ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ margin: 0 }}>{t('settings.integrations.lastfmAuthStep1')}</p>
              <p style={{ margin: 0 }}>{t('settings.integrations.lastfmAuthStep2')}</p>
              <p style={{ margin: 0 }}>{t('settings.integrations.lastfmAuthStep3')}</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder={t('settings.integrations.lastfmTokenLabel')}
                  value={lastfmToken}
                  onChange={(e) => setLastfmToken(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: 4,
                    border: '1px solid var(--divider)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    fontSize: 13
                  }}
                />
                <button
                  className="btn btn-primary"
                  style={{ padding: '6px 14px', fontSize: 12 }}
                  disabled={!lastfmToken.trim()}
                  onClick={() => {
                    setLastfmError(null)
                    void window.api.lastfm
                      .authComplete(lastfmToken.trim())
                      .then((res: { sessionKey: string; username: string }) => {
                        void update({ lastfmSessionKey: res.sessionKey, lastfmUsername: res.username })
                        setLastfmAuthPending(false)
                        setLastfmToken('')
                      })
                      .catch((err: Error) => setLastfmError(err.message))
                  }}
                >
                  {t('settings.integrations.lastfmTokenBtn')}
                </button>
              </div>
              {lastfmError && (
                <span style={{ color: 'var(--error)', fontSize: 12 }}>{lastfmError}</span>
              )}
            </div>
          ) : (
            <div>
              <p style={{ margin: '0 0 8px' }}>{t('settings.integrations.lastfmNote')}</p>
              <button
                className="btn btn-primary"
                style={{ padding: '6px 16px', fontSize: 13 }}
                onClick={() => {
                  void window.api.lastfm.authUrl().then((url: string) => {
                    window.open(url, '_blank')
                    setLastfmAuthPending(true)
                  })
                }}
              >
                {t('settings.integrations.lastfmConnect')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* F69 · ListenBrainz sync */}
      <Row label={t('settings.integrations.listenbrainz')}>
        <input
          type="checkbox"
          checked={settings.listenbrainzEnabled}
          onChange={(e) => void update({ listenbrainzEnabled: e.target.checked })}
        />
      </Row>
      {settings.listenbrainzEnabled && (
        <div style={{ padding: '8px 0 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
          <p style={{ margin: '0 0 8px' }}>{t('settings.integrations.listenbrainzNote')}</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              placeholder={t('settings.integrations.listenbrainzToken')}
              value={settings.listenbrainzToken}
              onChange={(e) => void update({ listenbrainzToken: e.target.value })}
              style={{
                flex: 1,
                maxWidth: 340,
                padding: '6px 10px',
                borderRadius: 4,
                border: '1px solid var(--divider)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                fontSize: 13
              }}
            />
            <button
              className="btn btn-secondary"
              style={{ padding: '6px 14px', fontSize: 12 }}
              disabled={!settings.listenbrainzToken.trim() || lbValidating}
              onClick={() => {
                setLbValidating(true)
                setLbValidResult(null)
                void window.api.listenbrainz
                  .validate(settings.listenbrainzToken.trim())
                  .then((res: { valid: boolean; userName?: string }) => {
                    setLbValidResult({ valid: res.valid, user: res.userName })
                  })
                  .catch(() => setLbValidResult({ valid: false }))
                  .finally(() => setLbValidating(false))
              }}
            >
              {lbValidating
                ? t('settings.integrations.listenbrainzValidating')
                : t('settings.integrations.listenbrainzValidate')}
            </button>
          </div>
          {lbValidResult && (
            <p
              style={{
                margin: '6px 0 0',
                fontSize: 12,
                color: lbValidResult.valid ? 'var(--accent)' : 'var(--error)'
              }}
            >
              {lbValidResult.valid
                ? t('settings.integrations.listenbrainzValid', { user: lbValidResult.user ?? '' })
                : t('settings.integrations.listenbrainzInvalid')}
            </p>
          )}
        </div>
      )}

      <h2>{t('settings.section.system')}</h2>
      <Row label={t('settings.system.closeToTray')}>
        <input
          type="checkbox"
          checked={settings.closeToTray}
          onChange={(e) => void update({ closeToTray: e.target.checked })}
        />
      </Row>
      {/* F61 · Reabre el asistente de bienvenida (sin el paso de idioma). */}
      <Row label={t('settings.system.replayOnboarding')}>
        <button
          className="btn btn-secondary"
          onClick={() => useOnboarding.getState().start(true)}
        >
          {t('settings.system.replayOnboardingBtn')}
        </button>
      </Row>
      {/* F65 · Versión instalada (app.getVersion() vía IPC, solo lectura). */}
      <Row label={t('settings.system.version')}>
        <span style={{ fontFamily: 'ui-monospace, monospace', opacity: 0.85 }}>{appVersion}</span>
      </Row>
      {/* F67 · Comprobación manual de actualizaciones. El resultado llega por
          los eventos del updaterStore: "sin novedades"/error → toast; hay
          versión nueva → aparece el UpdateBanner global. */}
      <Row label={t('settings.system.checkUpdates')}>
        <button
          className="btn btn-secondary"
          disabled={updaterState === 'checking'}
          onClick={() => useUpdater.getState().checkNow()}
        >
          {updaterState === 'checking' ? t('update.checking') : t('update.checkNow')}
        </button>
      </Row>

      {/* F60 · Ajustes avanzados — arranca siempre cerrado, sin persistencia. */}
      <Collapsible title={t('settings.section.advanced')} defaultOpen={false}>
        <h3 className="settings-subsection">{t('settings.section.playback')}</h3>
        <Row label={t('settings.playback.shuffleFirst')} info={t('settings.tooltip.shuffleFirst')}>
          <input
            type="checkbox"
            checked={settings.shuffleFirstBeforeSimilar}
            onChange={(e) => void update({ shuffleFirstBeforeSimilar: e.target.checked })}
          />
        </Row>
        <Row label={t('settings.playback.preload80')} info={t('settings.tooltip.preload80')}>
          <input
            type="checkbox"
            checked={settings.preloadMoreAt80Percent}
            onChange={(e) => void update({ preloadMoreAt80Percent: e.target.checked })}
          />
        </Row>
        <Row label={t('settings.playback.noAutoloadRepeatAll')} info={t('settings.tooltip.noAutoloadRepeatAll')}>
          <input
            type="checkbox"
            checked={settings.disableAutoloadOnRepeatAll}
            onChange={(e) => void update({ disableAutoloadOnRepeatAll: e.target.checked })}
          />
        </Row>
        <Row label={t('settings.playback.gaplessNoCrossfade')} info={t('settings.tooltip.gaplessNoCrossfade')}>
          <input
            type="checkbox"
            checked={settings.disableCrossfadeOnGapless}
            onChange={(e) => void update({ disableCrossfadeOnGapless: e.target.checked })}
          />
        </Row>
        <Row label={t('settings.playback.progressiveSeek')} info={t('settings.tooltip.progressiveSeek')}>
          <input
            type="checkbox"
            checked={settings.progressiveSeek}
            onChange={(e) => void update({ progressiveSeek: e.target.checked })}
          />
        </Row>
        <Row label={t('settings.playback.avoidDuplicates')} info={t('settings.tooltip.avoidDuplicates')}>
          <input
            type="checkbox"
            checked={settings.avoidDuplicatesInQueue}
            onChange={(e) => void update({ avoidDuplicatesInQueue: e.target.checked })}
          />
        </Row>
        <Row label={t('settings.playback.skipOnError')} info={t('settings.tooltip.skipOnError')}>
          <input
            type="checkbox"
            checked={settings.skipOnError}
            onChange={(e) => void update({ skipOnError: e.target.checked })}
          />
        </Row>
        <Row label={t('settings.playback.rememberShuffle')} info={t('settings.tooltip.rememberShuffle')}>
          <input
            type="checkbox"
            checked={settings.rememberShuffleRepeat}
            onChange={(e) => void update({ rememberShuffleRepeat: e.target.checked })}
          />
        </Row>
        <Row label={t('settings.playback.persistentShuffle')} info={t('settings.tooltip.persistentShuffle')}>
          <input
            type="checkbox"
            checked={settings.persistentShuffle}
            onChange={(e) => void update({ persistentShuffle: e.target.checked })}
          />
        </Row>
        <Row label={t('settings.playback.autoDownloadOnLike')} info={t('settings.tooltip.autoDownloadOnLike')}>
          <input
            type="checkbox"
            checked={settings.autoDownloadOnLike}
            onChange={(e) => void update({ autoDownloadOnLike: e.target.checked })}
          />
        </Row>

        <h3 className="settings-subsection" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('settings.section.lyrics')}
          <InfoTooltip text={t('settings.tooltip.lyricsOrder')} />
        </h3>
        <p style={{ color: 'var(--text-subdued)', fontSize: 12, padding: '0 0 8px' }}>
          {t('settings.lyrics.note')}
        </p>
        <div className="streaming-source-list">
          {settings.lyricsProviders.map((prov: LyricsProvider, i) => {
            const meta = lyricsProviderMeta(prov.id)
            const total = settings.lyricsProviders.length
            const move = (delta: number): void => {
              const j = i + delta
              if (j < 0 || j >= total) return
              const next = settings.lyricsProviders.slice()
              const [item] = next.splice(i, 1)
              next.splice(j, 0, item)
              void update({ lyricsProviders: next })
            }
            return (
              <div key={prov.id} className="streaming-source-row">
                <input
                  type="checkbox"
                  checked={prov.enabled}
                  aria-label={t('settings.source.enable', { name: meta.name })}
                  onChange={(e) => {
                    const next = settings.lyricsProviders.map((p, k) =>
                      k === i ? { ...p, enabled: e.target.checked } : p
                    )
                    void update({ lyricsProviders: next })
                  }}
                />
                <div className="streaming-source-info">
                  <div className="streaming-source-name">{meta.name}</div>
                  <div className="streaming-source-desc">{meta.description}</div>
                </div>
                <div className="streaming-source-order">
                  <button
                    className="chip"
                    aria-label={t('settings.source.moveUp', { name: meta.name })}
                    disabled={i === 0}
                    onClick={() => move(-1)}
                  >
                    ↑
                  </button>
                  <button
                    className="chip"
                    aria-label={t('settings.source.moveDown', { name: meta.name })}
                    disabled={i === total - 1}
                    onClick={() => move(1)}
                  >
                    ↓
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        <Row label={t('settings.lyrics.romanize')}>
          <input
            type="checkbox"
            checked={settings.romanizeLyrics}
            onChange={(e) => void update({ romanizeLyrics: e.target.checked })}
          />
        </Row>
        <div style={{ padding: '10px 0 8px' }}>
          <button
            className="btn btn-secondary"
            onClick={() =>
              void update({
                lyricsProviders: DEFAULT_LYRICS_PROVIDERS.map((p) => ({ ...p })),
                romanizeLyrics: false
              })
            }
          >
            {t('btn.restore')}
          </button>
        </div>

        <h3 className="settings-subsection">{t('settings.section.stats')}</h3>
        <Row label={t('settings.stats.topLength', { n: settings.wrappedTopN })} info={t('settings.tooltip.topLength')}>
          <input
            type="range"
            min={10}
            max={200}
            step={10}
            value={settings.wrappedTopN}
            onChange={(e) => void update({ wrappedTopN: Number(e.target.value) })}
          />
        </Row>

        <h3 className="settings-subsection" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('settings.section.customizeHome')}
          <InfoTooltip text={t('settings.tooltip.shelvesEditor')} />
        </h3>
        <HomeShelvesEditor />

        <h3 className="settings-subsection">{t('settings.section.system')}</h3>
        <Row label={t('settings.system.pauseOnDeviceChange')} info={t('settings.tooltip.pauseOnDeviceChange')}>
          <input
            type="checkbox"
            checked={settings.pauseOnAudioDeviceChange}
            onChange={(e) => void update({ pauseOnAudioDeviceChange: e.target.checked })}
          />
        </Row>

        <h3 className="settings-subsection" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('settings.section.streamingSources')}
          <InfoTooltip text={t('settings.tooltip.streamingSources')} />
        </h3>
        <p style={{ color: 'var(--text-subdued)', fontSize: 12, padding: '0 0 8px' }}>
          {t('settings.sources.note')}
        </p>
        <div className="streaming-source-list">
          {settings.streamingSources.map((src: StreamingSource, i) => {
            const meta = sourceMeta(src.id)
            const total = settings.streamingSources.length
            const move = (delta: number): void => {
              const j = i + delta
              if (j < 0 || j >= total) return
              const next = settings.streamingSources.slice()
              const [item] = next.splice(i, 1)
              next.splice(j, 0, item)
              void update({ streamingSources: next })
            }
            return (
              <div key={src.id} className="streaming-source-row">
                <input
                  type="checkbox"
                  checked={src.enabled}
                  aria-label={t('settings.source.enable', { name: meta.name })}
                  onChange={(e) => {
                    const next = settings.streamingSources.map((s, k) =>
                      k === i ? { ...s, enabled: e.target.checked } : s
                    )
                    void update({ streamingSources: next })
                  }}
                />
                <div className="streaming-source-info">
                  <div className="streaming-source-name">{meta.name}</div>
                  <div className="streaming-source-desc">{meta.description}</div>
                </div>
                <div className="streaming-source-order">
                  <button
                    className="chip"
                    aria-label={t('settings.source.moveUp', { name: meta.name })}
                    disabled={i === 0}
                    onClick={() => move(-1)}
                  >
                    ↑
                  </button>
                  <button
                    className="chip"
                    aria-label={t('settings.source.moveDown', { name: meta.name })}
                    disabled={i === total - 1}
                    onClick={() => move(1)}
                  >
                    ↓
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        <Row label={t('settings.sources.ytdlpFallback')} info={t('settings.tooltip.ytdlpFallback')}>
          <input
            type="checkbox"
            checked={settings.useYtDlpFallback}
            onChange={(e) => void update({ useYtDlpFallback: e.target.checked })}
          />
        </Row>
        <div style={{ padding: '10px 0 8px' }}>
          <button
            className="btn btn-secondary"
            onClick={() =>
              void update({
                streamingSources: DEFAULT_STREAMING_SOURCES.map((s) => ({ ...s })),
                useYtDlpFallback: true
              })
            }
          >
            {t('btn.restore')}
          </button>
        </div>

        <h3 className="settings-subsection" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('settings.section.network')}
          <InfoTooltip text={t('settings.tooltip.network')} />
        </h3>
        <p style={{ color: 'var(--text-subdued)', fontSize: 12, padding: '0 0 8px' }}>
          {t('settings.network.note')}
        </p>
        <Row label={t('settings.network.proxyMode')}>
          {(
            [
              ['off', t('settings.proxy.off')],
              ['system', t('settings.proxy.system')],
              ['http', 'HTTP'],
              ['socks5', 'SOCKS5']
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={`chip ${settings.proxyMode === value ? 'active' : ''}`}
              onClick={() => void update({ proxyMode: value })}
            >
              {label}
            </button>
          ))}
        </Row>
        <Row label={t('settings.network.proxyServer')} info={t('settings.tooltip.proxyServer')}>
          <input
            type="text"
            value={settings.proxyUrl}
            disabled={settings.proxyMode !== 'http' && settings.proxyMode !== 'socks5'}
            placeholder={t('settings.network.proxyPlaceholder')}
            onChange={(e) => void update({ proxyUrl: e.target.value })}
            onBlur={(e) => void update({ proxyUrl: e.target.value.trim() })}
            style={{
              flex: 1,
              minWidth: 220,
              maxWidth: 360,
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid var(--divider)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontSize: 13
            }}
          />
        </Row>
        <Row label={t('settings.network.proxyTest')}>
          <ProxyTestButton />
        </Row>
      </Collapsible>
    </div>
  )
}
