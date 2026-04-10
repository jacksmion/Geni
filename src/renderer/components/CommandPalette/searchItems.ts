// src/renderer/components/CommandPalette/searchItems.ts
import { SearchItem } from './types'
import { useChatStore } from '../../store/useChatStore'
import { useSettingsStore } from '../../store/useSettingsStore'

/**
 * 获取页面导航搜索项（静态）
 */
export function getPageItems(): SearchItem[] {
    const setActiveTab = useChatStore.getState().setActiveTab

    return [
        {
            id: 'page-chat',
            type: 'page',
            label: '聊天',
            description: '切换到聊天页面',
            icon: 'MessageSquare',
            keywords: ['chat', '对话', '聊天'],
            action: () => setActiveTab('chat'),
        },
        {
            id: 'page-skills',
            type: 'page',
            label: '技能',
            description: '管理 AI 技能',
            icon: 'Zap',
            keywords: ['skill', '技能', '能力'],
            action: () => setActiveTab('skills'),
        },
        {
            id: 'page-staff',
            type: 'page',
            label: '员工',
            description: '管理数字员工',
            icon: 'Users',
            keywords: ['staff', '员工', '数字员工', 'agent'],
            action: () => setActiveTab('staff'),
        },
        {
            id: 'page-scheduler',
            type: 'page',
            label: '定时任务',
            description: '管理定时任务',
            icon: 'Clock',
            keywords: ['scheduler', '定时', '任务', 'cron'],
            action: () => setActiveTab('scheduler'),
        },
        {
            id: 'page-settings',
            type: 'page',
            label: '设置',
            description: '应用设置',
            icon: 'Settings',
            keywords: ['settings', '设置', '配置', '偏好'],
            action: () => setActiveTab('settings'),
        },
    ]
}

/**
 * 获取命令搜索项（静态）
 */
export function getCommandItems(): SearchItem[] {
    const setActiveTab = useChatStore.getState().setActiveTab
    const createSession = useChatStore.getState().createSession
    const setTheme = useSettingsStore.getState().setTheme
    const theme = useSettingsStore.getState().settings.theme

    return [
        {
            id: 'cmd-new-chat',
            type: 'command',
            label: '新建会话',
            description: '创建一个新的聊天会话',
            icon: 'Plus',
            keywords: ['new', '新建', '创建', 'create', 'chat'],
            action: () => {
                createSession()
                setActiveTab('chat')
            },
        },
        {
            id: 'cmd-toggle-theme',
            type: 'command',
            label: theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式',
            description: '切换应用主题',
            icon: theme === 'dark' ? 'Sun' : 'Moon',
            keywords: ['theme', '主题', 'dark', 'light', '暗色', '亮色'],
            action: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
        },
    ]
}

/**
 * 获取会话搜索项（动态，从 store 读取）
 */
export function getSessionItems(): SearchItem[] {
    const { sessionMetas, switchSession } = useChatStore.getState()

    return sessionMetas.map((meta) => ({
        id: `session-${meta.id}`,
        type: 'session' as const,
        label: meta.title || '未命名会话',
        description: `${new Date(meta.updatedAt).toLocaleDateString()}`,
        icon: 'MessageSquare',
        keywords: [meta.title || ''],
        action: () => switchSession(meta.id),
    }))
}
