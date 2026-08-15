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
    </div>
  )
}
