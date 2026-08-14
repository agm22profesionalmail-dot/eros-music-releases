import { useState } from 'react'
import { useSettings } from '../app/settingsStore'
import { useAuth } from '../app/authStore'
import { EQ_BANDS } from '../player/engine'

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
      <Row label="Continuar con radio al acabar la cola (autoplay)">
        <input
          type="checkbox"
          checked={settings.autoplay}
          onChange={(e) => void update({ autoplay: e.target.checked })}
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
      <Row label="Color de acento">
        {ACCENTS.map((a) => (
          <button
            key={a.value}
            title={a.name}
            onClick={() => void update({ accent: a.value })}
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: a.value,
              border:
                settings.accent === a.value ? '3px solid var(--text-primary)' : '3px solid transparent'
            }}
          />
        ))}
      </Row>

      <h2>Sistema</h2>
      <Row label="Al cerrar la ventana, seguir en la bandeja del sistema">
        <input
          type="checkbox"
          checked={settings.closeToTray}
          onChange={(e) => void update({ closeToTray: e.target.checked })}
        />
      </Row>
    </div>
  )
}
