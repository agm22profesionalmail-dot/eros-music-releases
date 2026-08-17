/**
 * Motor de audio del renderer.
 *
 * Dos <audio> alternantes (A/B) para gapless y crossfade, ambos colgando de
 * un único AudioContext con esta cadena por elemento:
 *
 *   MediaElementSource -> gain (xfade) ─┐
 *   MediaElementSource -> gain (xfade) ─┴-> preamp -> EQ x10 -> volumen -> destino
 *
 * El EQ son 10 BiquadFilter peaking (31 Hz … 16 kHz, como en la app Android original).
 * Tempo/pitch: playbackRate + preservesPitch del propio elemento.
 */

// F70 · Frecuencias centrales del ecualizador por modo
export const EQ_BANDS_10 = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const
export const EQ_BANDS_15 = [25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000] as const
export const EQ_BANDS_31 = [20, 25, 31, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000] as const
/** Alias retrocompatible (10 bandas originales). */
export const EQ_BANDS = EQ_BANDS_10

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

  /**
   * Carga y reproduce una URL (del proxy local).
   *
   * F45 · Crossfade robusto:
   * - Si el deck destino ya tiene precargada esta URL (`preloadNext`), se
   *   arranca inmediatamente. Si no, esperamos hasta `canplay` con timeout
   *   corto (1.5 s) antes de disparar el ramp de fade — así evitamos el
   *   caso "fade a silencio" cuando el `play()` del destino tarda y la
   *   canción origen ya está bajando su volumen.
   * - Si `play()` del destino falla o se agota el timeout, NO ejecutamos el
   *   fade y dejamos la canción actual intacta (el store la limpiará en
   *   'error' o simplemente seguirá sonando hasta 'ended').
   * - `from.fade.gain` se resetea a 1 antes del ramp: si un fade anterior
   *   había dejado el gain en 0.4 (interrupción), el nuevo ramp partiría de
   *   ahí y sería inaudible.
   */
  async load(url: string, opts?: { crossfadeFrom?: boolean; durationSec?: number }): Promise<void> {
    await this.#ctx.resume().catch(() => undefined)

    // F53 · `durationSec` permite un fundido corto en saltos MANUALES sin
    // tocar el ajuste global: si no viene, se usa crossfadeSec y el flujo
    // natural queda EXACTAMENTE igual que antes (blindado por la suite E2E).
    const xfadeSec = opts?.durationSec ?? this.#crossfadeSec
    const doCrossfade = Boolean(opts?.crossfadeFrom) && xfadeSec > 0
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

      // Si el deck destino ya tenía la URL precargada (via `preloadNext`)
      // NO reasignes src — así conservamos el buffer ya descargado y el
      // play() arranca al instante. Si es otra URL, asignamos ahora.
      // F47b · currentTime=0 SOLO si el src ya venía asignado (deck
      // precargado que ya sonó antes). Justo tras un `src = url` nuevo no
      // hay metadata todavía y setear currentTime deja el elemento en
      // estado indefinido y el play() nunca resuelve → "no carga".
      if (to.el.src !== url) {
        to.el.src = url
        to.el.load()
      } else {
        to.el.currentTime = 0
      }
      to.el.playbackRate = this.#rate
      ;(to.el as HTMLAudioElement & { preservesPitch: boolean }).preservesPitch =
        this.#preserves

      // F47b · Play inmediato. El deck destino viene precargado via
      // `preloadNext` (readyState suele estar en 3-4). Esperar demasiado a
      // `canplaythrough` o al evento `playing` bloquea el ramp — y para
      // entonces la pista actual ya llegó a `ended`, matando el solape.
      // El pequeño silencio inicial de <100 ms es inaudible durante el
      // fade-in que arranca en gain 0.
      try {
        await to.el.play()
      } catch (e) {
        this.#active = 1 - this.#active
        this.#emit('error', `crossfade abortado: ${String(e)}`)
        return
      }

      const now = this.#ctx.currentTime
      // F50 · La duración real del fade se acota al audio que le queda a la
      // pista saliente: si solo quedan 2.5 s (usuario arrastró la barra casi
      // al final), un ramp de 6 s dejaría media transición en silencio — la
      // saliente acaba antes de que el ramp termine. Con el clamp, el fundido
      // siempre se percibe completo aunque sea más corto.
      const fromRemaining =
        isFinite(from.el.duration) && from.el.duration > 0
          ? Math.max(0, from.el.duration - from.el.currentTime)
          : xfadeSec
      const dur = Math.max(0.4, Math.min(xfadeSec, fromRemaining))
      from.fade.gain.cancelScheduledValues(now)
      to.fade.gain.cancelScheduledValues(now)
      from.fade.gain.setValueAtTime(1, now)
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
      // F50 · Si hay un crossfade a medias (salto manual durante el fade),
      // los gains tienen ramps programados que PISAN una asignación directa
      // a .value — la nueva pista sonaría con el volumen subiendo desde
      // donde quedó el ramp. Cancelar la automatización antes de fijar.
      const nowCtx = this.#ctx.currentTime
      deck.fade.gain.cancelScheduledValues(nowCtx)
      other.fade.gain.cancelScheduledValues(nowCtx)
      deck.fade.gain.setValueAtTime(1, nowCtx)
      other.fade.gain.setValueAtTime(0, nowCtx)
      // F47b · Solo reasigna src si es distinto. Cuando reasignamos, hay que
      // llamar `load()` para forzar el buffering; y sólo si ya venía cargado
      // (precarga) reseteamos currentTime — hacerlo justo tras `src = ...`
      // sin metadata puede dejar el <audio> en estado indefinido.
      if (deck.el.src !== url) {
        deck.el.src = url
        deck.el.load()
      } else {
        deck.el.currentTime = 0
      }
      deck.el.playbackRate = this.#rate
      ;(deck.el as HTMLAudioElement & { preservesPitch: boolean }).preservesPitch =
        this.#preserves
      await deck.el.play().catch((e) => this.#emit('error', String(e)))
    }
  }

  /**
   * Precarga la siguiente pista en el deck inactivo (gapless + crossfade).
   *
   * F45 · Fuerza `load()` incluso si ya estaba asignado el mismo src — así
   * si el buffer se descartó (canción muy larga, el navegador libera datos
   * antiguos) volvemos a rellenar. También llamada a `preload = 'auto'`
   * para que Chromium priorice la descarga.
   *
   * F49 · CRÍTICO: si el deck inactivo tiene un `fadeCleanup` pendiente,
   * significa que aún está reproduciendo el fade-OUT del crossfade en
   * curso. Reasignar `.src` + `.load()` ahora lo pausaría a currentTime=0
   * a mitad del ramp del gain → resultado audible: SALTO SECO en vez de
   * fundido. Devolvemos sin tocar el deck; el store lo reintentará cuando
   * el fade termine (via preloadUpcoming diferido).
   */
  preloadNext(videoId: string, url: string): void {
    const deck = this.#inactiveDeck()
    if (this.#fadeCleanup.has(deck)) {
      // No marcar #preparedNext: hasPreloaded seguirá siendo false y
      // loadAndPlay usará la URL del mapa (preloadUrls) sin tocar decks.
      return
    }
    this.#preparedNext = { videoId, url }
    deck.el.preload = 'auto'
    if (deck.el.src !== url) {
      deck.el.src = url
    }
    deck.el.load()
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

  /**
   * F70 · Cambia el modo del ecualizador (10/15/31 bandas).
   * Recrea los BiquadFilterNodes y reconecta la cadena de audio.
   */
  setEqMode(mode: '10' | '15' | '31', gains?: number[]): void {
    const freqs = mode === '31' ? EQ_BANDS_31 : mode === '15' ? EQ_BANDS_15 : EQ_BANDS_10

    // Desconectar los filtros actuales de la cadena
    this.#preamp.disconnect()
    for (const f of this.#eq) f.disconnect()

    // Crear nuevos filtros
    this.#eq = freqs.map((freq, i) => {
      const f = this.#ctx.createBiquadFilter()
      if (i === 0) f.type = 'lowshelf'
      else if (i === freqs.length - 1) f.type = 'highshelf'
      else f.type = 'peaking'
      f.frequency.value = freq
      // Q más estrecho para más bandas (más resolución espectral)
      f.Q.value = mode === '31' ? 2.0 : mode === '15' ? 1.5 : 1.0
      f.gain.value = gains?.[i] ?? 0
      return f
    })

    // Reconectar: preamp -> eq[0] -> ... -> eq[N] -> compresor
    let node: AudioNode = this.#preamp
    for (const f of this.#eq) {
      node.connect(f)
      node = f
    }
    node.connect(this.#compressor)
  }

  /** F70 · Frecuencias activas del EQ actual. */
  get eqFrequencies(): readonly number[] {
    return this.#eq.map((f) => f.frequency.value)
  }

  /** F70 · Número de bandas activas. */
  get eqBandCount(): number {
    return this.#eq.length
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

/**
 * F28 · Escucha cambios en los dispositivos de audio de salida. Cuando el
 * dispositivo por defecto cambia (auriculares conectados/desconectados,
 * altavoces bluetooth desemparejados…) y el ajuste `pauseOnAudioDeviceChange`
 * está activo, pausamos el motor. Se enlaza una única vez desde este módulo
 * y consulta el ajuste vía lazy import para no crear un ciclo con el store.
 */
function installAudioDeviceChangeGuard(): void {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.addEventListener) return
  let lastDefault: string | null = null
  const readDefault = async (): Promise<string | null> => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices()
      const out = devs.find((d) => d.kind === 'audiooutput' && (d.deviceId === 'default' || d.deviceId === ''))
      return out?.groupId || out?.label || out?.deviceId || null
    } catch {
      return null
    }
  }
  void readDefault().then((id) => {
    lastDefault = id
  })
  navigator.mediaDevices.addEventListener('devicechange', () => {
    void (async () => {
      const now = await readDefault()
      const changed = now !== lastDefault
      lastDefault = now
      if (!changed) return
      // Lee el ajuste sin importar el store (rompería el ciclo). El bundle
      // expone la referencia bajo `__erosMusicSettingsStore` para F27.
      const w = window as unknown as {
        __erosMusicSettingsStore?: { useSettings: { getState: () => { settings: { pauseOnAudioDeviceChange?: boolean } } } }
      }
      const paused = engine.paused
      const shouldPause = Boolean(w.__erosMusicSettingsStore?.useSettings.getState().settings.pauseOnAudioDeviceChange)
      if (shouldPause && !paused) engine.pause()
    })()
  })
}

installAudioDeviceChangeGuard()
