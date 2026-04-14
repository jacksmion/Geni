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

        ipcMain.handle(STAFF_CHANNELS.GENERATE_PROMPT, async (_e, { name, description, modelId }: { name: string; description?: string; modelId?: string }) => {
            return this.generatePrompt(name, description, modelId);
        });
    }

    private async generatePrompt(name: string, description?: string, modelId?: string): Promise<string> {
        const model = modelId ? this.getModelById(modelId) : this.getDefaultModel();
        const userMessage = description
            ? `角色名称：${name}\n简要描述：${description}`
            : `角色名称：${name}`;

        const messages = [
            {
                role: 'system' as const,
                content: `
# Role: 超级提示词工程师
你是一位世界级的首席提示词工程师，精通各种大语言模型（如 GPT-4, Claude, Gemini 等）的底层机制。你擅长将用户模糊、简单的需求，转化为结构清晰、逻辑严密、无歧义的高效提示词。
你知道如何通过设定角色、提供上下文、制定规则、设计输出格式来最大化激发大模型的潜力。

## Goals
1. 深度剖析用户的初始需求，挖掘隐性意图。
2. 使用经过验证的提示词框架（如 CREATE 框架或结构化框架）生成提示词。
3. 确保生成的提示词具有高可执行性、高复用性。

## Workflow
**Step 1: 根据用户提供的角色名称和描述，生成提示词。
**Step 2: 提示词构建**使用以下标准结构来生成提示词。

### 提示词标准结构
- **[Role] 角色设定**：为 AI 赋予一个极具专业性的专家身份。
- **[Context] 背景信息**：补充任务发生的场景、目标受众、核心痛点等上下文。
- **[Task] 核心任务**：清晰、明确地告诉 AI 需要完成什么工作（使用强动词）。
- **[Rules] 约束规则**：列出 AI 必须遵守的硬性规定（如字数限制、语调、禁止事项、安全边界等）。
- **[Workflow] 工作流**：如果任务复杂，提供分步执行的指令（Step 1, Step 2...）。
- **[Output Format] 输出格式**：严格规定 AI 输出的排版方式（如 Markdown、表格、JSON、特定标题等）。

## Constraints
- 生成的提示词中，禁止出现“作为一个AI”、“我无法”等破坏角色代入的废话。
- 语言必须精炼、专业，多用指令性语句，少用描述性语句。
- 必须使用中文输出（除非用户要求生成其他语言的提示词）。
- 直接输出结果，不要包裹markdown标签。
`,
            },
            { role: 'user' as const, content: userMessage },
        ];

        const stream = model.stream(messages, { max_tokens: 2048 });
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

    private getModelById(modelId: string): IChatModel {
        const [provider, ...rest] = modelId.split('/');
        const modelName = rest.join('/');
        const providers = this.settings.llm?.providers || {};
        const config = providers[provider];
        if (!config?.enabled || !config.apiKey) {
            throw new Error(`模型 ${modelId} 不可用，请检查配置`);
        }
        const defaultCfg = DEFAULT_PROVIDER_CONFIGS[provider];
        return createChatModel(provider, {
            apiKey: config.apiKey,
            baseUrl: config.baseUrl || defaultCfg?.baseUrl,
            model: modelName,
            temperature: 0.7,
        });
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
