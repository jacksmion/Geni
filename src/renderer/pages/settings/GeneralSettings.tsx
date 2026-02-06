import React from 'react';
import { Folder } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';

export function GeneralSettings() {
    const { settings, updateSettings } = useSettingsStore();

    const handleSelectDirectory = async () => {
        const path = await window.electronAPI.system.selectDirectory();
        if (path) {
            updateSettings({ workspacePath: path });
        }
    };

    return (
        <div className="max-w-2xl space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div>
                <h2 className="text-xl font-semibold text-slate-800 dark:text-gray-100 mb-1">常规设置</h2>
                <p className="text-sm text-slate-500 dark:text-gray-400">管理应用的外观和基本行为</p>
            </div>

            {/* Workspace */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-gray-300">
                    <Folder size={16} />
                    <h3>默认工作目录 (Workspace)</h3>
                </div>

                <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-2xl p-6 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                        <input
                            type="text"
                            readOnly
                            value={settings.workspacePath || ''}
                            placeholder="未选择目录..."
                            className="flex-1 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-600 dark:text-gray-300 focus:outline-none"
                        />
                        <button
                            onClick={handleSelectDirectory}
                            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-gray-200 text-sm font-medium rounded-xl transition-colors"
                        >
                            更改
                        </button>
                    </div>
                    <p className="text-xs text-slate-400 dark:text-gray-500">
                        Agent 将在此目录及其子目录中进行文件读写和搜索操作。
                    </p>
                </div>
            </section>
        </div>
    );
}
