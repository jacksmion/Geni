// src/renderer/components/CommandPalette/searchItems.ts
import { SearchItem } from './types'
import { useChatStore } from '../../store/useChatStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useStaffStore } from '../../store/useStaffStore'
import { useLayoutStore } from '../../store/useLayoutStore'

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
    const setSelectedSkillIds = useChatStore.getState().setSelectedSkillIds
    const setTheme = useSettingsStore.getState().setTheme
    const theme = useSettingsStore.getState().settings.theme

    return [
        {
            id: 'cmd-new-chat',
            type: 'command',
            label: '新建任务',
            description: '创建一个新的聊天任务',
            icon: 'Plus',
            keywords: ['new', '新建', '创建', 'create', 'chat'],
            action: () => {
                createSession()
                setActiveTab('chat')
            },
        },
        {
            id: 'cmd-new-staff',
            type: 'command',
            label: '新建员工',
            description: '创建一个新的数字员工',
            icon: 'UserPlus',
            keywords: ['new', '新建', '创建', '员工', 'staff', 'agent', '数字员工'],
            action: () => {
                useStaffStore.getState().setEditingId('new')
                setActiveTab('staff')
            },
        },
        {
            id: 'cmd-new-skill',
            type: 'command',
            label: '新建技能',
            description: '通过 AI 对话创建新技能',
            icon: 'Sparkles',
            keywords: ['new', '新建', '创建', '技能', 'skill'],
            action: () => {
                createSession()
                setSelectedSkillIds(['skill-creator'])
                setActiveTab('chat')
            },
        },
        {
            id: 'cmd-new-plan',
            type: 'command',
            label: '新建计划',
            description: '创建一个新的定时计划',
            icon: 'CalendarPlus',
            keywords: ['new', '新建', '创建', '计划', '定时', 'plan', 'schedule', 'cron'],
            action: () => {
                useLayoutStore.getState().setPendingCreatePlan(true)
                setActiveTab('scheduler')
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
        {
            id: 'cmd-theme-light',
            type: 'command',
            label: '浅色模式',
            description: '切换到浅色模式',
            icon: 'Sun',
            keywords: ['theme', '主题', 'light', '亮色', '浅色'],
            action: () => setTheme('light'),
        },
        {
            id: 'cmd-theme-dark',
            type: 'command',
            label: '深色模式',
            description: '切换到深色模式',
            icon: 'Moon',
            keywords: ['theme', '主题', 'dark', '暗色', '深色'],
            action: () => setTheme('dark'),
        },
    ]
}

/**
 * 获取会话搜索项（动态，从 store 读取）
 */
export function getSessionItems(): SearchItem[] {
    const { sessionMetas, switchSession } = useChatStore.getState()

    // 按 updatedAt 降序排列，最近的在最前面
    const sorted = [...sessionMetas].sort((a, b) => b.updatedAt - a.updatedAt)

    return sorted.map((meta) => ({
        id: `session-${meta.id}`,
        type: 'session' as const,
        label: meta.title || '未命名任务',
        description: `${new Date(meta.updatedAt).toLocaleDateString()}`,
        icon: 'MessageSquare',
        keywords: [meta.title || ''],
        action: () => switchSession(meta.id),
    }))
}
