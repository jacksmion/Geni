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
                // Merge new default providers that might not exist in the user's saved settings
                const mergedProviders = { 
                    ...DEFAULT_SETTINGS.llm.providers, 
                    ...data.llm.providers 
                };
                
                const finalSettings = {
                    ...data,
                    llm: {
                        ...data.llm,
                        providers: mergedProviders
                    }
                };
                
                set({ settings: finalSettings, isLoading: false });

                // Apply visual effects
                applyTheme(finalSettings.accentColor);
                if (finalSettings.theme === 'dark') {
                    document.documentElement.classList.add('dark');
                    document.documentElement.setAttribute('data-theme', 'dark');
                } else {
                    document.documentElement.classList.remove('dark');
                    document.documentElement.setAttribute('data-theme', 'light');
                }

                if (finalSettings.language) {
                    i18n.changeLanguage(finalSettings.language);
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

// 监听来自后台的设置变更推送 (例如 CronTool 创建了任务)
if (typeof window !== 'undefined' && window.electronAPI?.system?.onSettingsChanged) {
    window.electronAPI.system.onSettingsChanged((newSettings: AppSettings) => {
        console.log('[SettingsStore] Received background settings update');
        useSettingsStore.setState({ settings: newSettings });

        // 同步应用视觉效果和语言
        if (newSettings.language) {
            i18n.changeLanguage(newSettings.language);
        }
        if (newSettings.theme === 'dark') {
            document.documentElement.classList.add('dark');
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            document.documentElement.setAttribute('data-theme', 'light');
        }
    });
}
