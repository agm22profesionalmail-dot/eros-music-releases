import { safeStorage } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import type { Types } from 'youtubei.js'

type ICache = Types.ICache

/**
 * ICache para youtubei.js que cifra cada valor con safeStorage (DPAPI en Windows).
 * Aquí acaban los tokens OAuth y los datos de sesión: nunca tocan disco en claro.
 */
export class EncryptedCache implements ICache {
  cache_dir: string

  constructor(cacheDir: string) {
    this.cache_dir = cacheDir
  }

  #fileFor(key: string): string {
    // Los nombres de clave de youtubei.js son seguros, pero saneamos por si acaso
    const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_')
    return join(this.cache_dir, `${safe}.bin`)
  }

  async get(key: string): Promise<ArrayBuffer | undefined> {
    try {
      const raw = await fs.readFile(this.#fileFor(key))
      const decrypted = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(raw)
        : raw.toString('utf-8')
      const buf = Buffer.from(decrypted, 'base64')
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    } catch {
      return undefined
    }
  }

  async set(key: string, value: ArrayBuffer): Promise<void> {
    await fs.mkdir(this.cache_dir, { recursive: true })
    const b64 = Buffer.from(value).toString('base64')
    const data = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(b64)
      : Buffer.from(b64, 'utf-8')
    await fs.writeFile(this.#fileFor(key), data)
  }

  async remove(key: string): Promise<void> {
    try {
      await fs.unlink(this.#fileFor(key))
    } catch {
      /* no existe: nada que borrar */
    }
  }
}
