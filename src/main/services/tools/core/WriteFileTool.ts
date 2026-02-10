import fs from 'fs/promises';
import path from 'path';
import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';

export class WriteFileTool implements ITool {
    private allowedRoot: string;

    constructor(rootPath: string) {
        this.allowedRoot = path.resolve(rootPath);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'write_file',
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

    async execute(args: any): Promise<ToolExecutionResult> {
        const { path: relPath, content, append = false, ignoreIfExists = false } = args;

        // Defensive Check: Ensure required arguments are present and valid
        if (typeof relPath !== 'string' || relPath.trim() === '') {
            return {
                toolName: 'write_file',
                isError: true,
                result: "Error: Missing or invalid 'path' argument. It must be a non-empty string."
            };
        }

        if (typeof content !== 'string') {
            return {
                toolName: 'write_file',
                isError: true,
                result: "Error: Missing or invalid 'content' argument. It must be a string."
            };
        }

        // Security Check: Prevent directory traversal outside root
        const fullPath = path.resolve(this.allowedRoot, relPath);
        if (!fullPath.startsWith(this.allowedRoot)) {
            return {
                toolName: 'write_file',
                isError: true,
                result: `Access Denied: Path '${relPath}' is outside the allowed workspace.`
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
                    toolName: 'write_file',
                    isError: false,
                    result: `Skipped: File '${relPath}' already exists and ignoreIfExists is true.`
                };
            }

            // 4. Idempotency Check (Only if overwriting, skipping if appending)
            if (!append && fileExists && existingContent === content) {
                return {
                    toolName: 'write_file',
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
                toolName: 'write_file',
                isError: false,
                result: `Success: ${status} at '${relPath}'`
            };

        } catch (error: any) {
            return {
                toolName: 'write_file',
                isError: true,
                result: `Write File Error: ${error.message}`
            };
        }
    }
}
