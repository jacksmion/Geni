import fs from 'fs/promises';
import path from 'path';
import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';

export class GlobTool implements ITool {
    private allowedRoot: string;

    constructor(rootPath: string) {
        this.allowedRoot = path.resolve(rootPath);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'glob',
            description: 'Find files matching a glob pattern (e.g., **/*.ts, src/services/*.js).',
            input_schema: {
                type: 'object',
                properties: {
                    pattern: {
                        type: 'string',
                        description: 'The glob pattern to search for.'
                    },
                    path: {
                        type: 'string',
                        description: 'Directory to search in (relative to root). Defaults to root.'
                    }
                },
                required: ['pattern']
            }
        };
    }

    async execute(args: any): Promise<ToolExecutionResult> {
        const { pattern, path: searchPath } = args;
        const startDir = searchPath ? path.resolve(this.allowedRoot, searchPath) : this.allowedRoot;

        // Security Check
        if (!startDir.startsWith(this.allowedRoot)) {
            return {
                toolName: 'glob',
                isError: true,
                result: `Access Denied: Path '${searchPath}' is outside the allowed workspace.`
            };
        }

        try {
            const files = await this.recursiveFind(startDir, pattern);

            // Format results as relative paths from root
            const relFiles = files.map(f => path.relative(this.allowedRoot, f).split(path.sep).join('/'));

            return {
                toolName: 'glob',
                isError: false,
                result: relFiles.length > 0 ? relFiles.join('\n') : 'No matching files found.'
            };

        } catch (error: any) {
            return {
                toolName: 'glob',
                isError: true,
                result: `Glob Error: ${error.message}`
            };
        }
    }

    private async recursiveFind(dir: string, pattern: string): Promise<string[]> {
        // Simple regex conversion for globs. 
        // Note: For production use, a proper library like 'micromatch' or 'glob' is recommended.
        // This implementation handles basic * and **.

        // Escape special regex chars except *
        let regexStr = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');

        // Handle ** (recursive wildcard)
        // We replace ** with a placeholder first to avoid conflicting with single * replacement
        const doubleStarPlaceholder = '___DOUBLE_STAR___';
        regexStr = regexStr.replace(/\*\*/g, doubleStarPlaceholder);

        // Handle * (single level wildcard) -> [^/]* (matches anything but separator)
        // We assume / is the separator for the pattern
        regexStr = regexStr.replace(/\*/g, '[^/]*');

        // Restore ** -> .* (matches anything)
        regexStr = regexStr.replace(new RegExp(doubleStarPlaceholder, 'g'), '.*');

        // Anchor start and end
        // Note: This regex is applied to the relative path from search root or full path? 
        // Standard glob applies to the relative structure.
        const regex = new RegExp(`^${regexStr}$`);

        const fileList: string[] = [];
        const rootDir = this.allowedRoot;

        const walk = async (currentDir: string) => {
            let list;
            try {
                list = await fs.readdir(currentDir, { withFileTypes: true });
            } catch (e) {
                // If directory doesn't exist or permission denied, skip
                return;
            }

            for (const dirent of list) {
                const fullPath = path.join(currentDir, dirent.name);
                const relativePath = path.relative(dir, fullPath).split(path.sep).join('/');

                if (dirent.isDirectory()) {
                    if (dirent.name === 'node_modules' || dirent.name.startsWith('.')) continue;

                    // Check if the directory path itself could potentially match (optimization)
                    // For now, just recurse
                    await walk(fullPath);
                } else {
                    // Check against the pattern
                    // We check the relative path from the startDir (which is what the user expects typically)
                    if (regex.test(relativePath)) {
                        fileList.push(fullPath);
                    }
                    // Also check just filename for convenience if pattern has no slashes?
                    // Standard behaviors vary. Let's stick to path matching.
                    // If user provides "*.ts", regex is "^[^/]*\.ts$" which matches "Main.ts" but not "sub/Main.ts".
                    // However, users often expect "*.ts" to find all TS files.
                    // If pattern has no slash, we might want to match basename.
                    else if (!pattern.includes('/') && regex.test(dirent.name)) {
                        fileList.push(fullPath);
                    }
                }
            }
        };

        await walk(dir);
        return fileList;
    }
}
