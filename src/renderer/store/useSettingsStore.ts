import { create } from 'zustand';
import { AppSettings, DEFAULT_SETTINGS } from '../../common/types/settings';
import { applyTheme } from '../utils/theme';
import i18n from '../../common/i18n';

interface SettingsState {
    settings: AppSettings;
    isLoading: boolean;

    // Actions
    loadSettings: () => Promise<void>;
    setTheme: (theme: 'light' | 'dark') => Promise<void>;
    setAccentColor: (color: AppSettings['accentColor']) => Promise<void>;
    updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
    settings: DEFAULT_SETTINGS,
    isLoading: true,

    loadSettings: async () => {
        try {
            const data = await window.electronAPI.system.getSettings();
            if (data) {
                set({ settings: data, isLoading: false });

                // Apply visual effects
                applyTheme(data.accentColor);
                if (data.theme === 'dark') {
                    document.documentElement.classList.add('dark');
                    document.documentElement.setAttribute('data-theme', 'dark');
                } else {
                    document.documentElement.classList.remove('dark');
                    document.documentElement.setAttribute('data-theme', 'light');
                }

                if (data.language) {
                    i18n.changeLanguage(data.language);
                }
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
            set({ isLoading: false });
        }
    },

    setTheme: async (theme) => {
        const { settings } = get();
        const newSettings = { ...settings, theme };

        // Optimistic update
        set({ settings: newSettings });

        // Apply visual effects
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            document.documentElement.setAttribute('data-theme', 'light');
        }

        // Persist
        await window.electronAPI.system.saveSettings(newSettings);
    },

    setAccentColor: async (color) => {
        const { settings } = get();
        const newSettings = { ...settings, accentColor: color };

        set({ settings: newSettings });
        applyTheme(color);

        await window.electronAPI.system.saveSettings(newSettings);
    },

    updateSettings: async (partial) => {
        const { settings } = get();
        const newSettings = { ...settings, ...partial };

        set({ settings: newSettings });

        if (partial.language && partial.language !== settings.language) {
            i18n.changeLanguage(partial.language);
        }

        await window.electronAPI.system.saveSettings(newSettings);
    }
}));
