import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

export class PythonExecTool implements ITool {
    private tempDir: string;

    constructor() {
        this.tempDir = path.join(os.tmpdir(), 'assistant-core-scripts');
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'python_exec',
            description: 'Execute Python code. Use this for data analysis, math processing, or any task requiring Python libraries.',
            input_schema: {
                type: 'object',
                properties: {
                    code: {
                        type: 'string',
                        description: 'The Python code to execute. Print the final result to stdout.'
                    }
                },
                required: ['code']
            }
        };
    }

    async execute(args: any): Promise<ToolExecutionResult> {
        try {
            const code = args.code;
            if (!code) throw new Error('No code provided');

            const result = await this.executePythonCode(code);

            return {
                toolName: 'python_exec',
                isError: result.exitCode !== 0,
                result: result.stdout || result.stderr || 'Code executed successfully (no output).',
            };
        } catch (error: any) {
            return {
                toolName: 'python_exec',
                isError: true,
                result: error.message
            };
        }
    }

    private async executePythonCode(code: string, timeout = 30000): Promise<{ stdout: string, stderr: string, exitCode: number | null }> {
        const scriptPath = path.join(this.tempDir, `script_${Date.now()}.py`);
        fs.writeFileSync(scriptPath, code);

        return new Promise((resolve, reject) => {
            const pyProcess = spawn('python', [scriptPath]);

            let stdout = '';
            let stderr = '';

            const timer = setTimeout(() => {
                pyProcess.kill();
                reject(new Error(`Python execution timed out after ${timeout}ms`));
            }, timeout);

            pyProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            pyProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            pyProcess.on('close', (code) => {
                clearTimeout(timer);
                // Clean up temp file
                try { if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath); } catch (e) { }

                resolve({
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    exitCode: code
                });
            });

            pyProcess.on('error', (err) => {
                clearTimeout(timer);
                reject(err);
            });
        });
    }
}
