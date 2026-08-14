import { create } from 'zustand'
import type { QueueItem, TrackSummary } from '@shared/types'
import { engine } from './engine'

/**
 * Estado global de reproducción: cola, pista actual, controles.
 * El motor (engine.ts) hace el audio; aquí vive la lógica de cola.
 */

export type RepeatMode = 'off' | 'all' | 'one'

interface PlayerState {
  queue: QueueItem[]
  index: number
  isPlaying: boolean
  isBuffering: boolean
  currentTime: number
  duration: number
  volume: number
  repeat: RepeatMode
  shuffle: boolean
  /** Pistas del orden original cuando shuffle está activo */
  originalQueue: QueueItem[] | null
  error: string | null

  current: () => QueueItem | null
  playTracks: (tracks: TrackSummary[], startIndex?: number) => Promise<void>
  playNow: (track: TrackSummary) => Promise<void>
  enqueueNext: (track: TrackSummary) => void
  enqueueLast: (tracks: TrackSummary[]) => void
  removeFromQueue: (queueId: string) => void
  moveInQueue: (fromIdx: number, toIdx: number) => void
  next: () => Promise<void>
  previous: () => Promise<void>
  togglePlay: () => void
  seek: (seconds: number) => void
  setVolume: (v: number) => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  clearQueue: () => void
}

let queueCounter = 0
function toQueueItem(t: TrackSummary): QueueItem {
  return { ...t, queueId: `q${++queueCounter}` }
}

async function loadAndPlay(item: QueueItem, crossfade: boolean): Promise<void> {
  const prepared = engine.hasPreloaded(item.videoId)
    ? null
    : await window.api.player.prepare(item.videoId)
  const url = prepared?.url ?? preloadUrls.get(item.videoId)
  if (!url) throw new Error('Sin URL de stream')
  await engine.load(url, { crossfadeFrom: crossfade })
}

const preloadUrls = new Map<string, string>()

async function preloadUpcoming(state: Pick<PlayerState, 'queue' | 'index'>): Promise<void> {
  const nextItem = state.queue[state.index + 1]
  if (!nextItem || engine.hasPreloaded(nextItem.videoId)) return
  try {
    const prepared = await window.api.player.prepare(nextItem.videoId)
    preloadUrls.set(nextItem.videoId, prepared.url)
    engine.preloadNext(nextItem.videoId, prepared.url)
  } catch {
    /* la precarga es mejor-esfuerzo */
  }
}

export const usePlayer = create<PlayerState>((set, get) => {
  // Cableado de eventos del motor -> store (una sola vez)
  engine.on('timeupdate', (currentTime, duration) => {
    set({ currentTime, duration })
  })
  engine.on('playing', () => set({ isPlaying: true, isBuffering: false, error: null }))
  engine.on('paused', () => set({ isPlaying: false }))
  engine.on('buffering', (isBuffering) => set({ isBuffering }))
  engine.on('error', (message) => set({ error: message, isPlaying: false }))
  engine.on('ended', () => {
    void get().next()
  })

  return {
    queue: [],
    index: -1,
    isPlaying: false,
    isBuffering: false,
    currentTime: 0,
    duration: 0,
    volume: 0.8,
    repeat: 'off',
    shuffle: false,
    originalQueue: null,
    error: null,

    current: () => {
      const { queue, index } = get()
      return index >= 0 && index < queue.length ? queue[index] : null
    },

    playTracks: async (tracks, startIndex = 0) => {
      if (!tracks.length) return
      const queue = tracks.map(toQueueItem)
      set({ queue, index: startIndex, originalQueue: null, shuffle: false, error: null })
      set({ isBuffering: true })
      try {
        await loadAndPlay(queue[startIndex], false)
        void preloadUpcoming({ queue, index: startIndex })
      } catch (err) {
        set({ error: String((err as Error)?.message ?? err), isBuffering: false })
      }
    },

    playNow: async (track) => {
      await get().playTracks([track], 0)
    },

    enqueueNext: (track) => {
      const { queue, index } = get()
      const copy = [...queue]
      copy.splice(index + 1, 0, toQueueItem(track))
      set({ queue: copy })
    },

    enqueueLast: (tracks) => {
      set({ queue: [...get().queue, ...tracks.map(toQueueItem)] })
    },

    removeFromQueue: (queueId) => {
      const { queue, index } = get()
      const idx = queue.findIndex((q) => q.queueId === queueId)
      if (idx === -1 || idx === index) return
      const copy = queue.filter((q) => q.queueId !== queueId)
      set({ queue: copy, index: idx < index ? index - 1 : index })
    },

    moveInQueue: (fromIdx, toIdx) => {
      const { queue, index } = get()
      if (fromIdx === index || toIdx === index) return
      const copy = [...queue]
      const [item] = copy.splice(fromIdx, 1)
      copy.splice(toIdx, 0, item)
      let newIndex = index
      if (fromIdx < index && toIdx >= index) newIndex--
      else if (fromIdx > index && toIdx <= index) newIndex++
      set({ queue: copy, index: newIndex })
    },

    next: async () => {
      const { queue, index, repeat } = get()
      if (repeat === 'one' && index >= 0) {
        engine.seek(0)
        engine.play()
        return
      }
      let nextIndex = index + 1
      if (nextIndex >= queue.length) {
        if (repeat === 'all' && queue.length) nextIndex = 0
        else {
          set({ isPlaying: false })
          return
        }
      }
      set({ index: nextIndex, isBuffering: true, currentTime: 0 })
      try {
        await loadAndPlay(queue[nextIndex], true)
        void preloadUpcoming({ queue, index: nextIndex })
      } catch (err) {
        set({ error: String((err as Error)?.message ?? err), isBuffering: false })
      }
    },

    previous: async () => {
      const { queue, index } = get()
      // Con >3 s reproducidos, "anterior" reinicia la pista (como Spotify)
      if (engine.currentTime > 3 || index <= 0) {
        engine.seek(0)
        return
      }
      const prevIndex = index - 1
      set({ index: prevIndex, isBuffering: true, currentTime: 0 })
      try {
        await loadAndPlay(queue[prevIndex], false)
        void preloadUpcoming({ queue, index: prevIndex })
      } catch (err) {
        set({ error: String((err as Error)?.message ?? err), isBuffering: false })
      }
    },

    togglePlay: () => {
      if (get().index < 0) return
      if (engine.paused) engine.play()
      else engine.pause()
    },

    seek: (seconds) => {
      engine.seek(seconds)
      set({ currentTime: seconds })
    },

    setVolume: (v) => {
      engine.setVolume(v)
      set({ volume: v })
    },

    toggleShuffle: () => {
      const { shuffle, queue, index, originalQueue } = get()
      if (!shuffle) {
        const current = queue[index]
        const rest = queue.filter((_, i) => i !== index)
        for (let i = rest.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[rest[i], rest[j]] = [rest[j], rest[i]]
        }
        set({
          shuffle: true,
          originalQueue: queue,
          queue: current ? [current, ...rest] : rest,
          index: current ? 0 : -1
        })
      } else {
        const current = queue[index]
        const restored = originalQueue ?? queue
        const newIndex = current
          ? restored.findIndex((q) => q.queueId === current.queueId)
          : -1
        set({ shuffle: false, originalQueue: null, queue: restored, index: newIndex })
      }
    },

    cycleRepeat: () => {
      const order: RepeatMode[] = ['off', 'all', 'one']
      const next = order[(order.indexOf(get().repeat) + 1) % order.length]
      set({ repeat: next })
    },

    clearQueue: () => {
      engine.stop()
      set({ queue: [], index: -1, isPlaying: false, currentTime: 0, duration: 0 })
    }
  }
})
