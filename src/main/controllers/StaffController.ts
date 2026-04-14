import { ipcMain } from 'electron';
import { StaffManager } from '../services/staff/StaffManager';
import { STAFF_CHANNELS } from '../../common/ipc/channels';
import { createChatModel } from '../services/llm/ChatModelFactory';
import { DEFAULT_PROVIDER_CONFIGS } from '../../common/types/settings';
import type { AppSettings } from '../../common/types/settings';
import type { IChatModel } from '../services/llm/IChatModel';

/**
 * StaffController - 数字员工 IPC 控制器
 */
export class StaffController {
    private settings: AppSettings;

    constructor(
        private staffManager: StaffManager,
        settings: AppSettings,
    ) {
        this.settings = settings;
    }

    public updateSettings(settings: AppSettings): void {
        this.settings = settings;
    }

    public registerHandlers(): void {
        ipcMain.handle(STAFF_CHANNELS.LIST, () => {
            return this.staffManager.list();
        });

        ipcMain.handle(STAFF_CHANNELS.GET, (_e, id: string) => {
            return this.staffManager.get(id);
        });

        ipcMain.handle(STAFF_CHANNELS.CREATE, (_e, input: any) => {
            return this.staffManager.create(input);
        });

        ipcMain.handle(STAFF_CHANNELS.UPDATE, (_e, id: string, updates: any) => {
            return this.staffManager.update(id, updates);
        });

        ipcMain.handle(STAFF_CHANNELS.DELETE, (_e, id: string) => {
            return this.staffManager.delete(id);
        });

        ipcMain.handle(STAFF_CHANNELS.GENERATE_PROMPT, async (_e, { name, description }: { name: string; description?: string }) => {
            return this.generatePrompt(name, description);
        });
    }

    private async generatePrompt(name: string, description?: string): Promise<string> {
        const model = this.getDefaultModel();
        const userMessage = description
            ? `数字员工名称：${name}\n简要描述：${description}`
            : `数字员工名称：${name}`;

        const messages = [
            {
                role: 'system' as const,
                content: `你是一个 AI 系统提示词专家。请根据用户提供的数字员工名称和描述，生成一份专业、详细的系统提示词（System Prompt）。

要求：
1. 提示词应定义该数字员工的角色、能力、行为准则和沟通风格
2. 使用第二人称（"你"）来描述该角色
3. 内容要专业且具有可操作性
4. 直接输出提示词内容，不要加任何前缀说明或 markdown 代码块标记
5. 篇幅适中（200-500字）`,
            },
            { role: 'user' as const, content: userMessage },
        ];

        const stream = model.stream(messages, { max_tokens: 1024 });
        let result = '';
        for await (const event of stream) {
            if (event.type === 'content_delta') {
                result += event.delta;
            } else if (event.type === 'error') {
                throw new Error(event.error.message);
            }
        }
        return result.trim();
    }

    private getDefaultModel(): IChatModel {
        const providers = this.settings.llm?.providers || {};
        // Find first enabled provider with apiKey
        for (const [provider, config] of Object.entries(providers)) {
            if (!config.enabled || !config.apiKey) continue;
            for (const m of config.models || []) {
                if (!m.enabled) continue;
                const defaultCfg = DEFAULT_PROVIDER_CONFIGS[provider];
                return createChatModel(provider, {
                    apiKey: config.apiKey,
                    baseUrl: config.baseUrl || defaultCfg?.baseUrl,
                    model: m.model,
                    temperature: 0.7,
                });
            }
        }
        throw new Error('未配置可用的 LLM 模型，请先在设置中配置');
    }
}
