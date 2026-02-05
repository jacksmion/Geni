import { Message, AgentContext } from '../../common/types/agent';
import { Skill } from '../../common/types/skill';

export class AgentEngine {
    /**
     * 生成 ReAct 提示词模板
     * 引导模型按照 Thought -> Action -> Observation 的结构思考
     */
    public generateSystemPrompt(skills: Skill[]): string {
        const enabledSkills = skills.filter(s => s.enabled);
        const skillsDescription = enabledSkills.map(s => `- ${s.id}: ${s.description}`).join('\n');

        return `你是 Assistant Core，一个强大的本地智能代理。
你运行在一个基于桌面环境的 ReAct (Reasoning and Acting) 循环中。

## 运行规范
你必须严格遵循以下格式进行回应：

Thought: [你的思考过程，分析用户意图及下一步行动]
Action: [调用的技能名称，必须是以下可用列表中的一个]
Action Input: [传递给技能的参数，必须是一个有效的 JSON 对象]

发送 Action 后，你会收到一个 Observation。
Observation: [技能执行的结果]

... (这个过程可能会重复多次)

Final Answer: [最后给用户的回答]

## 可用技能列表
${skillsDescription || '目前没有可用的技能。'}

## 注意事项
1. 始终在行动前进行思考 (Thought)。
2. 如果任务可以通过 Python 脚本解决，优先使用 python-exec。
3. 保持简洁，直接。
`;
    }

    /**
     * 解析模型输出，提取 Thought、Action 和 Final Answer
     */
    public parseResponse(text: string) {
        const thoughtMatch = text.match(/Thought:\s*([\s\S]*?)(?=Action:|Final Answer:|$)/i);
        const actionMatch = text.match(/Action:\s*(\S+)/i);
        const actionInputMatch = text.match(/Action Input:\s*([\s\S]*?)(?=Observation:|Final Answer:|$)/i);
        const finalAnswerMatch = text.match(/Final Answer:\s*([\s\S]*)$/i);

        return {
            thought: thoughtMatch ? thoughtMatch[1].trim() : null,
            action: actionMatch ? actionMatch[1].trim() : null,
            actionInput: actionInputMatch ? actionInputMatch[1].trim() : null,
            finalAnswer: finalAnswerMatch ? finalAnswerMatch[1].trim() : null,
        };
    }
}
