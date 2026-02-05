import fs from 'fs/promises';
import path from 'path';
import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';

export class FileEditTool implements ITool {
    private allowedRoot: string;

    constructor(rootPath: string) {
        this.allowedRoot = path.resolve(rootPath);
    }

    public setRoot(newRoot: string) {
        this.allowedRoot = path.resolve(newRoot);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'edit_file',
            description: 'Edit a file by replacing a target string with a new string. Use this for precise code modifications without rewriting the whole file.',
            input_schema: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Relative path to the file'
                    },
                    target: {
                        type: 'string',
                        description: 'The exact string segment to replace. Must be unique in the file to avoid ambiguity.'
                    },
                    replacement: {
                        type: 'string',
                        description: 'The new string to insert in place of the target.'
                    }
                },
                required: ['path', 'target', 'replacement']
            }
        };
    }

    async execute(args: any): Promise<ToolExecutionResult> {
        const { path: relPath, target, replacement } = args;

        const fullPath = path.resolve(this.allowedRoot, relPath);
        if (!fullPath.startsWith(this.allowedRoot)) {
            return {
                toolName: 'edit_file',
                isError: true,
                result: `Access Denied: Path '${relPath}' is outside the allowed workspace.`
            };
        }

        try {
            if (!target) throw new Error('Target string is empty');

            const content = await fs.readFile(fullPath, 'utf-8');

            // Check occurrence count to prevent accidental multi-replace if not intended
            // For now, we'll do a simple replace first occurrence or check uniqueness.
            // Let's enforce uniqueness for safety, or just replace first.
            // 'replace' only replaces the first occurrence by default in JS/TS strings unless global regex is used.

            if (!content.includes(target)) {
                return {
                    toolName: 'edit_file',
                    isError: true,
                    result: `Error: Target string not found in file: ${relPath}`
                };
            }

            // Ideally we check if it appears multiple times
            const occurrences = content.split(target).length - 1;
            if (occurrences > 1) {
                return {
                    toolName: 'edit_file',
                    isError: true,
                    result: `Error: Target string appears ${occurrences} times. Please provide a more unique target context.`
                };
            }

            const newContent = content.replace(target, replacement);
            await fs.writeFile(fullPath, newContent, 'utf-8');

            return {
                toolName: 'edit_file',
                isError: false,
                result: `Successfully modified ${relPath}`
            };

        } catch (error: any) {
            return {
                toolName: 'edit_file',
                isError: true,
                result: `Edit Error: ${error.message}`
            };
        }
    }
}
