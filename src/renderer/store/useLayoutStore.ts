import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SettingsSection } from '../pages/settings/settingsSections';

interface LayoutState {
    sidebarCollapsed: boolean;
    sidebarWidth: number;
    paletteOpen: boolean;
    pendingCreatePlan: boolean;
    activeSettingsSection: SettingsSection;
    toggleSidebar: () => void;
    setSidebarCollapsed: (collapsed: boolean) => void;
    setSidebarWidth: (width: number) => void;
    setPaletteOpen: (open: boolean) => void;
    togglePalette: () => void;
    setPendingCreatePlan: (v: boolean) => void;
    setActiveSettingsSection: (section: SettingsSection) => void;
}

export const useLayoutStore = create<LayoutState>()(
    persist(
        (set) => ({
            sidebarCollapsed: false,
            sidebarWidth: 260,
            paletteOpen: false,
            pendingCreatePlan: false,
            activeSettingsSection: 'models',
            toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
            setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
            setSidebarWidth: (width) => set({ sidebarWidth: width }),
            setPaletteOpen: (open) => set({ paletteOpen: open }),
            togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
            setPendingCreatePlan: (v) => set({ pendingCreatePlan: v }),
            setActiveSettingsSection: (section) => set({ activeSettingsSection: section }),
        }),
        {
            name: 'layout-storage',
            // Only persist sidebar width and collapse state
            partialize: (state) => ({
                sidebarCollapsed: state.sidebarCollapsed,
                sidebarWidth: state.sidebarWidth,
                activeSettingsSection: state.activeSettingsSection,
            }),
        }
    )
);
