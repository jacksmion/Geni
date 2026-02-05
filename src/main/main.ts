import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { SkillLoader } from './services/SkillLoader.js'
import { AgentEngine } from './services/AgentEngine.js'
import { PythonBridge } from './services/PythonBridge.js'
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
    const pyBridge = new PythonBridge()

    ipcMain.handle('send-message', async (_, text: string) => {
        // 构建系统提示词
        const systemPrompt = agent.generateSystemPrompt(skills)
        console.log('--- System Prompt ---')
        console.log(systemPrompt)

        // 这里模拟 ReAct 决策过程
        // 实际上这部分应该由 LLM 模型返回，这里我们手动模拟它决定运行 python-exec
        const thought1 = `用户输入: "${text}"。我看了一下可用技能，发现 python-exec 可以处理它。我将编写一个 Python 脚本来计算。`
        const pythonCode = `import sys\nprint("Hello from real Python runtime!")\nprint(f"I received: ${text}")\nprint(f"Platform: {sys.platform}")`

        // 执行真实 Python 代码
        let observation = ''
        try {
            const result = await pyBridge.executeCode(pythonCode)
            observation = result.stdout || result.stderr
        } catch (err: any) {
            observation = `Error: ${err.message}`
        }

        const mockSteps = [
            {
                thought: thought1,
                action: 'python-exec',
                actionInput: JSON.stringify({ code: pythonCode }),
                observation: observation,
                isComplete: false
            },
            {
                thought: 'Python 脚本执行成功，我得到了运行环境的真实反馈。',
                isComplete: true
            }
        ]

        return {
            finalAnswer: `我已经运行了真实的 Python 脚本。反馈结果是：\n${observation}`,
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
