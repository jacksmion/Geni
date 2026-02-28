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
        return this.allowedPaths.some(p => targetPath.startsWith(p));
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'write',
            description: 'Write content to a file. Automatically creates directories. Supports append mode and idempotency checks.',
            input_schema: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Relative path to the file'
                    },
                    content: {
                        type: 'string',
                        description: 'Content to write to the file'
                    },
                    append: {
                        type: 'boolean',
                        description: 'If true, appends content to the end of the file instead of overwriting. Default is false.'
                    },
                    ignoreIfExists: {
                        type: 'boolean',
                        description: 'If true, the operation will be skipped if the file already exists. Default is false.'
                    }
                },
                required: ['path', 'content']
            }
        };
    }

    async execute(args: any, _signal?: AbortSignal): Promise<ToolExecutionResult> {
        const { path: relPath, content, append = false, ignoreIfExists = false } = args;

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
        let fullPath = path.isAbsolute(relPath)
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

            // 2. Check file state
            let fileExists = false;
            let existingContent = '';

            try {
                // Try reading to check existence and content
                existingContent = await fs.readFile(fullPath, 'utf-8');
                fileExists = true;
            } catch (err: any) {
                if (err.code !== 'ENOENT') {
                    throw err; // Re-throw unexpected errors
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

            // 4. Idempotency Check (Only if overwriting, skipping if appending)
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
}
