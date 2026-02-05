import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { SkillLoader } from './services/SkillLoader.js'
import { AgentEngine } from './services/AgentEngine.js'
import { Skill } from '../common/types/skill'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.mjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        titleBarStyle: 'hidden',
        titleBarOverlay: true,
    })

    // 这里的 path 会根据 vite-plugin-electron 的输出自动调整
    if (process.env.VITE_DEV_SERVER_URL) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL)
    } else {
        win.loadFile(path.join(__dirname, '../dist/index.html'))
    }
}

app.whenReady().then(async () => {
    const skillsDir = path.join(__dirname, '../../skills')
    const loader = new SkillLoader(skillsDir)
    let skills: Skill[] = await loader.loadSkills()

    ipcMain.handle('get-skills', () => skills)

    ipcMain.handle('toggle-skill', (_, id: string) => {
        skills = skills.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s)
        return skills
    })

    ipcMain.handle('set-trust-level', (_, id: string, level: 'Ask' | 'Auto') => {
        skills = skills.map(s => s.id === id ? { ...s, trustLevel: level } : s)
        return skills
    })

    const agent = new AgentEngine()

    ipcMain.handle('send-message', async (_, text: string) => {
        // 构建系统提示词
        const systemPrompt = agent.generateSystemPrompt(skills)
        console.log('--- System Prompt ---')
        console.log(systemPrompt)

        // 模拟 ReAct 响应过程 (实际开发中这里对接 LLM API)
        const mockSteps = [
            {
                thought: `用户想要执行 Python 代码。我需要调用 python-exec 技能。`,
                action: 'python-exec',
                actionInput: JSON.stringify({ code: 'print("Hello from Agent Core!")' }),
                observation: 'Hello from Agent Core!',
                isComplete: false
            },
            {
                thought: 'Python 脚本执行成功。用户已收到问候。',
                isComplete: true
            }
        ]

        return {
            finalAnswer: '我已经运行了 Python 脚本。输出结果是：Hello from Agent Core!',
            steps: mockSteps
        }
    })

    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

// IPC 示例
ipcMain.handle('ping', () => 'pong')
