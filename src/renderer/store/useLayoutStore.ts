import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LayoutState {
    sidebarCollapsed: boolean;
    sidebarWidth: number;
    paletteOpen: boolean;
    pendingCreatePlan: boolean;
    toggleSidebar: () => void;
    setSidebarCollapsed: (collapsed: boolean) => void;
    setSidebarWidth: (width: number) => void;
    setPaletteOpen: (open: boolean) => void;
    togglePalette: () => void;
    setPendingCreatePlan: (v: boolean) => void;
}

export const useLayoutStore = create<LayoutState>()(
    persist(
        (set) => ({
            sidebarCollapsed: false,
            sidebarWidth: 260,
            paletteOpen: false,
            pendingCreatePlan: false,
            toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
            setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
            setSidebarWidth: (width) => set({ sidebarWidth: width }),
            setPaletteOpen: (open) => set({ paletteOpen: open }),
            togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
            setPendingCreatePlan: (v) => set({ pendingCreatePlan: v }),
        }),
        {
            name: 'layout-storage',
            // Only persist sidebar width and collapse state
            partialize: (state) => ({
                sidebarCollapsed: state.sidebarCollapsed,
                sidebarWidth: state.sidebarWidth,
            }),
        }
    )
);
