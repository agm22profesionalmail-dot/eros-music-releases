import { useEffect, useRef, useState } from 'react'
import { useT } from '../app/i18n'
import { LoadingSpinner } from './LoadingSpinner'
import type { ImportTrackMatch, ImportProgress } from '@shared/types'

/**
 * Modal para importar playlists desde Spotify (URL) o desde archivo (M3U/CSV).
 * Matchea cada track contra YouTube Music y crea una playlist nueva con los
 * resultados encontrados.
 */

type Tab = 'spotify' | 'file'
type Phase = 'input' | 'matching' | 'results' | 'creating' | 'done'

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--divider)',
  borderRadius: 6,
  padding: '12px 14px',
  color: 'var(--text-primary)',
  fontSize: 15,
  outline: 'none',
  width: '100%'
}

function qualityIcon(quality: ImportTrackMatch['quality']): string {
  if (quality === 'exact') return '✅'
  if (quality === 'partial') return '⚠️'
  return '❌'
}

export function ImportPlaylistModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const t = useT()

  const [tab, setTab] = useState<Tab>('spotify')
  const [phase, setPhase] = useState<Phase>('input')
  const [spotifyUrl, setSpotifyUrl] = useState('')
  const [filePath, setFilePath] = useState<string | null>(null)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [matches, setMatches] = useState<ImportTrackMatch[]>([])
  const [playlistName, setPlaylistName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [createdName, setCreatedName] = useState('')
  const [createdCount, setCreatedCount] = useState(0)

  // El componente puede desmontarse mientras una promesa está en vuelo
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Progreso del matching — cleanup del listener al desmontar
  useEffect(() => {
    const cleanup = window.api.import.onProgress((p: ImportProgress) => {
      setProgress(p)
    })
    return cleanup
  }, [])

  // Escape cierra el modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const runImport = async (
    importer: () => Promise<{ name: string; matches: ImportTrackMatch[] }>
  ): Promise<void> => {
    setError(null)
    setProgress(null)
    setPhase('matching')
    try {
      const result = await importer()
      if (!mountedRef.current) return
      setMatches(result.matches)
      if (!playlistName) setPlaylistName(result.name)
      setPhase('results')
    } catch (err) {
      if (!mountedRef.current) return
      setError(err instanceof Error ? err.message : String(err))
      setPhase('input')
    }
  }

  const importSpotify = (): void => {
    const url = spotifyUrl.trim()
    if (!url) return
    void runImport(() => window.api.import.spotify(url))
  }

  const pickFile = async (): Promise<void> => {
    setError(null)
    try {
      const path = await window.api.import.fileDialog()
      if (!mountedRef.current) return
      if (path) setFilePath(path)
    } catch (err) {
      if (!mountedRef.current) return
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const importFile = (): void => {
    if (!filePath) return
    void runImport(() => window.api.import.file(filePath))
  }

  const foundMatches = matches.filter((m) => m.match !== null)

  const createPlaylist = async (): Promise<void> => {
    const name = playlistName.trim()
    if (!name || foundMatches.length === 0) return
    setError(null)
    setPhase('creating')
    try {
      await window.api.library.playlistCreate(
        name,
        foundMatches.map((m) => m.match!.videoId)
      )
      if (!mountedRef.current) return
      setCreatedName(name)
      setCreatedCount(foundMatches.length)
      setPhase('done')
    } catch (err) {
      if (!mountedRef.current) return
      setError(err instanceof Error ? err.message : String(err))
      setPhase('results')
    }
  }

  const fileName = filePath ? (filePath.split(/[\\/]/).pop() ?? filePath) : null
  const progressPct =
    progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 2000
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 520,
          maxWidth: 'calc(100vw - 48px)',
          maxHeight: 'calc(100vh - 96px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          background: 'var(--bg)',
          border: '1px solid var(--divider)',
          borderRadius: 12,
          padding: 28,
          textAlign: 'left'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h1 style={{ fontSize: 20, margin: 0, color: 'var(--text-primary)' }}>
          {t('import.title')}
        </h1>

        {/* Tabs — solo en la fase de entrada */}
        {phase === 'input' && (
          <div className="sidebar-filters" style={{ display: 'flex', gap: 8 }}>
            <button
              className={tab === 'spotify' ? 'chip active' : 'chip'}
              onClick={() => {
                setTab('spotify')
                setError(null)
              }}
            >
              {t('import.tabSpotify')}
            </button>
            <button
              className={tab === 'file' ? 'chip active' : 'chip'}
              onClick={() => {
                setTab('file')
                setError(null)
              }}
            >
              {t('import.tabFile')}
            </button>
          </div>
        )}

        {/* Fase: entrada */}
        {phase === 'input' && tab === 'spotify' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {t('import.spotifyUrl')}
            </label>
            <input
              value={spotifyUrl}
              placeholder={t('import.spotifyPlaceholder')}
              onChange={(e) => setSpotifyUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') importSpotify()
              }}
              style={inputStyle}
              autoFocus
            />
          </div>
        )}

        {phase === 'input' && tab === 'file' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                className="btn btn-secondary"
                style={{ padding: '10px 20px' }}
                onClick={() => void pickFile()}
              >
                {t('import.fileBtn')}
              </button>
              {fileName && (
                <span
                  style={{
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={filePath ?? undefined}
                >
                  {t('import.fileSelected', { name: fileName })}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Fase: matching en curso */}
        {phase === 'matching' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14,
              padding: '16px 0'
            }}
          >
            <LoadingSpinner
              size={64}
              label={t('import.matching', {
                current: progress?.current ?? 0,
                total: progress?.total ?? 0
              })}
            />
            <div style={{ width: '100%' }}>
              <div
                style={{
                  height: 4,
                  borderRadius: 2,
                  background: 'var(--bg-elevated)',
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${progressPct}%`,
                    background: 'var(--accent)',
                    borderRadius: 2,
                    transition: 'width 200ms ease'
                  }}
                />
              </div>
            </div>
            {progress?.matches?.length ? (
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--text-subdued)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%'
                }}
              >
                {progress.matches[progress.matches.length - 1]?.sourceTitle ?? ''}
              </span>
            ) : null}
          </div>
        )}

        {/* Fase: resultados */}
        {phase === 'results' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {t('import.summary', { found: foundMatches.length, total: matches.length })}
            </span>

            <div
              style={{
                overflowY: 'auto',
                maxHeight: 260,
                border: '1px solid var(--divider)',
                borderRadius: 8,
                background: 'var(--bg-elevated)'
              }}
            >
              {matches.length === 0 ? (
                <div
                  style={{
                    padding: 16,
                    fontSize: 13,
                    color: 'var(--text-subdued)',
                    textAlign: 'center'
                  }}
                >
                  {t('import.noMatches')}
                </div>
              ) : (
                matches.map((m, i) => (
                  <div
                    key={`${m.sourceTitle}-${i}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 12px',
                      borderBottom: i < matches.length - 1 ? '1px solid var(--divider)' : 'none'
                    }}
                  >
                    <span
                      style={{ fontSize: 14, flexShrink: 0 }}
                      title={
                        m.quality === 'exact'
                          ? t('import.matchExact')
                          : m.quality === 'partial'
                            ? t('import.matchPartial')
                            : t('import.matchNone')
                      }
                    >
                      {qualityIcon(m.quality)}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 13,
                          color:
                            m.quality === 'none'
                              ? 'var(--text-subdued)'
                              : 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {m.match ? m.match.title : m.sourceTitle}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-subdued)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {m.match ? m.match.artists.map((a) => a.name).join(', ') : m.sourceArtist}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {foundMatches.length === 0 ? (
              <span style={{ fontSize: 13, color: 'var(--error)' }}>{t('import.noMatches')}</span>
            ) : (
              <>
                <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {t('import.playlistName')}
                </label>
                <input
                  value={playlistName}
                  onChange={(e) => setPlaylistName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void createPlaylist()
                  }}
                  style={inputStyle}
                />
              </>
            )}
          </div>
        )}

        {/* Fase: creando — spinner mientras la playlist se crea en YT Music */}
        {phase === 'creating' && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
            <LoadingSpinner size={64} label={t('import.creating')} />
          </div>
        )}

        {/* Fase: éxito — previsualización de la playlist creada */}
        {phase === 'done' && (
          <div
            style={{
              display: 'flex',
              gap: 16,
              alignItems: 'center',
              padding: 16,
              background: 'var(--bg-elevated)',
              borderRadius: 10,
              border: '1px solid var(--divider)'
            }}
          >
            {/* Portada: mosaico de las 4 primeras carátulas o la primera si hay < 4 */}
            <div
              style={{
                flexShrink: 0,
                width: 80,
                height: 80,
                borderRadius: 6,
                overflow: 'hidden',
                display: 'grid',
                gridTemplateColumns: foundMatches.length >= 4 ? '1fr 1fr' : '1fr',
                gridTemplateRows: foundMatches.length >= 4 ? '1fr 1fr' : '1fr',
                background: 'var(--bg-card)',
                gap: 0
              }}
            >
              {(foundMatches.length >= 4
                ? foundMatches.slice(0, 4)
                : foundMatches.slice(0, 1)
              ).map((m, i) => (
                <img
                  key={i}
                  src={m.match?.thumbnailUrl ?? ''}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  draggable={false}
                />
              ))}
              {foundMatches.length === 0 && (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'var(--text-subdued)',
                    fontSize: 28
                  }}
                >
                  🎵
                </div>
              )}
            </div>
            {/* Info */}
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {createdName}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {t('import.previewTrackCount', { n: createdCount })}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-subdued)' }}>
                {t('import.previewCreatedBy')}
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p style={{ fontSize: 13, color: 'var(--error)', margin: 0, lineHeight: 1.4 }}>
            {t('import.error', { msg: error })}
          </p>
        )}

        {/* Pie de botones — siempre en la misma fila */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button className="btn btn-secondary" style={{ padding: '10px 20px' }} onClick={onClose}>
            {phase === 'done' ? t('btn.ok') : t('btn.cancel')}
          </button>
          {phase === 'input' && tab === 'spotify' && (
            <button
              className="btn btn-primary"
              style={{ padding: '10px 20px' }}
              disabled={!spotifyUrl.trim()}
              onClick={importSpotify}
            >
              {t('import.spotifyBtn')}
            </button>
          )}
          {phase === 'input' && tab === 'file' && (
            <button
              className="btn btn-primary"
              style={{ padding: '10px 20px' }}
              disabled={!filePath}
              onClick={importFile}
            >
              {t('import.spotifyBtn')}
            </button>
          )}
          {phase === 'results' && foundMatches.length > 0 && (
            <button
              className="btn btn-primary"
              style={{ padding: '10px 20px' }}
              disabled={!playlistName.trim()}
              onClick={() => void createPlaylist()}
            >
              {t('import.createBtn')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
