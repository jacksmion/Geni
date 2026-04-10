import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LayoutState {
    sidebarCollapsed: boolean;
    sidebarWidth: number;
    searchFocused: boolean;
    paletteOpen: boolean;
    toggleSidebar: () => void;
    setSidebarCollapsed: (collapsed: boolean) => void;
    setSidebarWidth: (width: number) => void;
    setSearchFocused: (focused: boolean) => void;
    setPaletteOpen: (open: boolean) => void;
    togglePalette: () => void;
}

export const useLayoutStore = create<LayoutState>()(
    persist(
        (set) => ({
            sidebarCollapsed: false,
            sidebarWidth: 260,
            searchFocused: false,
            paletteOpen: false,
            toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
            setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
            setSidebarWidth: (width) => set({ sidebarWidth: width }),
            setSearchFocused: (focused) => set({ searchFocused: focused }),
            setPaletteOpen: (open) => set({ paletteOpen: open }),
            togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
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
