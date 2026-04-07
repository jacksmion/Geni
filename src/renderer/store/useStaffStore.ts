import { create } from 'zustand'
import { StaffProfile } from '../../common/types/staff'

interface StaffState {
    profiles: StaffProfile[]
    loading: boolean
    editingId: string | null       // 当前编辑中的 Profile ID (null = 列表视图)

    loadProfiles: () => Promise<void>
    createProfile: (input: Partial<StaffProfile> & { name: string; persona: string }) => Promise<StaffProfile | null>
    updateProfile: (id: string, updates: Partial<StaffProfile>) => Promise<void>
    deleteProfile: (id: string) => Promise<void>
    setEditingId: (id: string | null) => void
}

export const useStaffStore = create<StaffState>((set, get) => ({
    profiles: [],
    loading: false,
    editingId: null,

    loadProfiles: async () => {
        set({ loading: true })
        try {
            const list = await window.electronAPI.staff.list()
            // list 返回的是 StaffMeta，需要完整加载每个
            const fullProfiles: StaffProfile[] = []
            for (const meta of list) {
                const profile = await window.electronAPI.staff.get(meta.id)
                if (profile) fullProfiles.push(profile)
            }
            set({ profiles: fullProfiles })
        } catch (e) {
            console.error('[StaffStore] Failed to load profiles:', e)
        } finally {
            set({ loading: false })
        }
    },

    createProfile: async (input) => {
        try {
            const profile = await window.electronAPI.staff.create(input)
            set(s => ({ profiles: [...s.profiles, profile] }))
            return profile
        } catch (e) {
            console.error('[StaffStore] Failed to create profile:', e)
            return null
        }
    },

    updateProfile: async (id, updates) => {
        try {
            const updated = await window.electronAPI.staff.update(id, updates)
            if (updated) {
                set(s => ({
                    profiles: s.profiles.map(p => p.id === id ? updated : p)
                }))
            }
        } catch (e) {
            console.error('[StaffStore] Failed to update profile:', e)
        }
    },

    deleteProfile: async (id) => {
        try {
            await window.electronAPI.staff.delete(id)
            set(s => ({
                profiles: s.profiles.filter(p => p.id !== id),
                editingId: s.editingId === id ? null : s.editingId
            }))
        } catch (e) {
            console.error('[StaffStore] Failed to delete profile:', e)
        }
    },

    setEditingId: (id) => set({ editingId: id }),
}))
