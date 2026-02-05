import fs from 'fs/promises';
import path from 'path';
import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';

export class FileSystemTool implements ITool {
    private allowedRoot: string;

    constructor(rootPath: string) {
        this.allowedRoot = path.resolve(rootPath);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'fs_tool',
            description: 'File system operations. Use this to read, write, and list files in the project.',
            input_schema: {
                type: 'object',
                properties: {
                    operation: {
                        type: 'string',
                        enum: ['list', 'read', 'write', 'mkdir'],
                        description: 'The operation to perform'
                    },
                    path: {
                        type: 'string',
                        description: 'Relative path to the file or directory'
                    },
                    content: {
                        type: 'string',
                        description: 'Content to write (only for write operation)'
                    }
                },
                required: ['operation', 'path']
            }
        };
    }

    async execute(args: any): Promise<ToolExecutionResult> {
        const { operation, path: relPath, content } = args;

        // Security Check: Prevent directory traversal outside root
        const fullPath = path.resolve(this.allowedRoot, relPath);
        if (!fullPath.startsWith(this.allowedRoot)) {
            return {
                toolName: 'fs_tool',
                isError: true,
                result: `Access Denied: Path '${relPath}' is outside the allowed workspace.`
            };
        }

        try {
            let result = '';

            switch (operation) {
                case 'list':
                    const items = await fs.readdir(fullPath, { withFileTypes: true });
                    result = items.map(d => `${d.isDirectory() ? '[DIR]' : '[FILE]'} ${d.name}`).join('\n');
                    if (result === '') result = '(Empty Directory)';
                    break;

                case 'read':
                    result = await fs.readFile(fullPath, 'utf-8');
                    break;

                case 'write':
                    if (content === undefined) throw new Error('Content is required for write operation');
                    await fs.writeFile(fullPath, content, 'utf-8');
                    result = `Successfully wrote to ${relPath}`;
                    break;

                case 'mkdir':
                    await fs.mkdir(fullPath, { recursive: true });
                    result = `Created directory ${relPath}`;
                    break;

                default:
                    throw new Error(`Unknown operation: ${operation}`);
            }

            return {
                toolName: 'fs_tool',
                isError: false,
                result: result
            };

        } catch (error: any) {
            return {
                toolName: 'fs_tool',
                isError: true,
                result: `FS Error: ${error.message}`
            };
        }
    }
}
