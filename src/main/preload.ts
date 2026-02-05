import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
    ping: () => ipcRenderer.invoke('ping'),
    getSkills: () => ipcRenderer.invoke('get-skills'),
    toggleSkill: (id: string) => ipcRenderer.invoke('toggle-skill', id),
    setTrustLevel: (id: string, level: string) => ipcRenderer.invoke('set-trust-level', id, level),
    sendMessage: (text: string, history?: any[]) => ipcRenderer.invoke('send-message', text, history),
    abortRequest: () => ipcRenderer.invoke('abort-request'),
    getAppSettings: () => ipcRenderer.invoke('get-settings'),
    saveAppSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),
    mcpConnect: (config: any) => ipcRenderer.invoke('mcp-connect', config),
    mcpListTools: () => ipcRenderer.invoke('mcp-list-tools'),
    onReplyStream: (callback: (chunk: string, reset?: boolean) => void) => {
        const subscription = (_: any, chunk: string, reset?: boolean) => callback(chunk, reset)
        ipcRenderer.on('reply-stream', subscription)
        return () => ipcRenderer.removeListener('reply-stream', subscription)
    },
    onReplyTrace: (callback: (steps: any[]) => void) => {
        const subscription = (_: any, steps: any[]) => callback(steps)
        ipcRenderer.on('reply-trace', subscription)
        return () => ipcRenderer.removeListener('reply-trace', subscription)
    },
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    selectFile: () => ipcRenderer.invoke('select-file'),

    // Chat History (Granular)
    getSessionList: () => ipcRenderer.invoke('get-session-list'),
    getSessionMessages: (id: string) => ipcRenderer.invoke('get-session-messages', id),
    saveSession: (session: any) => ipcRenderer.invoke('save-session', session),
    deleteSession: (id: string) => ipcRenderer.invoke('delete-session', id)
})
