import { spawn, execFileSync } from 'child_process';
import { StringDecoder } from 'string_decoder';
import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';

/**
 * 智能解码 Buffer 为字符串，支持 UTF-8 和 Windows 下 GBK 回退
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

/**
 * 移除字符串中的 ANSI 转义序列（如颜色代码），防止 UI 显示乱码
 */
function stripAnsi(text: string): string {
    const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
    return text.replace(ansiRegex, '');
}

interface ResolvedShell {
    shell: string;
    args: (command: string) => string[];
}

/**
 * 解析 Windows 上可用的 Shell，按优先级尝试：
 * 1. pwsh.exe (PowerShell 7+)
 * 2. powershell.exe (完整绝对路径，Windows PowerShell 5.x)
 * 3. cmd.exe (最终回退)
 */
function resolveWindowsShell(): ResolvedShell {
    // 1. 尝试 pwsh.exe (PowerShell 7+)，通过 where 命令查找
    try {
        const pwshPath = execFileSync('where.exe', ['pwsh.exe'], {
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
            windowsHide: true,
            timeout: 3000
        }).trim().split(/\r?\n/)[0];

        if (pwshPath && fs.existsSync(pwshPath)) {
            return {
                shell: pwshPath,
                args: (cmd) => ['-NoProfile', '-Command', `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; ${cmd}`]
            };
        }
    } catch { /* pwsh not found, continue */ }

    // 2. 使用完整路径的 powershell.exe (Windows PowerShell 5.x)
    const systemRoot = process.env.SystemRoot || 'C:\\Windows';
    const psFullPath = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    if (fs.existsSync(psFullPath)) {
        return {
            shell: psFullPath,
            args: (cmd) => ['-NoProfile', '-Command', `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; ${cmd}`]
        };
    }

    // 3. 最终回退到 cmd.exe
    const cmdPath = path.join(systemRoot, 'System32', 'cmd.exe');
    return {
        shell: fs.existsSync(cmdPath) ? cmdPath : 'cmd.exe',
        args: (cmd) => ['/c', `chcp 65001>nul && ${cmd}`]
    };
}

// 缓存解析结果，避免每次命令执行都重新查找
let cachedWindowsShell: ResolvedShell | null = null;

function getWindowsShell(): ResolvedShell {
    if (!cachedWindowsShell) {
        cachedWindowsShell = resolveWindowsShell();
    }
    return cachedWindowsShell;
}

export class BashTool implements ITool {
    requireConfirmation = true;
    private allowedRoot: string;
    private allowedPaths: string[];
    private currentCwd: string;

    // Configuration
    private readonly MAX_OUTPUT_LENGTH = 50 * 1024; // 50KB
    private readonly OUTPUT_TRUNCATE_HEAD = 10 * 1024;
    private readonly OUTPUT_TRUNCATE_TAIL = 10 * 1024;
    private readonly DEFAULT_TIMEOUT = 60 * 1000;

    constructor(rootPath: string = process.cwd(), allowedPaths: string[] = []) {
        this.allowedRoot = path.resolve(rootPath);
        this.allowedPaths = [this.allowedRoot, ...allowedPaths.map(p => path.resolve(p))];
        this.currentCwd = this.allowedRoot;
    }

    public setRoot(newRoot: string, allowedPaths: string[] = []) {
        this.allowedRoot = path.resolve(newRoot);
        this.allowedPaths = [this.allowedRoot, ...allowedPaths.map(p => path.resolve(p))];
        // Reset CWD to new root to ensure safety/consistency
        this.currentCwd = this.allowedRoot;
    }

    protected isPathAllowed(targetPath: string): boolean {
        return this.allowedPaths.some(p => targetPath.startsWith(p));
    }

    getDefinition(): ToolDefinition {
        const isWindows = os.platform() === 'win32';

        return {
            name: 'bash',
            description: `Execute a shell command with persistent working directory support.`,
            input_schema: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: 'The command line to execute'
                    },
                    cwd: {
                        type: 'string',
                        description: 'Optional. Override working directory for this execution. If not provided, uses the current persistent directory.'
                    },
                    timeout: {
                        type: 'number',
                        description: 'Optional. Timeout in milliseconds (default: 60000). Set to 0 to disable.'
                    }
                },
                required: ['command']
            }
        };
    }

    async execute(args: any, signal?: AbortSignal, onStream?: (chunk: string) => void): Promise<ToolExecutionResult> {
        const Schema = z.object({
            command: z.string(),
            cwd: z.string().optional(),
            timeout: z.number().optional()
        });

        const parseResult = Schema.safeParse(args);
        if (!parseResult.success) {
            return {
                toolName: 'bash',
                isError: true,
                result: `Invalid arguments: ${parseResult.error.issues.map(i => i.message).join(', ')}`
            };
        }

        const { command, cwd, timeout } = parseResult.data;
        const effectiveTimeout = timeout ?? this.DEFAULT_TIMEOUT;

        // Determine effective CWD
        let effectiveCwd = this.currentCwd;
        if (cwd) {
            effectiveCwd = path.resolve(this.currentCwd, cwd);
            if (!this.isPathAllowed(effectiveCwd)) {
                return {
                    toolName: 'bash',
                    isError: true,
                    result: `Access Denied: cwd '${cwd}' is outside the allowed workspaces.`
                };
            }
        }

        // Handle 'cd' commands to update state
        // Simple heuristic: if command starts with 'cd ', we update the internal state
        // This allows agents to "explore" the filesystem naturally
        if (command.trim().startsWith('cd ')) {
            const targetPath = command.trim().substring(3).trim();
            if (targetPath) {
                try {
                    const newPath = path.resolve(effectiveCwd, targetPath);
                    if (!this.isPathAllowed(newPath)) {
                        return {
                            toolName: 'bash',
                            isError: true,
                            result: `Access Denied: Path '${targetPath}' is outside the allowed workspaces.`
                        };
                    }
                    // In a real implementation, we should check if dir exists using fs.stat
                    // For now, we assume it exists and let the next command fail if it doesn't
                    this.currentCwd = newPath;
                    return {
                        toolName: 'bash',
                        isError: false,
                        result: `Directory changed to ${this.currentCwd}`,
                        displayText: `> ${command}\nDirectory changed to ${this.currentCwd}`
                    };
                } catch (e: any) {
                    return {
                        toolName: 'bash',
                        isError: true,
                        result: `Failed to change directory: ${e.message}`
                    };
                }
            }
        }

        return this.runCommand(command, effectiveCwd, effectiveTimeout, signal, onStream);
    }

    private runCommand(command: string, cwd: string, timeout: number, signal?: AbortSignal, onStream?: (chunk: string) => void): Promise<ToolExecutionResult> {
        return new Promise((resolve) => {
            const isWindows = os.platform() === 'win32';

            // 解析 Shell 和参数
            let shellExe: string;
            let shellArgs: string[];

            if (isWindows) {
                const resolved = getWindowsShell();
                shellExe = resolved.shell;
                shellArgs = resolved.args(command);
            } else {
                shellExe = '/bin/bash';
                shellArgs = ['-c', command];
            }

            const child = spawn(shellExe, shellArgs, {
                cwd,
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true,
                env: process.env // 显式传递环境变量，防止丢失 PATH
            });

            const stdoutChunks: Buffer[] = [];
            const stderrChunks: Buffer[] = [];
            let timedOut = false;
            let aborted = false;

            const stdoutDecoder = new StringDecoder('utf8');
            const stderrDecoder = new StringDecoder('utf8');

            // Collect output
            child.stdout.on('data', (chunk: Buffer) => {
                stdoutChunks.push(chunk);
                if (onStream) onStream(stdoutDecoder.write(chunk));
            });
            child.stderr.on('data', (chunk: Buffer) => {
                stderrChunks.push(chunk);
                if (onStream) onStream(stderrDecoder.write(chunk));
            });

            // Setup abort listener
            const abortHandler = () => {
                aborted = true;
                child.kill();
                resolve({
                    toolName: 'bash',
                    isError: true,
                    result: 'Command aborted by user.'
                });
            };

            if (signal) {
                if (signal.aborted) {
                    abortHandler();
                    return;
                }
                signal.addEventListener('abort', abortHandler, { once: true });
            }

            // Setup timeout
            let timer: NodeJS.Timeout | undefined;
            if (timeout > 0) {
                timer = setTimeout(() => {
                    timedOut = true;
                    child.kill();
                }, timeout);
            }

            child.on('close', (code) => {
                if (timer) clearTimeout(timer);
                if (signal) signal.removeEventListener('abort', abortHandler);

                if (aborted) return; // Already resolved in abortHandler

                if (timedOut) {
                    resolve({
                        toolName: 'bash',
                        isError: true,
                        result: `Error: Command timed out after ${timeout}ms.`
                    });
                    return;
                }

                const stdoutBuffer = Buffer.concat(stdoutChunks);
                const stderrBuffer = Buffer.concat(stderrChunks);

                let stdoutStr = stripAnsi(decodeOutput(stdoutBuffer));
                let stderrStr = stripAnsi(decodeOutput(stderrBuffer));

                // Truncate logic
                if (stdoutStr.length > this.MAX_OUTPUT_LENGTH) {
                    stdoutStr = stdoutStr.substring(0, this.OUTPUT_TRUNCATE_HEAD)
                        + `\n... [Output truncated, ${stdoutStr.length - this.MAX_OUTPUT_LENGTH} chars omitted] ...\n`
                        + stdoutStr.substring(stdoutStr.length - this.OUTPUT_TRUNCATE_TAIL);
                }

                if (stderrStr.length > this.MAX_OUTPUT_LENGTH) {
                    stderrStr = stderrStr.substring(0, this.OUTPUT_TRUNCATE_HEAD)
                        + `\n... [Error output truncated] ...\n`
                        + stderrStr.substring(stderrStr.length - this.OUTPUT_TRUNCATE_TAIL);
                }

                const isError = code !== 0;
                let output = "";
                if (stdoutStr) output += `[stdout]:\n${stdoutStr}\n`;
                if (stderrStr) output += `[stderr]:\n${stderrStr}\n`;
                if (isError) output += `[Exit Code]: ${code}`;

                if (!output) output = "Success (No output)";

                resolve({
                    toolName: 'bash',
                    isError: isError,
                    result: output.trim(),
                    displayText: `> ${command}\n${output.trim()}`
                });
            });

            child.on('error', (err) => {
                if (timer) clearTimeout(timer);
                if (signal) signal.removeEventListener('abort', abortHandler);
                if (aborted) return;
                resolve({
                    toolName: 'bash',
                    isError: true,
                    result: `Failed to spawn process: ${err.message}`
                });
            });
        });
    }
}
