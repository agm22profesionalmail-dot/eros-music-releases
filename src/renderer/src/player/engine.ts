/**
 * Motor de audio del renderer.
 *
 * Dos <audio> alternantes (A/B) para gapless y crossfade, ambos colgando de
 * un único AudioContext con esta cadena por elemento:
 *
 *   MediaElementSource -> gain (xfade) ─┐
 *   MediaElementSource -> gain (xfade) ─┴-> preamp -> EQ x10 -> volumen -> destino
 *
 * El EQ son 10 BiquadFilter peaking (31 Hz … 16 kHz, como Metrolist).
 * Tempo/pitch: playbackRate + preservesPitch del propio elemento.
 */

export const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const

export interface EngineEvents {
  timeupdate: (currentTime: number, duration: number) => void
  ended: () => void
  playing: () => void
  paused: () => void
  buffering: (isBuffering: boolean) => void
  error: (message: string) => void
}

type EventKey = keyof EngineEvents

interface Deck {
  el: HTMLAudioElement
  source: MediaElementAudioSourceNode
  fade: GainNode
}

export class PlayerEngine {
  #ctx: AudioContext
  #decks: [Deck, Deck]
  #active = 0
  #preamp: GainNode
  #eq: BiquadFilterNode[]
  /** F27 · Compresor opcional para la normalización. Siempre en la cadena;
   *  con normalize=false lo dejamos "transparente" (threshold 0, ratio 1). */
  #compressor: DynamicsCompressorNode
  #normalize = false
  #normalizeLevel: 'soft' | 'normal' | 'loud' | 'aggressive' = 'normal'
  #volume: GainNode
  #analyser: AnalyserNode
  #listeners = new Map<EventKey, Set<EngineEvents[EventKey]>>()
  #crossfadeSec = 0
  #preparedNext: { videoId: string; url: string } | null = null
  /** Timers de limpieza post-crossfade, por deck (para poder cancelarlos) */
  #fadeCleanup = new Map<Deck, number>()

  constructor() {
    this.#ctx = new AudioContext({ latencyHint: 'playback' })

    this.#preamp = this.#ctx.createGain()
    this.#eq = EQ_BANDS.map((freq, i) => {
      const f = this.#ctx.createBiquadFilter()
      if (i === 0) f.type = 'lowshelf'
      else if (i === EQ_BANDS.length - 1) f.type = 'highshelf'
      else f.type = 'peaking'
      f.frequency.value = freq
      f.Q.value = 1.0
      f.gain.value = 0
      return f
    })
    this.#compressor = this.#ctx.createDynamicsCompressor()
    // Estado "transparente": no altera el audio (0 dB reducción, ratio 1)
    this.#compressor.threshold.value = 0
    this.#compressor.ratio.value = 1
    this.#compressor.knee.value = 0
    this.#compressor.attack.value = 0.003
    this.#compressor.release.value = 0.25
    this.#volume = this.#ctx.createGain()
    this.#analyser = this.#ctx.createAnalyser()
    this.#analyser.fftSize = 256
    this.#analyser.smoothingTimeConstant = 0.8

    // preamp -> eq0 -> eq1 ... -> compresor(norm) -> volumen -> analyser -> salida
    let node: AudioNode = this.#preamp
    for (const f of this.#eq) {
      node.connect(f)
      node = f
    }
    node.connect(this.#compressor)
    this.#compressor.connect(this.#volume)
    this.#volume.connect(this.#analyser)
    this.#analyser.connect(this.#ctx.destination)

    this.#decks = [this.#makeDeck(), this.#makeDeck()]
    this.#decks[0].fade.gain.value = 1
    this.#decks[1].fade.gain.value = 0
  }

  #makeDeck(): Deck {
    const el = new Audio()
    el.crossOrigin = 'anonymous'
    el.preload = 'auto'
    // En el DOM (oculto) para que las pruebas E2E puedan observarlo
    el.hidden = true
    document.body.appendChild(el)
    const source = this.#ctx.createMediaElementSource(el)
    const fade = this.#ctx.createGain()
    source.connect(fade)
    fade.connect(this.#preamp)

    el.addEventListener('timeupdate', () => {
      if (el === this.#activeDeck().el) {
        this.#emit('timeupdate', el.currentTime, el.duration || 0)
      }
    })
    el.addEventListener('ended', () => {
      if (el === this.#activeDeck().el) this.#emit('ended')
    })
    el.addEventListener('playing', () => {
      if (el === this.#activeDeck().el) {
        this.#emit('buffering', false)
        this.#emit('playing')
      }
    })
    el.addEventListener('pause', () => {
      if (el === this.#activeDeck().el) this.#emit('paused')
    })
    el.addEventListener('waiting', () => {
      if (el === this.#activeDeck().el) this.#emit('buffering', true)
    })
    el.addEventListener('error', () => {
      if (el === this.#activeDeck().el && el.src) {
        this.#emit('error', `Error de audio (código ${el.error?.code ?? '?'})`)
      }
    })
    return { el, source, fade }
  }

  #activeDeck(): Deck {
    return this.#decks[this.#active]
  }

  #inactiveDeck(): Deck {
    return this.#decks[1 - this.#active]
  }

  #emit<K extends EventKey>(key: K, ...args: Parameters<EngineEvents[K]>): void {
    for (const fn of this.#listeners.get(key) ?? []) {
      ;(fn as (...a: unknown[]) => void)(...args)
    }
  }

  on<K extends EventKey>(key: K, fn: EngineEvents[K]): () => void {
    if (!this.#listeners.has(key)) this.#listeners.set(key, new Set())
    this.#listeners.get(key)!.add(fn)
    return () => this.#listeners.get(key)?.delete(fn)
  }

  /** Carga y reproduce una URL (del proxy local). */
  async load(url: string, opts?: { crossfadeFrom?: boolean }): Promise<void> {
    await this.#ctx.resume().catch(() => undefined)

    const doCrossfade = Boolean(opts?.crossfadeFrom) && this.#crossfadeSec > 0
    if (doCrossfade) {
      const from = this.#activeDeck()
      const to = this.#inactiveDeck()
      this.#active = 1 - this.#active

      // El deck destino puede tener una limpieza pendiente de un crossfade
      // anterior (doble "siguiente" rápido): cancélala o matará esta pista.
      const pending = this.#fadeCleanup.get(to)
      if (pending) {
        window.clearTimeout(pending)
        this.#fadeCleanup.delete(to)
      }

      to.el.src = url
      to.el.playbackRate = this.#rate
      ;(to.el as HTMLAudioElement & { preservesPitch: boolean }).preservesPitch =
        this.#preserves
      await to.el.play().catch((e) => this.#emit('error', String(e)))

      const now = this.#ctx.currentTime
      const dur = this.#crossfadeSec
      from.fade.gain.cancelScheduledValues(now)
      to.fade.gain.cancelScheduledValues(now)
      from.fade.gain.setValueAtTime(from.fade.gain.value, now)
      to.fade.gain.setValueAtTime(0, now)
      from.fade.gain.linearRampToValueAtTime(0, now + dur)
      to.fade.gain.linearRampToValueAtTime(1, now + dur)

      const timer = window.setTimeout(() => {
        this.#fadeCleanup.delete(from)
        // Si mientras tanto volvió a ser el deck activo, no lo toques
        if (this.#activeDeck() === from) return
        from.el.pause()
        from.el.removeAttribute('src')
        from.el.load()
      }, dur * 1000 + 100)
      this.#fadeCleanup.set(from, timer)
    } else {
      const deck = this.#activeDeck()
      const other = this.#inactiveDeck()
      other.el.pause()
      deck.fade.gain.value = 1
      other.fade.gain.value = 0
      deck.el.src = url
      deck.el.playbackRate = this.#rate
      ;(deck.el as HTMLAudioElement & { preservesPitch: boolean }).preservesPitch =
        this.#preserves
      await deck.el.play().catch((e) => this.#emit('error', String(e)))
    }
  }

  /** Precarga la siguiente pista en el deck inactivo (gapless). */
  preloadNext(videoId: string, url: string): void {
    this.#preparedNext = { videoId, url }
    const deck = this.#inactiveDeck()
    if (deck.el.src !== url) {
      deck.el.src = url
      deck.el.load()
    }
  }

  hasPreloaded(videoId: string): boolean {
    return this.#preparedNext?.videoId === videoId
  }

  play(): void {
    void this.#ctx.resume()
    void this.#activeDeck().el.play()
  }

  pause(): void {
    this.#activeDeck().el.pause()
  }

  get paused(): boolean {
    return this.#activeDeck().el.paused
  }

  seek(seconds: number): void {
    this.#activeDeck().el.currentTime = seconds
  }

  get currentTime(): number {
    return this.#activeDeck().el.currentTime
  }

  get duration(): number {
    return this.#activeDeck().el.duration || 0
  }

  // ---- Volumen / EQ / tempo ----

  setVolume(v: number): void {
    // curva perceptual (x^2) como hacen la mayoría de reproductores
    this.#volume.gain.value = Math.pow(Math.max(0, Math.min(1, v)), 2)
  }

  setPreamp(db: number): void {
    this.#preamp.gain.value = Math.pow(10, db / 20)
  }

  setEqBand(index: number, db: number): void {
    const f = this.#eq[index]
    if (f) f.gain.value = Math.max(-12, Math.min(12, db))
  }

  setEq(dbs: number[]): void {
    dbs.forEach((db, i) => this.setEqBand(i, db))
  }

  #rate = 1
  #preserves = true

  /** tempo: 0.25–4. pitchShift: true = mantener tono (tempo puro). */
  setPlaybackRate(rate: number, preservePitch: boolean): void {
    this.#rate = Math.max(0.25, Math.min(4, rate))
    this.#preserves = preservePitch
    for (const d of this.#decks) {
      d.el.playbackRate = this.#rate
      ;(d.el as HTMLAudioElement & { preservesPitch: boolean }).preservesPitch = preservePitch
    }
  }

  setCrossfade(seconds: number): void {
    this.#crossfadeSec = Math.max(0, Math.min(12, seconds))
  }

  /** F27 · lectura del crossfade en vigor (para decidir el fade en el store). */
  get crossfadeSec(): number {
    return this.#crossfadeSec
  }

  /**
   * F27 · Normalización dinámica. Al desactivarla el compresor vuelve a la
   * curva transparente. Al activarla mapeamos el "nivel" a un umbral y ratio
   * inspirado en el objetivo LUFS (aprox.):
   *   soft       -> target -18 LUFS → threshold −18 dB / ratio 2
   *   normal     -> target -14 LUFS → threshold −14 dB / ratio 3
   *   loud       -> target -10 LUFS → threshold −10 dB / ratio 4
   *   aggressive -> target  -7 LUFS → threshold  −7 dB / ratio 6
   */
  setNormalize(enabled: boolean, level: 'soft' | 'normal' | 'loud' | 'aggressive'): void {
    this.#normalize = enabled
    this.#normalizeLevel = level
    const c = this.#compressor
    if (!enabled) {
      c.threshold.value = 0
      c.ratio.value = 1
      c.knee.value = 0
      return
    }
    const map: Record<typeof level, { threshold: number; ratio: number }> = {
      soft: { threshold: -18, ratio: 2 },
      normal: { threshold: -14, ratio: 3 },
      loud: { threshold: -10, ratio: 4 },
      aggressive: { threshold: -7, ratio: 6 }
    }
    const { threshold, ratio } = map[level]
    c.threshold.value = threshold
    c.ratio.value = ratio
    c.knee.value = 6
  }

  get normalizeEnabled(): boolean {
    return this.#normalize
  }

  stop(): void {
    for (const d of this.#decks) {
      d.el.pause()
      d.el.removeAttribute('src')
      d.el.load()
    }
    this.#preparedNext = null
  }

  /** Espectro de frecuencias (0-255) para el visualizador. */
  getFrequencyData(target: Uint8Array): void {
    this.#analyser.getByteFrequencyData(target as Uint8Array<ArrayBuffer>)
  }

  get analyserBins(): number {
    return this.#analyser.frequencyBinCount
  }
}

export const engine = new PlayerEngine()
