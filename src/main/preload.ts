
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
        }
    },
    session: {
        create: () => ipcRenderer.invoke('session:create'),
        list: () => ipcRenderer.invoke('session:list'),
        getHistory: (id: string) => ipcRenderer.invoke('session:get-history', id),
        delete: (id: string) => ipcRenderer.invoke('session:delete', id),
        save: (session: any) => ipcRenderer.invoke('session:save', session),
        get: (id: string) => ipcRenderer.invoke('session:get', id)
    },
    system: {
        getSettings: () => ipcRenderer.invoke('system:get-settings'),
        saveSettings: (settings: any) => ipcRenderer.invoke('system:save-settings', settings),
        selectFile: () => ipcRenderer.invoke('system:select-file'),
        selectDirectory: () => ipcRenderer.invoke('system:select-directory'),
        openExplorer: (path: string) => ipcRenderer.invoke('system:open-explorer', path),
        testLLM: (config: any) => ipcRenderer.invoke('system:test-llm', config)
    },
    tools: {
        getSkills: () => ipcRenderer.invoke('tool:get-skills'),
        toggleSkill: (id: string) => ipcRenderer.invoke('tool:toggle-skill', id),
        setTrustLevel: (id: string, level: string) => ipcRenderer.invoke('tool:set-trust-level', id, level),
        mcpConnect: (config: any) => ipcRenderer.invoke('tool:mcp-connect', config),
        mcpListTools: () => ipcRenderer.invoke('tool:mcp-list-tools')
    }
})
