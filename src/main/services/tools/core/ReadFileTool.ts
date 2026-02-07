import fs from 'fs/promises';
import path from 'path';
import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';

export class ReadFileTool implements ITool {
    private allowedRoot: string;

    constructor(rootPath: string) {
        this.allowedRoot = path.resolve(rootPath);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'read_file',
            description: 'Read the contents of a file.',
            input_schema: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Relative path to the file'
                    }
                },
                required: ['path']
            }
        };
    }

    async execute(args: any): Promise<ToolExecutionResult> {
        const { path: relPath } = args;

        // Security Check: Prevent directory traversal outside root
        const fullPath = path.resolve(this.allowedRoot, relPath);
        if (!fullPath.startsWith(this.allowedRoot)) {
            return {
                toolName: 'read_file',
                isError: true,
                result: `Access Denied: Path '${relPath}' is outside the allowed workspace.`
            };
        }

        try {
            const result = await fs.readFile(fullPath, 'utf-8');
            return {
                toolName: 'read_file',
                isError: false,
                result: result
            };

        } catch (error: any) {
            return {
                toolName: 'read_file',
                isError: true,
                result: `Read File Error: ${error.message}`
            };
        }
    }
}
