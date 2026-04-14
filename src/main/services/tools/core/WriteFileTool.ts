import fs from 'fs/promises';
import path from 'path';
import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';

export class WriteFileTool implements ITool {
    private allowedRoot: string;
    private allowedPaths: string[];

    constructor(rootPath: string, allowedPaths: string[] = []) {
        this.allowedRoot = path.resolve(rootPath);
        this.allowedPaths = [this.allowedRoot, ...allowedPaths.map(p => path.resolve(p))];
    }

    public setRoot(newRoot: string, allowedPaths: string[] = []) {
        this.allowedRoot = path.resolve(newRoot);
        this.allowedPaths = [this.allowedRoot, ...allowedPaths.map(p => path.resolve(p))];
    }

    protected isPathAllowed(targetPath: string): boolean {
        const normalizedTarget = path.resolve(targetPath);
        return this.allowedPaths.some(p => {
            if (process.platform === 'win32') {
                return normalizedTarget.toLowerCase().startsWith(p.toLowerCase());
            }
            return normalizedTarget.startsWith(p);
        });
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'write',
            description:
                "Write content to a file. Overwrites existing files. " +
                "For large files (>100 lines), use chunked writing: split into multiple calls with chunk_index (0-based) and set is_last_chunk=true on the final call. " +
                "Has idempotency check: skips write if content is identical. " +
                "Use append=true to append instead of overwrite.",
            input_schema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Relative path to file' },
                    content: { type: 'string', description: 'Content to write' },
                    append: { type: 'boolean', description: 'True to append instead of overwrite' },
                    ignoreIfExists: { type: 'boolean', description: 'True to skip if file exists' },
                    chunk_index: { type: 'number', description: 'Zero-based index of the current chunk. When provided, enables chunked writing mode using a temp file.' },
                    is_last_chunk: { type: 'boolean', description: 'Set to true on the final chunk to commit the temp file to the target path atomically. Required when chunk_index is set.' }
                },
                required: ['path', 'content']
            }
        };
    }

    async execute(args: any, _signal?: AbortSignal): Promise<ToolExecutionResult> {
        const { path: relPath, content, append = false, ignoreIfExists = false, chunk_index, is_last_chunk } = args;

        // Defensive Check: Ensure required arguments are present and valid
        if (typeof relPath !== 'string' || relPath.trim() === '') {
            return {
                toolName: 'write',
                isError: true,
                result: "Error: Missing or invalid 'path' argument. It must be a non-empty string."
            };
        }

        if (typeof content !== 'string') {
            return {
                toolName: 'write',
                isError: true,
                result: "Error: Missing or invalid 'content' argument. It must be a string."
            };
        }

        // Guard: Detect dehydrated placeholder content that LLM may have copied from history
        if (content.includes('DEHYDRATED:') || content.includes('<omitted ')) {
            return {
                toolName: 'write',
                isError: true,
                result: "Error: The 'content' argument contains a dehydrated placeholder from conversation history. You must provide the actual, complete file content — not a placeholder. Please regenerate the full content and try again."
            };
        }

        // Security Check: Prevent directory traversal outside allowed paths
        const fullPath = path.isAbsolute(relPath)
            ? path.normalize(relPath)
            : path.resolve(this.allowedRoot, relPath);

        if (!this.isPathAllowed(fullPath)) {
            return {
                toolName: 'write',
                isError: true,
                result: `Access Denied: Path '${relPath}' is outside the allowed workspaces.`
            };
        }

        try {
            // 1. Ensure directory exists
            const dirPath = path.dirname(fullPath);
            await fs.mkdir(dirPath, { recursive: true });

            // --- Chunked Writing Mode ---
            if (chunk_index !== undefined) {
                return await this.executeChunk(fullPath, relPath, content, chunk_index, is_last_chunk === true);
            }

            // --- Normal Writing Mode ---

            // 2. Check file state
            let fileExists = false;
            let existingContent = '';

            try {
                existingContent = await fs.readFile(fullPath, 'utf-8');
                fileExists = true;
            } catch (err: any) {
                if (err.code !== 'ENOENT') {
                    throw err;
                }
            }

            // 3. Handle ignoreIfExists
            if (ignoreIfExists && fileExists) {
                return {
                    toolName: 'write',
                    isError: false,
                    result: `Skipped: File '${relPath}' already exists and ignoreIfExists is true.`
                };
            }

            // 4. Idempotency Check
            if (!append && fileExists && existingContent === content) {
                return {
                    toolName: 'write',
                    isError: false,
                    result: `No Change: Content of '${relPath}' is identical to the input.`
                };
            }

            // 5. Perform Write Operation
            if (append) {
                await fs.appendFile(fullPath, content, 'utf-8');
            } else {
                await fs.writeFile(fullPath, content, 'utf-8');
            }

            // 6. Return Action Status
            const status = !fileExists ? 'Created new file' : (append ? 'Appended to file' : 'Updated file');
            return {
                toolName: 'write',
                isError: false,
                result: `Success: ${status} at '${relPath}'`
            };

        } catch (error: any) {
            return {
                toolName: 'write',
                isError: true,
                result: `Write File Error: ${error.message}`
            };
        }
    }

    /**
     * 分块写入：将内容写入临时文件 (.writing)，最后一块时原子 rename 到目标路径。
     */
    private async executeChunk(
        fullPath: string,
        relPath: string,
        content: string,
        chunkIndex: number,
        isLastChunk: boolean
    ): Promise<ToolExecutionResult> {
        const tempPath = `${fullPath}.writing`;

        if (chunkIndex === 0) {
            // 第一块：创建/覆盖临时文件
            await fs.writeFile(tempPath, content, 'utf-8');
        } else {
            // 后续块：追加到临时文件
            try {
                await fs.access(tempPath);
            } catch {
                return {
                    toolName: 'write',
                    isError: true,
                    result: `Chunk Error: Temp file '${relPath}.writing' not found. Did you start from chunk_index=0?`
                };
            }
            await fs.appendFile(tempPath, content, 'utf-8');
        }

        if (!isLastChunk) {
            return {
                toolName: 'write',
                isError: false,
                result: `Chunk ${chunkIndex} written to temp file. Continue with chunk_index=${chunkIndex + 1}.`
            };
        }

        // 最后一块：原子 rename temp -> target
        await fs.rename(tempPath, fullPath);
        return {
            toolName: 'write',
            isError: false,
            result: `Success: File '${relPath}' committed from ${chunkIndex + 1} chunk(s).`
        };
    }
}
