import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LayoutState {
    sidebarCollapsed: boolean;
    sidebarWidth: number;
    toggleSidebar: () => void;
    setSidebarCollapsed: (collapsed: boolean) => void;
    setSidebarWidth: (width: number) => void;
}

export const useLayoutStore = create<LayoutState>()(
    persist(
        (set) => ({
            sidebarCollapsed: false,
            sidebarWidth: 260,
            toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
            setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
            setSidebarWidth: (width) => set({ sidebarWidth: width }),
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
