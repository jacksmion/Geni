import fs from 'fs/promises';
import path from 'path';
import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';

export class GrepTool implements ITool {
    private allowedRoot: string;

    constructor(rootPath: string) {
        this.allowedRoot = path.resolve(rootPath);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'grep',
            description: 'Search for a string pattern in files (content search).',
            input_schema: {
                type: 'object',
                properties: {
                    pattern: {
                        type: 'string',
                        description: 'The regex or string pattern to search for in file content.'
                    },
                    path: {
                        type: 'string',
                        description: 'Directory to search in (relative to root). Defaults to root.'
                    },
                    include: {
                        type: 'string',
                        description: 'Comma-separated list of file extensions to include (e.g., "ts,js,json"). Defaults to common text files.'
                    }
                },
                required: ['pattern']
            }
        };
    }

    async execute(args: any): Promise<ToolExecutionResult> {
        const { pattern, path: searchPath, include } = args;
        const startDir = searchPath ? path.resolve(this.allowedRoot, searchPath) : this.allowedRoot;

        // Security Check
        if (!startDir.startsWith(this.allowedRoot)) {
            return {
                toolName: 'grep',
                isError: true,
                result: `Access Denied: Path '${searchPath}' is outside the allowed workspace.`
            };
        }

        try {
            // Parse include extensions
            let extensions = ['.ts', '.js', '.jsx', '.tsx', '.json', '.md', '.txt', '.py', '.css', '.html', '.yml', '.yaml'];
            if (include) {
                extensions = include.split(',').map((ext: string) => ext.trim().startsWith('.') ? ext.trim() : `.${ext.trim()}`);
            }

            const results = await this.grepFind(startDir, pattern, extensions);

            return {
                toolName: 'grep',
                isError: false,
                result: results.length > 0 ? results.join('\n') : 'No matches found.'
            };

        } catch (error: any) {
            return {
                toolName: 'grep',
                isError: true,
                result: `Grep Error: ${error.message}`
            };
        }
    }

    private async grepFind(dir: string, pattern: string, extensions: string[]): Promise<string[]> {
        const regex = new RegExp(pattern); // We assume simple regex for now. Flag 'm' or 'g'? Usually just default.
        const matches: string[] = [];
        const MAX_MATCHES = 500; // Safety limit

        const walk = async (currentDir: string) => {
            if (matches.length >= MAX_MATCHES) return;

            let list;
            try {
                list = await fs.readdir(currentDir, { withFileTypes: true });
            } catch (e) {
                return;
            }

            for (const dirent of list) {
                if (matches.length >= MAX_MATCHES) return;

                const fullPath = path.join(currentDir, dirent.name);

                if (dirent.isDirectory()) {
                    if (dirent.name === 'node_modules' || dirent.name.startsWith('.')) continue;
                    await walk(fullPath);
                } else {
                    const ext = path.extname(dirent.name).toLowerCase();
                    if (extensions.includes(ext)) {
                        try {
                            const content = await fs.readFile(fullPath, 'utf-8');
                            const lines = content.split('\n');

                            // Check first if the whole file might match to save per-line time? 
                            // Regex.test(content) might be faster but we need line numbers.

                            for (let i = 0; i < lines.length; i++) {
                                const line = lines[i];
                                if (regex.test(line)) {
                                    const relPath = path.relative(this.allowedRoot, fullPath).split(path.sep).join('/');
                                    // Limit line length for output
                                    const truncatedLine = line.trim().substring(0, 100);
                                    matches.push(`${relPath}:${i + 1}: ${truncatedLine}`);

                                    // Should we limit matches per file? Maybe not.
                                }
                            }
                        } catch (err) {
                            // Ignore read errors
                        }
                    }
                }
            }
        };

        await walk(dir);

        if (matches.length >= MAX_MATCHES) {
            matches.push(`... (Limit of ${MAX_MATCHES} matches reached)`);
        }

        return matches;
    }
}
