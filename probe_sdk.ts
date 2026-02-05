
import { tool, query } from '@anthropic-ai/claude-agent-sdk';

async function main() {
    console.log("SDK Types:", typeof tool, typeof query);

    // 定义一个简单的工具
    const calculator = tool({
        name: 'add',
        description: 'Add two numbers',
        inputSchema: {
            type: 'object',
            properties: {
                a: { type: 'number' },
                b: { type: 'number' }
            },
            required: ['a', 'b']
        },
        handler: async ({ a, b }) => {
            console.log(`Executing add(${a}, ${b})`);
            return a + b;
        }
    });

    try {
        // 尝试调用 query (? 假设是这个名字)
        // 注意：这里需要 API Key。SDK 应该会自动从环境变量 ANTHROPIC_API_KEY 读取。
        // 如果没有 Key，预计会报错。但我们主要看报错信息来推断架构。
        const result = await query({
            prompt: "What is 10 + 20?",
            tools: [calculator]
        });
        console.log("Result:", result);
    } catch (e: any) {
        console.log("Error details:", e.message);
        console.log("Error structure:", Object.keys(e));
    }
}

main();
