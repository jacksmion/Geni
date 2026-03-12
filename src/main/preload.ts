
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
    agent: {
        start: (payload: any) => ipcRenderer.invoke('agent:start', payload),
        stop: (sessionId?: string) => ipcRenderer.invoke('agent:stop', sessionId),
        getState: () => ipcRenderer.invoke('agent:get-state'),
        onStream: (callback: (chunk: string, reset?: boolean) => void) => {
            const sub = (_: any, payload: { content: string, isReset?: boolean }) => callback(payload.content, payload.isReset)
            ipcRenderer.on('agent:stream', sub)
            return () => ipcRenderer.removeListener('agent:stream', sub)
        },
        onStepUpdate: (callback: (steps: any[]) => void) => {
            const sub = (_: any, payload: { steps: any[] }) => callback(payload.steps)
            ipcRenderer.on('agent:step', sub)
            return () => ipcRenderer.removeListener('agent:step', sub)
        },
        onStateChange: (callback: (event: any) => void) => {
            const sub = (_: any, event: any) => callback(event)
            ipcRenderer.on('agent:state', sub)
            return () => ipcRenderer.removeListener('agent:state', sub)
        },
        onError: (callback: (error: any) => void) => {
            const sub = (_: any, payload: { message: string }) => callback(payload)
            ipcRenderer.on('agent:error', sub)
            return () => ipcRenderer.removeListener('agent:error', sub)
        },
        onAuthorizationRequest: (callback: (request: any) => void) => {
            const sub = (_: any, request: any) => callback(request)
            ipcRenderer.on('agent:authorization-request', sub)
            return () => ipcRenderer.removeListener('agent:authorization-request', sub)
        },
        respondToAuthorization: (response: any) => ipcRenderer.send('agent:authorization-response', response),
    },
    session: {
        create: () => ipcRenderer.invoke('session:create'),
        list: () => ipcRenderer.invoke('session:list'),
        getHistory: (id: string) => ipcRenderer.invoke('session:get-history', id),
        delete: (id: string) => ipcRenderer.invoke('session:delete', id),
        save: (session: any) => ipcRenderer.invoke('session:save', session),
        get: (id: string) => ipcRenderer.invoke('session:get', id),
        addMessage: (sessionId: string, message: any) => ipcRenderer.invoke('session:add-message', { sessionId, message })
    },
    system: {
        getSettings: () => ipcRenderer.invoke('system:get-settings'),
        saveSettings: (settings: any) => ipcRenderer.invoke('system:save-settings', settings),
        selectFile: () => ipcRenderer.invoke('system:select-file'),
        selectDirectory: () => ipcRenderer.invoke('system:select-directory'),
        openExplorer: (path: string) => ipcRenderer.invoke('system:open-explorer', path),
        testLLM: (config: any) => ipcRenderer.invoke('system:test-llm', config),
        fetchProviderModels: (payload: any) => ipcRenderer.invoke('system:fetch-provider-models', payload),
        testTelegram: (config: any) => ipcRenderer.invoke('system:test-telegram', config),
        testWeCom: (config: any) => ipcRenderer.invoke('system:test-wecom', config),
        testLark: (config: any) => ipcRenderer.invoke('system:test-lark', config),
        getUsageStats: () => ipcRenderer.invoke('system:get-usage-stats')
    },
    tools: {
        getSkills: () => ipcRenderer.invoke('tool:get-skills'),
        toggleSkill: (id: string) => ipcRenderer.invoke('tool:toggle-skill', id),
        setTrustLevel: (id: string, level: string) => ipcRenderer.invoke('tool:set-trust-level', id, level),
        mcpConnect: (config: any) => ipcRenderer.invoke('tool:mcp-connect', config),
        mcpListTools: () => ipcRenderer.invoke('tool:mcp-list-tools'),
        mcpToggleTool: (serverId: string, toolName: string) => ipcRenderer.invoke('tool:mcp-toggle-tool', serverId, toolName),
        mcpSetToolTrustLevel: (serverId: string, toolName: string, level: string) => ipcRenderer.invoke('tool:mcp-set-tool-trust-level', serverId, toolName, level),
        mcpToggleServer: (serverId: string, enabled: boolean) => ipcRenderer.invoke('tool:mcp-toggle-server', serverId, enabled),
        mcpGetStatuses: () => ipcRenderer.invoke('tool:mcp-get-statuses'),
        coreToolList: () => ipcRenderer.invoke('tool:core-tool-list'),
        coreToolToggle: (toolName: string) => ipcRenderer.invoke('tool:core-tool-toggle', toolName),
        coreToolSetTrustLevel: (toolName: string, level: string) => ipcRenderer.invoke('tool:core-tool-set-trust-level', toolName, level)
    },
    scheduler: {
        triggerTask: (taskId: string) => ipcRenderer.invoke('scheduler:trigger-task', taskId),
        getStatuses: () => ipcRenderer.invoke('scheduler:get-statuses'),
        getLogs: (taskId: string, limit?: number) => ipcRenderer.invoke('scheduler:get-logs', taskId, limit),
        validateCron: (expression: string) => ipcRenderer.invoke('scheduler:validate-cron', expression),
    },
    tray: {
        onNavigateToSettings: (callback: () => void) => {
            const sub = () => callback()
            ipcRenderer.on('tray:navigate-to-settings', sub)
            return () => ipcRenderer.removeListener('tray:navigate-to-settings', sub)
        },
        onNewTask: (callback: () => void) => {
            const sub = () => callback()
            ipcRenderer.on('tray:new-task', sub)
            return () => ipcRenderer.removeListener('tray:new-task', sub)
        }
    }
})
