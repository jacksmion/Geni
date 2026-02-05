import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
    ping: () => ipcRenderer.invoke('ping'),
    getSkills: () => ipcRenderer.invoke('get-skills'),
    toggleSkill: (id: string) => ipcRenderer.invoke('toggle-skill', id),
    setTrustLevel: (id: string, level: string) => ipcRenderer.invoke('set-trust-level', id, level),
    sendMessage: (text: string) => ipcRenderer.invoke('send-message', text),
    abortRequest: () => ipcRenderer.invoke('abort-request'),
    getAppSettings: () => ipcRenderer.invoke('get-settings'),
    saveAppSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),
    mcpConnect: (config: any) => ipcRenderer.invoke('mcp-connect', config),
    mcpListTools: () => ipcRenderer.invoke('mcp-list-tools'),
    onReplyStream: (callback: (chunk: string) => void) => {
        const subscription = (_: any, chunk: string) => callback(chunk)
        ipcRenderer.on('reply-stream', subscription)
        return () => ipcRenderer.removeListener('reply-stream', subscription)
    },
    onReplyTrace: (callback: (steps: any[]) => void) => {
        const subscription = (_: any, steps: any[]) => callback(steps)
        ipcRenderer.on('reply-trace', subscription)
        return () => ipcRenderer.removeListener('reply-trace', subscription)
    }
})
