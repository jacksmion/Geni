import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

export interface PythonExecutionResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
}

export class PythonBridge {
    private tempDir: string;

    constructor() {
        this.tempDir = path.join(os.tmpdir(), 'assistant-core-scripts');
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * 执行 Python 代码并返回结果
     */
    public async executeCode(code: string, timeout = 30000): Promise<PythonExecutionResult> {
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
                // 清理临时文件
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
