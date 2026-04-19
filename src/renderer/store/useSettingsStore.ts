import { create } from 'zustand';
import { AppSettings, DEFAULT_SETTINGS } from '../../common/types/settings';
import { applyTheme } from '../utils/theme';
import i18n from '../../common/i18n';

type ThemePreference = AppSettings['theme'];
type ResolvedTheme = 'light' | 'dark';

function resolveTheme(theme: ThemePreference): ResolvedTheme {
    if (theme === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
}

function applyResolvedTheme(theme: ThemePreference) {
    const resolvedTheme = resolveTheme(theme);
    if (resolvedTheme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.setAttribute('data-theme', 'light');
    }
    return resolvedTheme;
}

interface SettingsState {
    settings: AppSettings;
    resolvedTheme: ResolvedTheme;
    isLoading: boolean;

    // Actions
    loadSettings: () => Promise<void>;
    setTheme: (theme: ThemePreference) => Promise<void>;
    setAccentColor: (color: AppSettings['accentColor']) => Promise<void>;
    updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
    settings: DEFAULT_SETTINGS,
    resolvedTheme: resolveTheme(DEFAULT_SETTINGS.theme),
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

                // Merge shortcuts so new defaults are available
                const userShortcuts = data.shortcuts || {};
                // Migrate: if user still has old default Ctrl+K, upgrade to Ctrl+G
                if (userShortcuts['command_palette'] === 'Ctrl+K') {
                    userShortcuts['command_palette'] = 'Ctrl+G';
                }
                const mergedShortcuts = {
                    ...DEFAULT_SETTINGS.shortcuts,
                    ...userShortcuts,
                };

                const finalSettings = {
                    ...data,
                    llm: {
                        ...data.llm,
                        providers: mergedProviders
                    },
                    shortcuts: mergedShortcuts,
                };
                
                set({
                    settings: finalSettings,
                    resolvedTheme: resolveTheme(finalSettings.theme),
                    isLoading: false
                });

                // Apply visual effects
                applyTheme(finalSettings.accentColor);
                applyResolvedTheme(finalSettings.theme);

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
        set({
            settings: newSettings,
            resolvedTheme: resolveTheme(theme)
        });

        // Apply visual effects
        applyResolvedTheme(theme);

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

        set({
            settings: newSettings,
            resolvedTheme: resolveTheme(newSettings.theme)
        });

        if (partial.language && partial.language !== settings.language) {
            i18n.changeLanguage(partial.language);
        }

        if (partial.theme !== undefined) {
            applyResolvedTheme(newSettings.theme);
        }

        await window.electronAPI.system.saveSettings(newSettings);
    }
}));

if (typeof window !== 'undefined') {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
        const state = useSettingsStore.getState();
        if (state.settings.theme !== 'system') return;
        useSettingsStore.setState({ resolvedTheme: resolveTheme('system') });
        applyResolvedTheme('system');
    };

    if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', handleSystemThemeChange);
    } else if (typeof media.addListener === 'function') {
        media.addListener(handleSystemThemeChange);
    }
}

// 监听来自后台的设置变更推送 (例如 CronTool 创建了任务)
if (typeof window !== 'undefined' && window.electronAPI?.system?.onSettingsChanged) {
    window.electronAPI.system.onSettingsChanged((newSettings: AppSettings) => {
        console.log('[SettingsStore] Received background settings update');
        useSettingsStore.setState({
            settings: newSettings,
            resolvedTheme: resolveTheme(newSettings.theme)
        });

        // 同步应用视觉效果和语言
        if (newSettings.language) {
            i18n.changeLanguage(newSettings.language);
        }
        applyResolvedTheme(newSettings.theme);
    });
}
