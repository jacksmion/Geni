import { exec, ExecOptions } from 'child_process';
import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';
import os from 'os';

/**
 * 智能解码 Buffer 为字符串，支持 UTF-8 和 Windows 下的 GBK 回退
 */
function decodeOutput(buffer: Buffer): string {
    if (!buffer || buffer.length === 0) return "";

    const isWindows = os.platform() === 'win32';

    try {
        // 首先尝试严格的 UTF-8 解码
        const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
        return utf8Decoder.decode(buffer);
    } catch (e) {
        // 如果 UTF-8 解码失败（说明包含非 UTF-8 字节，可能是 GBK）
        if (isWindows) {
            try {
                // 在 Windows 上尝试使用 GBK 解码
                const gbkDecoder = new TextDecoder('gbk');
                return gbkDecoder.decode(buffer);
            } catch (e2) {
                return buffer.toString('binary');
            }
        }
        // 非 Windows 环境下如果 UTF-8 失败，回退到非致命 UTF-8
        return buffer.toString('utf8');
    }
}

export class BashTool implements ITool {
    requireConfirmation = true;
    private allowedRoot: string;

    constructor(rootPath: string = process.cwd()) {
        this.allowedRoot = rootPath;
    }

    public setRoot(newRoot: string) {
        this.allowedRoot = newRoot;
    }

    getDefinition(): ToolDefinition {
        const isWindows = os.platform() === 'win32';
        const shellName = isWindows ? 'PowerShell' : 'Bash';

        return {
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
            const cwd = args.cwd || this.allowedRoot;

            // 检测系统并选择合适的 Shell
            const isWindows = os.platform() === 'win32';
            const shell = isWindows ? 'powershell.exe' : '/bin/bash';

            console.log(`[BashTool] Executing using ${shell}: ${command} at ${cwd}`);

            const options: ExecOptions = {
                cwd,
                shell: shell,
                maxBuffer: 10 * 1024 * 1024, // 10MB 缓冲区
                encoding: 'buffer' as any      // 关键：捕获原始字节流以支持后续转码
            };

            exec(command, options, (error, stdout, stderr) => {
                // 使用智能解码处理输出
                const decodedStdout = decodeOutput(stdout as any as Buffer);
                const decodedStderr = decodeOutput(stderr as any as Buffer);

                resolve({
                    toolName: 'bash',
                    isError: !!error,
                    result: error
                        ? `Error: ${error.message}\nStderr: ${decodedStderr}\n(Executed via ${shell})`
                        : (decodedStdout || decodedStderr || 'Success (no output)'),
                    displayText: `> ${command}\n${decodedStdout}`
                });
            });
        });
    }
}
