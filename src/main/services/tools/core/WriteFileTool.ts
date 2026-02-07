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
            description: 'Write content to a file. Overwrites existing content.',
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
                    }
                },
                required: ['path', 'content']
            }
        };
    }

    async execute(args: any): Promise<ToolExecutionResult> {
        const { path: relPath, content } = args;

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
            await fs.writeFile(fullPath, content, 'utf-8');
            return {
                toolName: 'write_file',
                isError: false,
                result: `Successfully wrote to ${relPath}`
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
