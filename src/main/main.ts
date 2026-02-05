import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { SkillLoader } from './services/SkillLoader.js'
import { AgentEngine } from './services/AgentEngine.js'
import { PythonBridge } from './services/PythonBridge.js'
import { ConfigManager } from './services/ConfigManager.js'
import { Skill } from '../common/types/skill'
import { AppSettings } from '../common/types/settings'

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
    const configManager = new ConfigManager()
    let appSettings = configManager.load()

    ipcMain.handle('get-settings', () => appSettings)
    ipcMain.handle('save-settings', (_, settings: AppSettings) => {
        appSettings = settings
        configManager.save(settings)
        return true
    })

    const { OpenAI } = await import('openai')

    ipcMain.handle('send-message', async (_, text: string) => {
        const client = new OpenAI({
            apiKey: appSettings.llm.apiKey,
            baseURL: appSettings.llm.baseUrl,
            dangerouslyAllowBrowser: true // 虽然是在主进程，但为了防范一些环境问题
        })

        const systemPrompt = agent.generateSystemPrompt(skills)
        const messages: any[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
        ]

        const steps: any[] = []
        let lastResponse = ''
        let iteration = 0
        const maxIterations = 5

        try {
            while (iteration < maxIterations) {
                iteration++
                const completion = await client.chat.completions.create({
                    model: appSettings.llm.model,
                    messages: messages,
                    temperature: appSettings.llm.temperature
                })

                const responseText = completion.choices[0].message.content || ''
                lastResponse = responseText
                const parsed = agent.parseResponse(responseText)

                // 记录当前模型的思考和预定行动
                steps.push({
                    thought: parsed.thought,
                    action: parsed.action,
                    actionInput: parsed.actionInput,
                    isComplete: !!parsed.finalAnswer
                })

                if (parsed.finalAnswer) {
                    return { finalAnswer: parsed.finalAnswer, steps }
                }

                if (parsed.action) {
                    messages.push({ role: 'assistant', content: responseText })

                    let observation = ''
                    if (parsed.action === 'python-exec') {
                        try {
                            // 尝试解析 Action Input 中的代码
                            let code = ''
                            try {
                                const input = JSON.parse(parsed.actionInput || '{}')
                                code = input.code || parsed.actionInput || ''
                            } catch {
                                code = parsed.actionInput || ''
                            }

                            const result = await pyBridge.executeCode(code)
                            observation = result.stdout || result.stderr || '执行完成，无输出。'
                        } catch (err: any) {
                            observation = `执行出错: ${err.message}`
                        }
                    } else {
                        observation = `Error: 技能 ${parsed.action} 尚未在 Assistant Core 中实现。`
                    }

                    // 更新当前步骤的观察结果
                    steps[steps.length - 1].observation = observation
                    messages.push({ role: 'user', content: `Observation: ${observation}` })
                } else {
                    // LLM 既没给 Final Answer 也没给 Action，可能格式错误或直接回答了
                    return { finalAnswer: responseText, steps }
                }
            }
        } catch (error: any) {
            console.error('LLM API Error:', error)
            return {
                finalAnswer: `抱歉，在与模型通信时发生了错误：${error.message}`,
                steps: steps.length > 0 ? steps : [{ thought: 'API 调用失败', isComplete: true }]
            }
        }

        return { finalAnswer: lastResponse, steps }
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
