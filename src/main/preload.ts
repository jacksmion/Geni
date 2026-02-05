import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
    ping: () => ipcRenderer.invoke('ping'),
    getSkills: () => ipcRenderer.invoke('get-skills'),
    toggleSkill: (id: string) => ipcRenderer.invoke('toggle-skill', id),
    setTrustLevel: (id: string, level: string) => ipcRenderer.invoke('set-trust-level', id, level),
    sendMessage: (text: string) => ipcRenderer.invoke('send-message', text),
    getAppSettings: () => ipcRenderer.invoke('get-settings'),
    saveAppSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),
})
