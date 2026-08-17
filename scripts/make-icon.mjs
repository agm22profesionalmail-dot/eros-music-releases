/**
 * Genera los iconos de Windows de ERO'S Music a partir de assets/logo.svg.
 *
 * Salidas:
 *   - build/icon.png      (PNG 512px: el que usa electron-builder como win.icon)
 *   - build/icon-512.png  (copia del anterior, por si algún flujo lo espera)
 *   - build/icon-256.png  (PNG 256px)
 *   - build/icon.ico      (ICO con PNGs embebidos: 16, 24, 32, 48, 64, 128, 256)
 *   - assets/icon-256.png (PNG suelto de 256px: bandeja del sistema e icono de ventana)
 *
 * Ejecutar (desde cualquier cwd, es un main de Electron independiente):
 *   & F:\MetrolistPC\node_modules\electron\dist\electron.exe F:\MetrolistPC\scripts\make-icon.mjs
 */
import { app, BrowserWindow } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const SIZES = [...ICO_SIZES, 512]
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

app.disableHardwareAcceleration()

// Cinturón de seguridad: si algo se cuelga, salir con error en vez de quedarse vivo.
const watchdog = setTimeout(() => {
  console.error('make-icon: timeout de 60s, abortando')
  app.exit(2)
}, 60_000)

/** Rasteriza el SVG a PNG en cada tamaño usando <canvas> dentro de una ventana oculta. */
async function renderPngs(svgSource) {
  const win = new BrowserWindow({
    show: false,
    width: 320,
    height: 320,
    webPreferences: { offscreen: true }
  })
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><body>'))
    const svgUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgSource)
    const dataUrls = await win.webContents.executeJavaScript(`
      (async () => {
        const img = new Image()
        img.src = ${JSON.stringify(svgUri)}
        await img.decode()
        return ${JSON.stringify(SIZES)}.map((s) => {
          const c = document.createElement('canvas')
          c.width = s
          c.height = s
          // Chromium rasteriza el SVG vectorialmente al tamaño de destino: nítido en cada escala.
          c.getContext('2d').drawImage(img, 0, 0, s, s)
          return c.toDataURL('image/png')
        })
      })()
    `)
    return dataUrls.map((u) => Buffer.from(u.split(',')[1], 'base64'))
  } finally {
    win.destroy()
  }
}

/**
 * Empaqueta PNGs en un ICO "PNG-embedded":
 * ICONDIR (6 bytes) + ICONDIRENTRY (16 bytes por imagen) + blobs PNG concatenados.
 */
function buildIco(pngs, sizes) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reservado
  header.writeUInt16LE(1, 2) // tipo: 1 = icono
  header.writeUInt16LE(pngs.length, 4) // número de imágenes

  const entries = []
  let offset = 6 + 16 * pngs.length
  pngs.forEach((png, i) => {
    const size = sizes[i]
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0) // ancho (0 = 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1) // alto (0 = 256)
    e.writeUInt8(0, 2) // colores de paleta (0 = sin paleta)
    e.writeUInt8(0, 3) // reservado
    e.writeUInt16LE(1, 4) // planos de color
    e.writeUInt16LE(32, 6) // bits por píxel
    e.writeUInt32LE(png.length, 8) // bytes del blob
    e.writeUInt32LE(offset, 12) // offset del blob en el fichero
    entries.push(e)
    offset += png.length
  })
  return Buffer.concat([header, ...entries, ...pngs])
}

/** Relee y valida el ICO: magic, nº de entradas y firma PNG + dimensiones IHDR de cada blob. */
function verifyIco(file) {
  const buf = readFileSync(file)
  if (!(buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0)) {
    throw new Error('ICO inválido: magic incorrecto (esperado 00 00 01 00)')
  }
  const count = buf.readUInt16LE(4)
  const images = []
  for (let i = 0; i < count; i++) {
    const base = 6 + i * 16
    const bytes = buf.readUInt32LE(base + 8)
    const off = buf.readUInt32LE(base + 12)
    const blob = buf.subarray(off, off + bytes)
    if (!blob.subarray(0, 8).equals(PNG_SIG)) {
      throw new Error(`ICO inválido: la entrada ${i} no empieza con firma PNG`)
    }
    // IHDR es el primer chunk: ancho/alto big-endian en offsets 16 y 20 del PNG.
    images.push({ width: blob.readUInt32BE(16), height: blob.readUInt32BE(20), bytes })
  }
  return { totalBytes: buf.length, count, images }
}

app
  .whenReady()
  .then(async () => {
    const svg = readFileSync(join(ROOT, 'assets', 'logo.svg'), 'utf8')
    const pngs = await renderPngs(svg)

    mkdirSync(join(ROOT, 'build'), { recursive: true })
    mkdirSync(join(ROOT, 'assets'), { recursive: true })

    const icoPngs = ICO_SIZES.map((s) => pngs[SIZES.indexOf(s)])
    const icoPath = join(ROOT, 'build', 'icon.ico')
    writeFileSync(icoPath, buildIco(icoPngs, ICO_SIZES))

    const png512 = pngs[SIZES.indexOf(512)]
    const png256 = pngs[SIZES.indexOf(256)]
    const flat = [
      [join(ROOT, 'build', 'icon.png'), png512], // win.icon de electron-builder
      [join(ROOT, 'build', 'icon-512.png'), png512],
      [join(ROOT, 'build', 'icon-256.png'), png256],
      [join(ROOT, 'assets', 'icon-256.png'), png256]
    ]
    for (const [file, buf] of flat) writeFileSync(file, buf)

    const report = verifyIco(icoPath)
    console.log(`OK ${icoPath} (${report.totalBytes} bytes, ${report.count} imagenes)`)
    for (const img of report.images) {
      console.log(`  - ${img.width}x${img.height} PNG (${img.bytes} bytes)`)
    }
    if (report.count !== ICO_SIZES.length) {
      throw new Error(`Se esperaban ${ICO_SIZES.length} entradas y hay ${report.count}`)
    }
    for (const [file, buf] of flat) console.log(`OK ${file} (${buf.length} bytes)`)

    clearTimeout(watchdog)
    app.quit()
  })
  .catch((err) => {
    console.error('make-icon: fallo:', err)
    app.exit(1)
  })
