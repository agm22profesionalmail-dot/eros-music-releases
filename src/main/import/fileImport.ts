/**
 * F71 · Importación de playlists desde archivo (M3U/CSV).
 *
 * M3U: extrae artista y título de las líneas `#EXTINF:duración,artista - título`.
 * CSV: busca columnas title/track/name y artist en la primera línea (headers).
 */
import { readFile } from 'fs/promises'
import { basename, extname } from 'path'

export interface FileTrack {
  title: string
  artist: string
  album?: string
}

/**
 * Parsea un fichero M3U/M3U8. Extrae artista y título de `#EXTINF`.
 * El nombre de la playlist viene del nombre del archivo.
 */
export async function parseM3U(filePath: string): Promise<{ name: string; tracks: FileTrack[] }> {
  const raw = await readFile(filePath, 'utf-8')
  const lines = raw.split(/\r?\n/)
  const tracks: FileTrack[] = []
  const name = basename(filePath, extname(filePath))

  for (const line of lines) {
    // #EXTINF:duración,display text
    const match = line.match(/^#EXTINF:\s*-?\d+\s*,\s*(.+)/)
    if (!match) continue
    const display = match[1].trim()

    // Intenta separar "Artista - Título" (lo más común en M3U)
    const sepMatch = display.match(/^(.+?)\s*[-–—]\s+(.+)$/)
    if (sepMatch) {
      tracks.push({ artist: sepMatch[1].trim(), title: sepMatch[2].trim() })
    } else {
      // Sin separador: todo es título, artista vacío
      tracks.push({ title: display, artist: '' })
    }
  }

  return { name, tracks }
}

/**
 * Parsea un fichero CSV. Busca las columnas por nombre en la primera línea
 * (case-insensitive). Nombres aceptados:
 * - title / track / name / song → título
 * - artist / artista → artista
 * - album / álbum → álbum
 */
export async function parseCSV(filePath: string): Promise<{ name: string; tracks: FileTrack[] }> {
  const raw = await readFile(filePath, 'utf-8')
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length < 2) throw new Error('CSV vacío o sin datos')

  const name = basename(filePath, extname(filePath))

  // Parsea la primera línea como headers
  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim())
  const titleIdx = headers.findIndex((h) => ['title', 'track', 'name', 'song', 'titulo', 'título'].includes(h))
  const artistIdx = headers.findIndex((h) => ['artist', 'artista', 'artists'].includes(h))
  const albumIdx = headers.findIndex((h) => ['album', 'álbum'].includes(h))

  if (titleIdx === -1) throw new Error('No se encontró la columna de título (title/track/name)')

  const tracks: FileTrack[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    const title = cols[titleIdx]?.trim()
    if (!title) continue
    tracks.push({
      title,
      artist: artistIdx >= 0 ? (cols[artistIdx]?.trim() ?? '') : '',
      album: albumIdx >= 0 ? (cols[albumIdx]?.trim() || undefined) : undefined
    })
  }

  return { name, tracks }
}

/** Parser básico de una línea CSV (respeta comillas dobles). */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++ // salta la siguiente comilla
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

/** Detecta el formato de un fichero por su extensión y lo parsea. */
export async function parsePlaylistFile(
  filePath: string
): Promise<{ name: string; tracks: FileTrack[] }> {
  const ext = extname(filePath).toLowerCase()
  switch (ext) {
    case '.m3u':
    case '.m3u8':
      return parseM3U(filePath)
    case '.csv':
      return parseCSV(filePath)
    default:
      throw new Error(`Formato no soportado: ${ext}`)
  }
}
