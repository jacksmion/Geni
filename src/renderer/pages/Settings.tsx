import React, { useState } from 'react';
import { Settings as SettingsIcon, Info, Globe, Database, Layout, ToyBrick, Box as BoxIcon, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { GeneralSettings } from './settings/GeneralSettings';
import { ModelSettings } from './settings/ModelSettings';
import { McpSettings } from './settings/McpSettings';
import { CoreToolSettings } from './settings/CoreToolSettings';
import { PersonaSettings } from './settings/PersonaSettings';

type SettingsSection = 'general' | 'models' | 'persona' | 'mcp' | 'tools' | 'about';

export default function Settings() {
    const [activeSection, setActiveSection] = useState<SettingsSection>('models');

    const sections = [
        { id: 'general', label: '常规设置', icon: Layout },
        { id: 'models', label: '模型配置', icon: Globe },
        { id: 'persona', label: '个性化', icon: Sparkles },
        { id: 'mcp', label: 'MCP 服务器', icon: Database },
        { id: 'tools', label: '内置工具', icon: BoxIcon },
        { id: 'about', label: '关于我们', icon: Info },
    ] as const;

    return (
        <div className="flex h-full bg-slate-50 dark:bg-black/20">
            {/* Settings Sidebar */}
            <div className="w-56 shrink-0 border-r border-slate-200 dark:border-white/5 bg-white dark:bg-[#18181b]/50 p-4 flex flex-col gap-1">
                <div className="px-3 py-4 mb-2">
                    <h2 className="text-sm font-bold text-slate-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-2">
                        <SettingsIcon size={14} />
                        设置
                    </h2>
                </div>

                {sections.map(section => (
                    <button
                        key={section.id}
                        onClick={() => setActiveSection(section.id as SettingsSection)}
                        className={clsx(
                            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                            activeSection === section.id
                                ? "bg-indigo-50 text-indigo-600 dark:bg-white/10 dark:text-white"
                                : "text-slate-600 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-gray-200"
                        )}
                    >
                        <section.icon size={18} strokeWidth={2} className={activeSection === section.id ? "text-indigo-500 dark:text-white" : "text-slate-400 dark:text-gray-500"} />
                        {section.label}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col h-full bg-white dark:bg-transparent">
                {/* Draggable Header for window control - 与 ChatLayout 一致 */}
                <header className="h-14 border-b border-slate-200 dark:border-white/5 flex items-center justify-between px-4 draggable shrink-0 z-10 bg-white dark:bg-[#09090b]">
                    <div className="flex items-center gap-3">
                        <h1 className="text-sm font-semibold text-slate-800 dark:text-gray-100">
                            {sections.find(s => s.id === activeSection)?.label || '设置'}
                        </h1>
                    </div>
                    {/* 预留窗口控制按钮的空间 */}
                    <div className="w-32" />
                </header>

                <div className="flex-1 overflow-y-auto p-8">
                    {/* The h-full above is crucial for ModelSettings to manage its own scrolling */}
                    {activeSection === 'general' && <GeneralSettings />}


                    {/* ModelSettings 占据100%高度，包含自己的两栏布局 */}
                    {activeSection === 'models' && (
                        <div className="h-full">
                            <ModelSettings />
                        </div>
                    )}

                    {activeSection === 'persona' && <PersonaSettings />}

                    {activeSection === 'mcp' && <McpSettings />}

                    {activeSection === 'tools' && <CoreToolSettings />}

                    {activeSection === 'about' && (
                        <div className="max-w-2xl text-center pt-20 space-y-4">
                            <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl mx-auto shadow-xl flex items-center justify-center text-white text-3xl font-bold">
                                G
                            </div>
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Geni</h2>
                            <p className="text-slate-500 dark:text-gray-400">Your personal spark for creativity & code</p>

                            <div className="pt-8 text-xs text-slate-400">
                                Version 1.0.0 (Beta) <br />
                                © 2026 Geni Inc.
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
