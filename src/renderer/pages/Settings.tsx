import React from 'react';
import { useTranslation } from 'react-i18next';
import { GeneralSettings } from './settings/GeneralSettings';
import { ModelSettings } from './settings/ModelSettings';
import { McpSettings } from './settings/McpSettings';
import { CoreToolSettings } from './settings/CoreToolSettings';
import { PersonaSettings } from './settings/PersonaSettings';
import { ImSettings } from './settings/ImSettings';
import { ShortcutSettings } from './settings/ShortcutSettings';
import { UsageSettings } from './settings/UsageSettings';
import { useLayoutStore } from '../store/useLayoutStore';
import { SETTINGS_SECTIONS } from './settings/settingsSections';

export default function Settings() {
    const { t } = useTranslation();
    const activeSection = useLayoutStore(s => s.activeSettingsSection);
    const activeSectionConfig = SETTINGS_SECTIONS.find(section => section.id === activeSection);

    return (
        <div className="flex h-full flex-col overflow-hidden bg-white dark:bg-[#141414]">
            <header className="h-10 flex items-center justify-between px-4 draggable shrink-0 z-10 bg-white dark:bg-[#141414] border-b border-slate-100 dark:border-white/[0.05]">
                <div className="flex items-center gap-3">
                    <h1 className="text-sm font-semibold text-slate-800 dark:text-gray-100">
                        {activeSectionConfig ? t(activeSectionConfig.labelKey) : t('settings.title')}
                    </h1>
                </div>
                <div className="w-32" />
            </header>

            <div className="flex-1 overflow-y-auto p-8">
                {activeSection === 'general' && <GeneralSettings />}

                {activeSection === 'models' && (
                    <div className="h-full">
                        <ModelSettings />
                    </div>
                )}

                {activeSection === 'persona' && <PersonaSettings />}

                {activeSection === 'mcp' && <McpSettings />}

                {activeSection === 'tools' && <CoreToolSettings />}

                {activeSection === 'im' && <ImSettings />}

                {activeSection === 'shortcuts' && <ShortcutSettings />}

                {activeSection === 'usage' && <UsageSettings />}

                {activeSection === 'about' && (
                    <div className="max-w-2xl text-center pt-20 space-y-4">
                        <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl mx-auto shadow-xl flex items-center justify-center text-white text-3xl font-bold">
                            G
                        </div>
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Geni</h2>
                        <p className="text-slate-500 dark:text-gray-400">{t('settings.about.slogan')}</p>

                        <div className="pt-8 text-xs text-slate-400">
                            © 2026 Geni Inc.
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
