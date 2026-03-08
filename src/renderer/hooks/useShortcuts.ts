import { useEffect } from 'react';
import { useChatStore } from '../store/useChatStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useLayoutStore } from '../store/useLayoutStore';

/**
 * Hook to manage global keyboard shortcuts based on app settings
 */
export const useShortcuts = () => {
    const createSession = useChatStore(s => s.createSession);
    const setActiveTab = useChatStore(s => s.setActiveTab);
    const shortcuts = useSettingsStore(s => s.settings.shortcuts);
    const toggleSidebar = useLayoutStore(s => s.toggleSidebar);
    const setSearchFocused = useLayoutStore(s => s.setSearchFocused);

    useEffect(() => {
        if (!shortcuts) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Helper to normalize the current key combo
            const getCombo = (e: KeyboardEvent) => {
                const keys: string[] = [];
                if (e.ctrlKey) keys.push('Ctrl');
                if (e.shiftKey) keys.push('Shift');
                if (e.altKey) keys.push('Alt');
                if (e.metaKey) keys.push('Meta');
                
                // Only add non-modifier keys
                if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
                    let key = e.key.toUpperCase();
                    if (key === ' ') key = 'Space';
                    // We handle punctuation or other special chars by keeping them as is via e.key
                    // If toUpperCase doesn't change it (like ,), it stays same
                    keys.push(key);
                }
                return keys.join('+');
            };

            const currentCombo = getCombo(e);

            // 1. New Task
            if (currentCombo === shortcuts['new_task']) {
                e.preventDefault();
                createSession();
                setActiveTab('chat');
            } 
            // 2. Search Task
            else if (currentCombo === shortcuts['search_task']) {
                e.preventDefault();
                setSearchFocused(true);
            } 
            // 3. Open Settings
            else if (currentCombo === shortcuts['open_settings']) {
                e.preventDefault();
                setActiveTab('settings');
            } 
            // 4. Toggle Sidebar
            else if (currentCombo === shortcuts['toggle_sidebar']) {
                e.preventDefault();
                toggleSidebar();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [shortcuts, createSession, setActiveTab, toggleSidebar, setSearchFocused]);
};
