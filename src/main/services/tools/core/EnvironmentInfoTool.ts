import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';
import os from 'os';

export class EnvironmentInfoTool implements ITool {
    private cwd: string;

    constructor(cwd: string) {
        this.cwd = cwd;
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'get_env_info',
            description: 'Get information about the current environment, including current working directory, time, and OS.',
            input_schema: {
                type: 'object',
                properties: {}, // No params needed
                required: []
            }
        };
    }

    async execute(args: any, _signal?: AbortSignal): Promise<ToolExecutionResult> {
        return {
            toolName: 'get_env_info',
            isError: false,
            result: JSON.stringify({
                cwd: this.cwd,
                time: new Date().toLocaleString(),
                platform: os.platform(),
                arch: os.arch(),
                hostname: os.hostname()
            }, null, 2)
        };
    }

    // Allow updating cwd dynamically if needed (though usually fixed per session or agent run)
    setRoot(cwd: string) {
        this.cwd = cwd;
    }
}
