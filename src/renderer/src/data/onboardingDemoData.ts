import type { ArtistRef, MediaCard, TrackSummary } from '@shared/types'
import type { ArtPalette } from '../app/palette'
import captureJson from './onboardingDemo.json'

/**
 * F61 · Dataset de muestra del onboarding.
 *
 * Contenido REAL de la cuenta del dueño de la app (playlist "Summer Feels",
 * 6-7 canciones de "Canciones que me gustan" y sus artistas), capturado UNA
 * sola vez con `scripts/capture-onboarding-data.mjs` y embebido como JSON +
 * carátulas locales en `assets/onboarding/covers/`. En tiempo de ejecución no
 * se toca la red ni la sesión: es una demo estática, aislada de la biblioteca
 * real (`libraryStore` ni la ve).
 *
 * Los tipos coinciden con los de `@shared/types` para poder pasar estos
 * objetos tal cual a componentes existentes (`Card`, `CoverLayer`…).
 *
 * Si `hasContent` es false (JSON aún vacío: captura pendiente), los pasos del
 * wizard degradan a su copy sin panel de demo — nunca datos inventados.
 */

interface CaptureTrack {
  kind: 'song' | 'video'
  videoId: string
  title: string
  artists: ArtistRef[]
  album: { name: string; id?: string } | null
  durationSec: number | null
  durationText: string | null
  coverFile: string | null
}

interface CaptureFile {
  capturedAt: string | null
  playlist: { id: string; title: string; trackCount: number; coverFile: string | null } | null
  summerTracks: CaptureTrack[]
  likedTracks: CaptureTrack[]
  artists: { id: string; name: string; coverFile: string | null }[]
  /**
   * Paletas 60-30-10 precomputadas en la captura (por nombre de fichero de
   * carátula). En producción el renderer carga por file:// y no puede leer
   * píxeles de assets locales en canvas (taint), así que el paso `ambient`
   * usa estas paletas ya cocinadas en lugar de extraerlas en caliente.
   */
  palettes?: Record<string, ArtPalette>
}

const capture = captureJson as unknown as CaptureFile

// Carátulas locales: Vite resuelve cada jpg a una URL empaquetada. Con la
// carpeta vacía (captura pendiente) el glob devuelve {} y todo degrada.
const covers = import.meta.glob('../assets/onboarding/covers/*.jpg', {
  eager: true,
  import: 'default'
}) as Record<string, string>

function coverUrl(file: string | null): string | undefined {
  if (!file) return undefined
  return covers[`../assets/onboarding/covers/${file}`]
}

function toTrack(t: CaptureTrack): TrackSummary {
  return {
    kind: t.kind,
    videoId: t.videoId,
    title: t.title,
    artists: t.artists,
    album: t.album ?? undefined,
    durationSec: t.durationSec ?? undefined,
    durationText: t.durationText ?? undefined,
    thumbnailUrl: coverUrl(t.coverFile)
  }
}

export interface OnboardingDemoData {
  /** ISO de la captura, o null si el dataset aún no se ha generado. */
  capturedAt: string | null
  /** Tarjeta de la playlist "Summer Feels" (kind 'playlist', carátula local). */
  playlist: MediaCard | null
  /** Pistas de "Summer Feels". */
  playlistTracks: TrackSummary[]
  /** 6-7 canciones de "Canciones que me gustan". */
  likedTracks: TrackSummary[]
  /** Artistas involucrados (kind 'artist', foto local). */
  artists: MediaCard[]
  /** true si hay algo que enseñar (captura hecha). */
  hasContent: boolean
}

const playlistTracks = capture.summerTracks.map(toTrack)
const likedTracks = capture.likedTracks.map(toTrack)

export const onboardingDemo: OnboardingDemoData = {
  capturedAt: capture.capturedAt,
  // subtitle se compone en el componente con i18n (`media.songCount`)
  playlist: capture.playlist
    ? {
        kind: 'playlist',
        id: capture.playlist.id,
        title: capture.playlist.title,
        thumbnailUrl: coverUrl(capture.playlist.coverFile)
      }
    : null,
  playlistTracks,
  likedTracks,
  artists: capture.artists.map((a) => ({
    kind: 'artist',
    id: a.id,
    title: a.name,
    thumbnailUrl: coverUrl(a.coverFile)
  })),
  hasContent: playlistTracks.length > 0 || likedTracks.length > 0
}

/** Carátulas (con imagen) listas para las demos de ambient/crossfade. */
export function demoCovers(): string[] {
  const urls: string[] = []
  for (const t of [...playlistTracks, ...likedTracks]) {
    if (t.thumbnailUrl && !urls.includes(t.thumbnailUrl)) urls.push(t.thumbnailUrl)
  }
  return urls
}

/**
 * Muestras para el paso `ambient`: carátula + paleta precomputada (si la
 * captura la trajo). `palette: null` indica que habría que extraerla en
 * caliente (solo funciona en dev; en prod el canvas local está tainted).
 */
export function demoAmbientSamples(): { cover: string; palette: ArtPalette | null }[] {
  const palettes = capture.palettes ?? {}
  const out: { cover: string; palette: ArtPalette | null }[] = []
  for (const t of [...capture.summerTracks, ...capture.likedTracks]) {
    const url = coverUrl(t.coverFile)
    if (!url || out.some((s) => s.cover === url)) continue
    out.push({ cover: url, palette: (t.coverFile && palettes[t.coverFile]) || null })
  }
  return out
}
