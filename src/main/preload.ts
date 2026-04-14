
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
    agent: {
        start: (payload: any) => ipcRenderer.invoke('agent:start', payload),
        stop: (sessionId?: string) => ipcRenderer.invoke('agent:stop', sessionId),
        getState: () => ipcRenderer.invoke('agent:get-state'),
        onStream: (callback: (sessionId: string, chunk: string, reset?: boolean) => void) => {
            const sub = (_: any, payload: { sessionId: string, content: string, isReset?: boolean }) => callback(payload.sessionId, payload.content, payload.isReset)
            ipcRenderer.on('agent:stream', sub)
            return () => ipcRenderer.removeListener('agent:stream', sub)
        },
        onReasoningStream: (callback: (sessionId: string, chunk: string, reset?: boolean) => void) => {
            const sub = (_: any, payload: { sessionId: string, content: string, isReset?: boolean }) => callback(payload.sessionId, payload.content, payload.isReset)
            ipcRenderer.on('agent:reasoning-stream', sub)
            return () => ipcRenderer.removeListener('agent:reasoning-stream', sub)
        },
        onStepUpdate: (callback: (sessionId: string, steps: any[]) => void) => {
            const sub = (_: any, payload: { sessionId: string, steps: any[] }) => callback(payload.sessionId, payload.steps)
            ipcRenderer.on('agent:step', sub)
            return () => ipcRenderer.removeListener('agent:step', sub)
        },
        onStateChange: (callback: (sessionId: string, event: any) => void) => {
            const sub = (_: any, event: any) => callback(event.sessionId, event)
            ipcRenderer.on('agent:state', sub)
            return () => ipcRenderer.removeListener('agent:state', sub)
        },
        onError: (callback: (sessionId: string, error: any) => void) => {
            const sub = (_: any, payload: { sessionId: string, message: string }) => callback(payload.sessionId, payload)
            ipcRenderer.on('agent:error', sub)
            return () => ipcRenderer.removeListener('agent:error', sub)
        },
        onAuthorizationRequest: (callback: (sessionId: string, request: any) => void) => {
            const sub = (_: any, request: any) => callback(request.sessionId, request)
            ipcRenderer.on('agent:authorization-request', sub)
            return () => ipcRenderer.removeListener('agent:authorization-request', sub)
        },
        respondToAuthorization: (response: any) => ipcRenderer.send('agent:authorization-response', response),
        onAgentEvent: (callback: (event: any) => void) => {
            const sub = (_: any, event: any) => callback(event)
            ipcRenderer.on('agent:event', sub)
            return () => ipcRenderer.removeListener('agent:event', sub)
        },
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
        selectFile: (forAttachment?: boolean) => ipcRenderer.invoke('system:select-file', forAttachment),
        selectDirectory: () => ipcRenderer.invoke('system:select-directory'),
        openExplorer: (path: string) => ipcRenderer.invoke('system:open-explorer', path),
        testLLM: (config: any) => ipcRenderer.invoke('system:test-llm', config),
        fetchProviderModels: (payload: any) => ipcRenderer.invoke('system:fetch-provider-models', payload),
        testTelegram: (config: any) => ipcRenderer.invoke('system:test-telegram', config),
        testWeCom: (config: any) => ipcRenderer.invoke('system:test-wecom', config),
        testLark: (config: any) => ipcRenderer.invoke('system:test-lark', config),
        testWechat: () => ipcRenderer.invoke('system:test-wechat'),
        readFileBase64: (path: string) => ipcRenderer.invoke('system:read-file-base64', path),
        addAllowedPath: (filePath: string) => ipcRenderer.invoke('system:add-allowed-path', filePath),
        getUsageStats: () => ipcRenderer.invoke('system:get-usage-stats'),
        readProfileFile: (name: string) => ipcRenderer.invoke('system:read-profile-file', name),
        writeProfileFile: (name: string, content: string) => ipcRenderer.invoke('system:write-profile-file', name, content),
        onSettingsChanged: (callback: (settings: any) => void) => {
            const sub = (_: any, settings: any) => callback(settings)
            ipcRenderer.on('system:settings-changed', sub)
            return () => ipcRenderer.removeListener('system:settings-changed', sub)
        },
        onWechatQr: (callback: (qrUrl: string) => void) => {
            const sub = (_: any, qrUrl: string) => callback(qrUrl)
            ipcRenderer.on('system:wechat-qr', sub)
            return () => ipcRenderer.removeListener('system:wechat-qr', sub)
        }
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
        coreToolSetTrustLevel: (toolName: string, level: string) => ipcRenderer.invoke('tool:core-tool-set-trust-level', toolName, level),
        importSkill: (filePath: string) => ipcRenderer.invoke('tool:import-skill', filePath),
        importSkillConfirm: (originalPath: string, sourceTempDir: string | undefined, skillName: string, action: 'overwrite' | 'skip' | 'rename') => ipcRenderer.invoke('tool:import-skill-confirm', originalPath, sourceTempDir, skillName, action),
        deleteSkill: (id: string) => ipcRenderer.invoke('tool:delete-skill', id),
    },
    scheduler: {
        triggerTask: (taskId: string) => ipcRenderer.invoke('scheduler:trigger-task', taskId),
        getStatuses: () => ipcRenderer.invoke('scheduler:get-statuses'),
        getLogs: (taskId: string, limit?: number) => ipcRenderer.invoke('scheduler:get-logs', taskId, limit),
        validateCron: (expression: string) => ipcRenderer.invoke('scheduler:validate-cron', expression),
        deleteLogs: (taskId: string, logIds: string[]) => ipcRenderer.invoke('scheduler:delete-logs', taskId, logIds),
        deleteAllLogs: (taskId: string) => ipcRenderer.invoke('scheduler:delete-all-logs', taskId),
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
    },
    update: {
        checkForUpdates: () => ipcRenderer.invoke('update:check-for-updates'),
        downloadUpdate: () => ipcRenderer.invoke('update:download-update'),
        quitAndInstall: () => ipcRenderer.invoke('update:quit-and-install'),
        getVersion: () => ipcRenderer.invoke('update:get-version'),
        onChecking: (callback: () => void) => {
            const sub = () => callback()
            ipcRenderer.on('update:checking', sub)
            return () => ipcRenderer.removeListener('update:checking', sub)
        },
        onUpdateAvailable: (callback: (info: any) => void) => {
            const sub = (_: any, info: any) => callback(info)
            ipcRenderer.on('update:available', sub)
            return () => ipcRenderer.removeListener('update:available', sub)
        },
        onUpdateNotAvailable: (callback: (info: any) => void) => {
            const sub = (_: any, info: any) => callback(info)
            ipcRenderer.on('update:not-available', sub)
            return () => ipcRenderer.removeListener('update:not-available', sub)
        },
        onDownloadProgress: (callback: (progress: any) => void) => {
            const sub = (_: any, progress: any) => callback(progress)
            ipcRenderer.on('update:download-progress', sub)
            return () => ipcRenderer.removeListener('update:download-progress', sub)
        },
        onUpdateDownloaded: (callback: (info: any) => void) => {
            const sub = (_: any, info: any) => callback(info)
            ipcRenderer.on('update:downloaded', sub)
            return () => ipcRenderer.removeListener('update:downloaded', sub)
        },
        onError: (callback: (error: string) => void) => {
            const sub = (_: any, error: string) => callback(error)
            ipcRenderer.on('update:error', sub)
            return () => ipcRenderer.removeListener('update:error', sub)
        }
    },
    staff: {
        list: () => ipcRenderer.invoke('staff:list'),
        get: (id: string) => ipcRenderer.invoke('staff:get', id),
        create: (input: any) => ipcRenderer.invoke('staff:create', input),
        update: (id: string, updates: any) => ipcRenderer.invoke('staff:update', id, updates),
        delete: (id: string) => ipcRenderer.invoke('staff:delete', id),
        generatePrompt: (name: string, description?: string, modelId?: string) => ipcRenderer.invoke('staff:generate-prompt', { name, description, modelId }),
        onGeneratePromptChunk: (callback: (delta: string) => void) => {
            const handler = (_e: any, delta: string) => callback(delta);
            ipcRenderer.on('staff:generate-prompt-chunk', handler);
            return () => { ipcRenderer.removeListener('staff:generate-prompt-chunk', handler); };
        },
    }
})
