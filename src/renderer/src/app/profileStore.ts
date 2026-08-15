import { create } from 'zustand'
import { DEFAULT_PROFILE, type UserProfile } from '@shared/types'

/**
 * Estado global del perfil personalizado del usuario (F20).
 *
 * Se hidrata del main al arrancar, se persiste vía IPC en cada `update`,
 * y se suscribe al evento `profile:changed` para reflejar cambios hechos
 * desde otras ventanas (ej. la mini) sin recargar.
 */

interface ProfileState {
  profile: UserProfile
  loaded: boolean
  init: () => Promise<void>
  update: (patch: Partial<UserProfile>) => Promise<void>
}

export const useProfile = create<ProfileState>((set, get) => ({
  profile: DEFAULT_PROFILE,
  loaded: false,

  init: async () => {
    try {
      const profile = await window.api.profile.get()
      set({ profile, loaded: true })
    } catch {
      set({ loaded: true })
    }
    // Sincroniza con otros procesos que también toquen el perfil
    window.api.profile.onChanged((p) => {
      const same = JSON.stringify(p) === JSON.stringify(get().profile)
      if (same) return
      set({ profile: p })
    })
  },

  update: async (patch) => {
    const merged: UserProfile = { ...get().profile, ...patch }
    // Optimista: refresca UI antes de persistir para que la escritura no bloquee
    set({ profile: merged })
    try {
      const stored = await window.api.profile.set(patch)
      // El main puede haber recortado/normalizado (bio/name): adopta su versión
      if (JSON.stringify(stored) !== JSON.stringify(merged)) set({ profile: stored })
    } catch {
      /* si falla, la próxima carga corrige */
    }
  }
}))
