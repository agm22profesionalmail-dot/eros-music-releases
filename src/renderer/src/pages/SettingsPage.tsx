import { useEffect, useState } from 'react'
import { useSettings } from '../app/settingsStore'
import { useAuth } from '../app/authStore'
import { EQ_BANDS } from '../player/engine'
import {
  DEFAULT_HOME_QUICK_PICKS,
  DEFAULT_LYRICS_PROVIDERS,
  DEFAULT_STREAMING_SOURCES,
  HOME_QUICK_PICK_CATEGORIES,
  type LyricsProvider,
  type StreamingSource
} from '@shared/types'

// F29 · Metadatos visibles de cada fuente de streaming. El backend usa el id
// tal cual (con alias normalizados) — este mapa solo alimenta la UI.
const STREAMING_SOURCE_META: Record<string, { name: string; description: string }> = {
  YTMUSIC: {
    name: 'YouTube Music (WEB_REMIX)',
    description: 'YouTube Music web (WEB_REMIX). Cliente principal autenticado.'
  },
  IOS: {
    name: 'iOS',
    description: 'iOS. Fiable como fallback sin PoToken.'
  },
  ANDROID: {
    name: 'Android',
    description: 'Android. Alta calidad, ~2 MB sin PoToken propio.'
  },
  TV_EMBEDDED: {
    name: 'TV embed (TVHTML5)',
    description: 'TV embed. Cliente estable como último InnerTube.'
  },
  ANDROID_VR: {
    name: 'Android VR',
    description: 'Android VR. Experimental.'
  },
  WEB_CREATOR: {
    name: 'YouTube Studio (WEB_CREATOR)',
    description: 'YouTube Studio. Experimental.'
  },
  MWEB: {
    name: 'YouTube móvil web',
    description: 'Móvil web. Experimental.'
  }
}

function sourceMeta(id: string): { name: string; description: string } {
  return STREAMING_SOURCE_META[id] ?? { name: id, description: 'Cliente personalizado.' }
}

// F30 · Metadatos de los proveedores de letras. La lógica del backend recorre
// la cadena en orden; este mapa solo alimenta la UI.
const LYRICS_PROVIDER_META: Record<string, { name: string; description: string }> = {
  LRCLIB: {
    name: 'LRCLIB',
    description: 'LRCLIB. Letras sincronizadas comunitarias, gratis.'
  },
  KUGOU: {
    name: 'KuGou',
    description: 'KuGou. Sincronizadas por línea o por palabra (KRC).'
  },
  YTMUSIC: {
    name: 'YouTube Music',
    description: 'YouTube Music. Letra oficial no sincronizada.'
  }
}

function lyricsProviderMeta(id: string): { name: string; description: string } {
  return LYRICS_PROVIDER_META[id] ?? { name: id, description: 'Proveedor personalizado.' }
}

const EQ_PRESETS: Record<string, number[]> = {
  Plano: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  Bajos: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  Agudos: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6],
  Rock: [4, 3, 1, 0, -1, 0, 1, 3, 4, 4],
  Pop: [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2],
  Voz: [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1]
}

const ACCENTS: { name: string; value: string }[] = [
  { name: 'Metrolist', value: '#f43f4f' },
  { name: 'Verde', value: '#1ed760' },
  { name: 'Azul', value: '#3d91f4' },
  { name: 'Morado', value: '#b45cf0' },
  { name: 'Naranja', value: '#ff8a3d' },
  { name: 'Cian', value: '#2dd4bf' }
]

function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
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
      <span>{label}</span>
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
        Selecciones rápidas (chips que aparecen encima de las tarjetas grandes)
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {HOME_QUICK_PICK_CATEGORIES.map((cat) => {
          const on = active.has(cat.id)
          return (
            <label
              key={cat.id}
              className={`chip ${on ? 'active' : ''}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={(e) => toggle(cat.id, e.target.checked)}
                style={{ margin: 0 }}
              />
              <span aria-hidden="true">{cat.emoji}</span>
              <span>{cat.label}</span>
            </label>
          )
        })}
      </div>
      <div style={{ paddingTop: 8 }}>
        <button
          className="btn btn-secondary"
          onClick={() => void update({ homeQuickPicks: DEFAULT_HOME_QUICK_PICKS })}
        >
          Restaurar predeterminados
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
            arranged.push({ id, title: `(no detectada) ${id}` })
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
        Reordenar y ocultar estanterías
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" onClick={() => setOpen((v) => !v)}>
          {open ? 'Cerrar editor' : 'Ver últimas estanterías detectadas'}
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => void update({ homeShelvesOrder: [], homeHiddenShelves: [] })}
        >
          Restaurar orden natural
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
            <div style={{ padding: '8px 0', color: 'var(--text-subdued)' }}>Cargando…</div>
          )}
          {rows && rows.length === 0 && (
            <div style={{ padding: '8px 0', color: 'var(--text-subdued)' }}>
              Inicio no devolvió estanterías (¿sin sesión?).
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
                    Mostrar
                  </label>
                  <button
                    className="btn btn-secondary"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Subir"
                    title="Subir"
                    style={{ padding: '2px 8px' }}
                  >
                    ↑
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => move(i, 1)}
                    disabled={i === rows.length - 1}
                    aria-label="Bajar"
                    title="Bajar"
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

export function SettingsPage(): React.JSX.Element {
  const { settings, update } = useSettings()
  const auth = useAuth((s) => s.state)
  const [dirMsg, setDirMsg] = useState<string | null>(null)

  return (
    <div className="page" style={{ maxWidth: 780 }}>
      <h1>Ajustes</h1>

      <h2>Cuenta</h2>
      <Row label={auth.status === 'signedIn' ? 'Sesión iniciada' : 'Sin sesión'}>
        {auth.status === 'signedIn' && (
          <button className="btn btn-secondary" onClick={() => void window.api.auth.signOut()}>
            Cerrar sesión
          </button>
        )}
      </Row>

      <h2>Reproducción</h2>
      <Row label="Calidad de sonido">
        {(
          [
            ['auto', 'Auto'],
            ['high', 'Alta'],
            ['medium', 'Media'],
            ['low', 'Baja']
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={`chip ${settings.audioQuality === value ? 'active' : ''}`}
            onClick={() => void update({ audioQuality: value })}
          >
            {label}
          </button>
        ))}
      </Row>
      <Row label="Continuar con radio al acabar la cola (autoplay)">
        <input
          type="checkbox"
          checked={settings.autoplay}
          onChange={(e) => void update({ autoplay: e.target.checked })}
        />
      </Row>
      <Row label="Habilitar contenido similar (recomendaciones al final de la cola)">
        <input
          type="checkbox"
          checked={settings.enableSimilarContent}
          onChange={(e) => void update({ enableSimilarContent: e.target.checked })}
        />
      </Row>
      <Row label="Mezclar primero la lista, luego cargar similares">
        <input
          type="checkbox"
          checked={settings.shuffleFirstBeforeSimilar}
          onChange={(e) => void update({ shuffleFirstBeforeSimilar: e.target.checked })}
        />
      </Row>
      <Row label="Precargar más canciones al 80% del último tema">
        <input
          type="checkbox"
          checked={settings.preloadMoreAt80Percent}
          onChange={(e) => void update({ preloadMoreAt80Percent: e.target.checked })}
        />
      </Row>
      <Row label="No cargar automáticamente cuando repites todo">
        <input
          type="checkbox"
          checked={settings.disableAutoloadOnRepeatAll}
          onChange={(e) => void update({ disableAutoloadOnRepeatAll: e.target.checked })}
        />
      </Row>
      <Row label={`Crossfade entre pistas: ${settings.crossfadeSec} s`}>
        <input
          type="range"
          min={0}
          max={12}
          step={1}
          value={settings.crossfadeSec}
          onChange={(e) => void update({ crossfadeSec: Number(e.target.value) })}
        />
      </Row>
      <Row label="Desactivar crossfade en álbumes gapless">
        <input
          type="checkbox"
          checked={settings.disableCrossfadeOnGapless}
          onChange={(e) => void update({ disableCrossfadeOnGapless: e.target.checked })}
        />
      </Row>
      <Row label="Normalizar volumen entre pistas">
        <input
          type="checkbox"
          checked={settings.normalize}
          onChange={(e) => void update({ normalize: e.target.checked })}
        />
        {(
          [
            ['soft', 'Suave'],
            ['normal', 'Normal'],
            ['loud', 'Alto'],
            ['aggressive', 'Agresivo']
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={`chip ${settings.normalizeLevel === value ? 'active' : ''}`}
            onClick={() => void update({ normalizeLevel: value })}
            disabled={!settings.normalize}
          >
            {label}
          </button>
        ))}
      </Row>
      <Row label="Búsqueda progresiva (cada seek consecutivo suma 5 s)">
        <input
          type="checkbox"
          checked={settings.progressiveSeek}
          onChange={(e) => void update({ progressiveSeek: e.target.checked })}
        />
      </Row>
      <Row label="Evitar pistas duplicadas en la cola">
        <input
          type="checkbox"
          checked={settings.avoidDuplicatesInQueue}
          onChange={(e) => void update({ avoidDuplicatesInQueue: e.target.checked })}
        />
      </Row>
      <Row label="Saltar automáticamente si hay error de reproducción">
        <input
          type="checkbox"
          checked={settings.skipOnError}
          onChange={(e) => void update({ skipOnError: e.target.checked })}
        />
      </Row>
      <Row label="Recordar aleatorio y repetir entre sesiones">
        <input
          type="checkbox"
          checked={settings.rememberShuffleRepeat}
          onChange={(e) => void update({ rememberShuffleRepeat: e.target.checked })}
        />
      </Row>
      <Row label="Aleatorio persistente al iniciar nueva cola">
        <input
          type="checkbox"
          checked={settings.persistentShuffle}
          onChange={(e) => void update({ persistentShuffle: e.target.checked })}
        />
      </Row>
      <Row label="Descargar automáticamente al dar me gusta">
        <input
          type="checkbox"
          checked={settings.autoDownloadOnLike}
          onChange={(e) => void update({ autoDownloadOnLike: e.target.checked })}
        />
      </Row>
      <Row label={`Velocidad: ${settings.playbackRate.toFixed(2)}x`}>
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
      <Row label="Mantener tono al cambiar la velocidad">
        <input
          type="checkbox"
          checked={settings.preservePitch}
          onChange={(e) => void update({ preservePitch: e.target.checked })}
        />
      </Row>
      <Row label={`Duración del historial: ${settings.historyMaxEntries} entradas`}>
        <input
          type="range"
          min={100}
          max={5000}
          step={100}
          value={settings.historyMaxEntries}
          onChange={(e) => void update({ historyMaxEntries: Number(e.target.value) })}
        />
      </Row>

      <h2>Contenido</h2>
      <Row label="Ocultar contenido explícito">
        <input
          type="checkbox"
          checked={settings.hideExplicit}
          onChange={(e) => void update({ hideExplicit: e.target.checked })}
        />
      </Row>
      <Row label="Ocultar canciones de vídeo (videoclips)">
        <input
          type="checkbox"
          checked={settings.hideVideos}
          onChange={(e) => void update({ hideVideos: e.target.checked })}
        />
      </Row>
      <Row label="Ocultar YouTube Shorts (< 60 s)">
        <input
          type="checkbox"
          checked={settings.hideShorts}
          onChange={(e) => void update({ hideShorts: e.target.checked })}
        />
      </Row>
      <Row label="Idioma de contenido">
        <select
          value={settings.contentLanguage}
          onChange={(e) => void update({ contentLanguage: e.target.value })}
          style={{
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--divider)',
            borderRadius: 4,
            padding: '6px 10px'
          }}
        >
          <option value="auto">Automático (sistema)</option>
          <option value="es">Español</option>
          <option value="en">English</option>
          <option value="fr">Français</option>
          <option value="de">Deutsch</option>
          <option value="it">Italiano</option>
          <option value="pt">Português</option>
        </select>
      </Row>
      <Row label="País de contenido">
        <select
          value={settings.contentCountry}
          onChange={(e) => void update({ contentCountry: e.target.value })}
          style={{
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--divider)',
            borderRadius: 4,
            padding: '6px 10px'
          }}
        >
          <option value="auto">Automático (sistema)</option>
          <option value="ES">España</option>
          <option value="US">Estados Unidos</option>
          <option value="AR">Argentina</option>
          <option value="MX">México</option>
          <option value="CO">Colombia</option>
          <option value="CL">Chile</option>
          <option value="PE">Perú</option>
          <option value="UY">Uruguay</option>
          <option value="BR">Brasil</option>
          <option value="FR">Francia</option>
          <option value="DE">Alemania</option>
          <option value="IT">Italia</option>
          <option value="PT">Portugal</option>
          <option value="GB">Reino Unido</option>
        </select>
      </Row>
      <p style={{ color: 'var(--text-subdued)', fontSize: 12, padding: '4px 0 0' }}>
        Idioma y país afectan a las recomendaciones y a los resultados de búsqueda. Al cambiarlos
        la sesión de YouTube Music se reconstruye en caliente.
      </p>

      <h2>Fuentes de streaming</h2>
      <p style={{ color: 'var(--text-subdued)', fontSize: 12, padding: '0 0 8px' }}>
        Orden en el que el resolver probará cada cliente al pedir audio. Marca solo los que
        quieras usar y arrastra la prioridad con las flechas. Al cambiar cualquier ajuste la
        caché de URLs se limpia para que el próximo tema se resuelva con el orden nuevo.
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
                aria-label={`Activar ${meta.name}`}
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
                  aria-label={`Subir ${meta.name}`}
                  disabled={i === 0}
                  onClick={() => move(-1)}
                >
                  ↑
                </button>
                <button
                  className="chip"
                  aria-label={`Bajar ${meta.name}`}
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
      <Row label="Usar yt-dlp como último recurso">
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
          Restaurar predeterminados
        </button>
      </div>

      <h2>Letras</h2>
      <p style={{ color: 'var(--text-subdued)', fontSize: 12, padding: '0 0 8px' }}>
        Orden en el que se consultará cada proveedor de letras. El primero que devuelva algo
        con contenido gana. Marca solo los que quieras usar y ajusta la prioridad con las
        flechas.
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
                aria-label={`Activar ${meta.name}`}
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
                  aria-label={`Subir ${meta.name}`}
                  disabled={i === 0}
                  onClick={() => move(-1)}
                >
                  ↑
                </button>
                <button
                  className="chip"
                  aria-label={`Bajar ${meta.name}`}
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
      <Row label="Romanizar letras en japonés/coreano (ローマ字)">
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
          Restaurar predeterminados
        </button>
      </div>

      <h2>Estadísticas y Wrapped</h2>
      <p style={{ color: 'var(--text-subdued)', fontSize: 12, padding: '0 0 8px' }}>
        Las estadísticas se calculan solo desde tu historial local (SQLite). Nada sale de tu
        equipo. La página Recap se abre desde Inicio o navegando a Recap.
      </p>
      <Row label="Mostrar tarjeta Recap en Inicio">
        <input
          type="checkbox"
          checked={settings.showWrappedRecapCard}
          onChange={(e) => void update({ showWrappedRecapCard: e.target.checked })}
        />
      </Row>
      <Row label="Mostrar Top semanal en Inicio">
        <input
          type="checkbox"
          checked={settings.showTopWeekly}
          onChange={(e) => void update({ showTopWeekly: e.target.checked })}
        />
      </Row>
      <Row label="Mostrar Top mensual en Inicio">
        <input
          type="checkbox"
          checked={settings.showTopMonthly}
          onChange={(e) => void update({ showTopMonthly: e.target.checked })}
        />
      </Row>
      <Row label={`Longitud del Top: ${settings.wrappedTopN} canciones`}>
        <input
          type="range"
          min={10}
          max={200}
          step={10}
          value={settings.wrappedTopN}
          onChange={(e) => void update({ wrappedTopN: Number(e.target.value) })}
        />
      </Row>

      <h2>Personalizar Inicio</h2>
      <p style={{ color: 'var(--text-subdued)', fontSize: 12, padding: '0 0 8px' }}>
        Ajusta cómo se ve la pantalla de Inicio: barajar estanterías, elegir qué
        chips de selecciones rápidas aparecen arriba y reordenar u ocultar las
        estanterías que devuelve YouTube Music.
      </p>
      <Row label="Barajar estanterías al abrir Inicio">
        <input
          type="checkbox"
          checked={settings.homeShuffleShelves}
          onChange={(e) => void update({ homeShuffleShelves: e.target.checked })}
        />
      </Row>
      <HomeQuickPicksEditor />
      <HomeShelvesEditor />

      <h2>Página del Artista</h2>
      <Row label="Mostrar descripción del artista">
        <input
          type="checkbox"
          checked={settings.showArtistDescription}
          onChange={(e) => void update({ showArtistDescription: e.target.checked })}
        />
      </Row>
      <Row label="Mostrar número de suscriptores">
        <input
          type="checkbox"
          checked={settings.showArtistSubscribers}
          onChange={(e) => void update({ showArtistSubscribers: e.target.checked })}
        />
      </Row>
      <Row label="Mostrar oyentes mensuales (si el proveedor los expone)">
        <input
          type="checkbox"
          checked={settings.showArtistMonthlyListeners}
          onChange={(e) => void update({ showArtistMonthlyListeners: e.target.checked })}
        />
      </Row>

      <h2>Ecualizador</h2>
      <div className="sidebar-filters" style={{ padding: '4px 0 12px' }}>
        {Object.entries(EQ_PRESETS).map(([name, gains]) => (
          <button
            key={name}
            className={`chip ${JSON.stringify(settings.eqGains) === JSON.stringify(gains) ? 'active' : ''}`}
            onClick={() => void update({ eqGains: gains })}
          >
            {name}
          </button>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'flex-end',
          padding: '8px 0 4px',
          justifyContent: 'space-between',
          maxWidth: 640
        }}
      >
        {EQ_BANDS.map((freq, i) => (
          <div key={freq} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={settings.eqGains[i] ?? 0}
              onChange={(e) => {
                const eqGains = [...settings.eqGains]
                eqGains[i] = Number(e.target.value)
                void update({ eqGains })
              }}
              style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 110 }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {freq >= 1000 ? `${freq / 1000}k` : freq}
            </span>
          </div>
        ))}
      </div>
      <Row label={`Preamplificador: ${settings.preampDb > 0 ? '+' : ''}${settings.preampDb} dB`}>
        <input
          type="range"
          min={-12}
          max={12}
          step={1}
          value={settings.preampDb}
          onChange={(e) => void update({ preampDb: Number(e.target.value) })}
        />
      </Row>

      <h2>Descargas</h2>
      <Row label="Carpeta de descargas">
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
          {settings.downloadsDir || '(por defecto)'}
        </code>
        <button
          className="btn btn-secondary"
          style={{ padding: '8px 16px' }}
          onClick={() => {
            void window.api.settings.changeDownloadsDir().then((res) => {
              if (res) {
                void update({ downloadsDir: res.dir })
                setDirMsg(
                  res.moved > 0
                    ? `Carpeta cambiada. ${res.moved} canciones movidas.`
                    : 'Carpeta cambiada.'
                )
              }
            })
          }}
        >
          Cambiar…
        </button>
        <button
          className="btn btn-secondary"
          style={{ padding: '8px 16px' }}
          onClick={() => void window.api.settings.openDownloadsDir()}
        >
          Abrir
        </button>
      </Row>
      {dirMsg && <p style={{ color: 'var(--accent)', padding: '8px 0' }}>{dirMsg}</p>}
      <p style={{ color: 'var(--text-subdued)', fontSize: 12, padding: '4px 0 0' }}>
        Puedes elegir cualquier ubicación, incluido un disco duro externo. Las canciones ya
        descargadas se mueven automáticamente a la nueva carpeta.
      </p>

      <h2>Apariencia</h2>
      <Row label="Tema">
        {(
          [
            ['dark', 'Oscuro'],
            ['black', 'Negro'],
            ['light', 'Claro']
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={`chip ${settings.theme === value ? 'active' : ''}`}
            onClick={() => void update({ theme: value })}
          >
            {label}
          </button>
        ))}
      </Row>
      <Row label="Fondo de la aplicación">
        {(
          [
            ['off', 'Ninguno'],
            ['ambient', 'Ambiental'],
            ['reactive', 'Reactivo al audio']
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={`chip ${settings.bgMode === value ? 'active' : ''}`}
            onClick={() => void update({ bgMode: value })}
          >
            {label}
          </button>
        ))}
      </Row>
      <p style={{ color: 'var(--text-subdued)', fontSize: 12, padding: '4px 0 0' }}>
        «Ambiental» tiñe el fondo con los colores del álbum (reparto 60-30-10) y deriva
        suavemente. «Reactivo» además respira con el ritmo de la canción.
      </p>

      <Row label="Color de acento">
        <button
          className={`chip ${settings.accentMode === 'dynamic' ? 'active' : ''}`}
          title="El acento sigue la carátula de la canción en reproducción"
          onClick={() =>
            void update({ accentMode: settings.accentMode === 'dynamic' ? 'fixed' : 'dynamic' })
          }
        >
          ✨ Dinámico
        </button>
        {ACCENTS.map((a) => (
          <button
            key={a.value}
            title={a.name}
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
          title="Color personalizado"
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

      <h2>Integraciones</h2>
      <Row label="Discord Rich Presence (mostrar lo que escuchas en Discord)">
        <input
          type="checkbox"
          checked={settings.discordRpc}
          onChange={(e) => void update({ discordRpc: e.target.checked })}
        />
      </Row>
      <p style={{ color: 'var(--text-subdued)', fontSize: 12, padding: '4px 0 0' }}>
        Requiere tener la app de Discord abierta. Aparece como «Escuchando YouTube Music» con
        título, artista, carátula y progreso.
      </p>

      <h2>Sistema</h2>
      <Row label="Al cerrar la ventana, seguir en la bandeja del sistema">
        <input
          type="checkbox"
          checked={settings.closeToTray}
          onChange={(e) => void update({ closeToTray: e.target.checked })}
        />
      </Row>
      <Row label="Pausar al cambiar el dispositivo de audio (auriculares/altavoces)">
        <input
          type="checkbox"
          checked={settings.pauseOnAudioDeviceChange}
          onChange={(e) => void update({ pauseOnAudioDeviceChange: e.target.checked })}
        />
      </Row>
    </div>
  )
}
