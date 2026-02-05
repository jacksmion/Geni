import { exec, ExecOptions } from 'child_process';
import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';
import os from 'os';

export class BashTool implements ITool {
    requireConfirmation = true;

    getDefinition(): ToolDefinition {
        const isWindows = os.platform() === 'win32';
        const shellName = isWindows ? 'PowerShell' : 'Bash';

        return {
            name: 'shell_exec', // Renamed from 'bash' to be more generic, but keeping 'bash' as alias if needed? adhering to request I'll keep it 'bash' or widely understood name. Let's keep name 'bash' for minimal friction but update desc. Actually 'shell' is better.
            // Wait, if I change name, existing prompt might break? The prompts currently use 'bash'.
            // I will keep the name 'bash' but update description.
            name: 'bash',
            description: `Execute a shell command. 
Environment: ${isWindows ? 'Windows PowerShell' : 'Linux/Mac Bash'}.
Use this to run system tools, git commands, or npm scripts.`,
            input_schema: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: 'The command line to execute'
                    },
                    cwd: {
                        type: 'string',
                        description: 'Current working directory (optional)'
                    }
                },
                required: ['command']
            }
        };
    }

    async execute(args: any): Promise<ToolExecutionResult> {
        return new Promise((resolve) => {
            const command = args.command;
            const cwd = args.cwd || process.cwd();

            // Detect OS and select appropriate shell
            const isWindows = os.platform() === 'win32';
            const shell = isWindows ? 'powershell.exe' : '/bin/bash';

            console.log(`[BashTool] Executing using ${shell}: ${command} at ${cwd}`);

            const options: ExecOptions = {
                cwd,
                shell: shell,
                maxBuffer: 10 * 1024 * 1024 // 10MB buffer
            };

            exec(command, options, (error, stdout, stderr) => {
                resolve({
                    toolName: 'bash',
                    isError: !!error,
                    result: error
                        ? `Error: ${error.message}\nStderr: ${stderr}\n(Executed via ${shell})`
                        : (stdout || stderr || 'Success (no output)'),
                    displayText: `> ${command}\n${stdout}`
                });
            });
        });
    }
}
