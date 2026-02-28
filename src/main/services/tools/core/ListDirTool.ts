import fs from 'fs/promises';
import path from 'path';
import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';

export class ListDirTool implements ITool {
    private allowedRoot: string;
    private allowedPaths: string[];
    private readonly IGNORE_PATTERNS = new Set([
        "node_modules", "__pycache__", ".git", "dist", "build", "target", "vendor",
        "bin", "obj", ".idea", ".vscode", ".zig-cache", "zig-out", ".coverage",
        "coverage", "tmp", "temp", ".cache", "cache", "logs", ".venv", "venv", "env"
    ]);
    private readonly LIMIT = 100;

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
            name: 'list',
            description: 'List the contents of a directory. Returns a list of files and subdirectories. Automatically ignores common non-source directories (e.g. node_modules, .git).Results are truncated if they exceed 100 items.',
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

    async execute(args: any, _signal?: AbortSignal): Promise<ToolExecutionResult> {
        const { path: relPath } = args;

        // Security Check: Prevent directory traversal outside allowed paths
        let fullPath = path.isAbsolute(relPath)
            ? path.normalize(relPath)
            : path.resolve(this.allowedRoot, relPath);

        if (!this.isPathAllowed(fullPath)) {
            return {
                toolName: 'list',
                isError: true,
                result: `Access Denied: Path '${relPath}' is outside the allowed workspaces.`
            };
        }

        try {
            const items = await fs.readdir(fullPath, { withFileTypes: true });

            // 1. Filter out ignored items
            const filteredItems = items.filter(item =>
                !this.IGNORE_PATTERNS.has(item.name) && !item.name.startsWith('.')
            );

            // 2. Sort: Directories first, then files. Alphabetical within groups.
            filteredItems.sort((a, b) => {
                if (a.isDirectory() === b.isDirectory()) {
                    return a.name.localeCompare(b.name);
                }
                return a.isDirectory() ? -1 : 1;
            });

            // 3. Truncate if exceeding LIMIT
            const isTruncated = filteredItems.length > this.LIMIT;
            const displayedItems = filteredItems.slice(0, this.LIMIT);

            // 4. Format output
            let result = displayedItems.map(d => `${d.isDirectory() ? '[DIR] ' : '[FILE]'} ${d.name}`).join('\n');

            if (result === '') {
                result = '(Empty Directory)';
            } else {
                // Add summary header
                const summary = `Listing: ${relPath} (Total: ${filteredItems.length}${isTruncated ? `, Showing first ${this.LIMIT}` : ''})\n`;
                result = summary + result;

                if (isTruncated) {
                    result += `\n... (Truncated ${filteredItems.length - this.LIMIT} items. Use 'glob' to find specific files)`;
                }
            }

            return {
                toolName: 'list',
                isError: false,
                result: result
            };

        } catch (error: any) {
            return {
                toolName: 'list',
                isError: true,
                result: `List Dir Error: ${error.message}`
            };
        }
    }
}
