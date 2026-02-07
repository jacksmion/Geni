import fs from 'fs/promises';
import path from 'path';
import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';

export class ListDirTool implements ITool {
    private allowedRoot: string;

    constructor(rootPath: string) {
        this.allowedRoot = path.resolve(rootPath);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'list_dir',
            description: 'List the contents of a directory. Returns a list of files and subdirectories.',
            input_schema: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Relative path to the directory'
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
                toolName: 'list_dir',
                isError: true,
                result: `Access Denied: Path '${relPath}' is outside the allowed workspace.`
            };
        }

        try {
            const items = await fs.readdir(fullPath, { withFileTypes: true });
            let result = items.map(d => `${d.isDirectory() ? '[DIR]' : '[FILE]'} ${d.name}`).join('\n');
            if (result === '') result = '(Empty Directory)';

            return {
                toolName: 'list_dir',
                isError: false,
                result: result
            };

        } catch (error: any) {
            return {
                toolName: 'list_dir',
                isError: true,
                result: `List Dir Error: ${error.message}`
            };
        }
    }
}
