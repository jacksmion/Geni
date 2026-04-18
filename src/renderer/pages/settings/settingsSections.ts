import type { LucideIcon } from 'lucide-react';
import { BarChart3, Box as BoxIcon, Command, Database, Globe, Info, Layout, MessageSquare, Sparkles } from 'lucide-react';

export type SettingsSection = 'general' | 'models' | 'persona' | 'mcp' | 'tools' | 'im' | 'shortcuts' | 'usage' | 'about';

export interface SettingsSectionConfig {
    id: SettingsSection;
    labelKey: string;
    icon: LucideIcon;
}

export const SETTINGS_SECTIONS: SettingsSectionConfig[] = [
    { id: 'general', labelKey: 'settings.sections.general', icon: Layout },
    { id: 'models', labelKey: 'settings.sections.models', icon: Globe },
    { id: 'persona', labelKey: 'settings.sections.persona', icon: Sparkles },
    { id: 'mcp', labelKey: 'settings.sections.mcp', icon: Database },
    { id: 'tools', labelKey: 'settings.sections.tools', icon: BoxIcon },
    { id: 'im', labelKey: 'settings.sections.im', icon: MessageSquare },
    { id: 'shortcuts', labelKey: 'settings.sections.shortcuts', icon: Command },
    { id: 'usage', labelKey: 'settings.sections.usage', icon: BarChart3 },
    { id: 'about', labelKey: 'settings.sections.about', icon: Info },
];
