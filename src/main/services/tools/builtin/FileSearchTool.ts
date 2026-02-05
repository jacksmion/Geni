import fs from 'fs/promises';
import path from 'path';

import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';

// We might need to install 'glob' if not present, but let's assume standard patterns or check package.json?
// Checking package.json... I didn't verify if 'glob' is installed. 
// I'll check package.json in next step. If not, I can use a simple recursive readdir if I want to be dependency-free, 
// OR I can use fast-glob/glob if available.
// For now, I will use a simple recursive directory walker to avoid dependency hell if I don't check.
// ACTUALLY, 'glob' is a very standard tool requirement.
// Let's implement a simple naive glob/walk for now?
// No, I'll check dependencies first.
// Wait, I am writing the file now. I'll rely on a simple recursive walker for "Glob" if I can't confirm library.
// Or I can use `find` command via Bash? No, that's platform specific.
// Let's try to use a simple recursive walk for "Glob" matching using micromatch or similar if available, or just simple endsWith/includes for now?
// The user asked for "Glob". 
// Let's use `exec` to run `git ls-files` or `find` if we want powerful glob, BUT we are in Node.
// Let's implement a recursive readdir that accepts a simple pattern (like *.ts).

async function findFiles(dir: string, pattern: string): Promise<string[]> {
    let results: string[] = [];
    const list = await fs.readdir(dir, { withFileTypes: true });

    // Simple regex from glob pattern conversion
    // This is a naive implementation.
    const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');

    for (const file of list) {
        const fullPath = path.join(dir, file.name);
        const relativePath = fullPath; // We'll fix relative later

        if (file.isDirectory()) {
            if (file.name !== 'node_modules' && !file.name.startsWith('.')) {
                const subResults = await findFiles(fullPath, pattern);
                results = results.concat(subResults);
            }
        } else {
            // Check pattern against filename
            if (regex.test(file.name)) {
                results.push(fullPath);
            }
        }
    }
    return results;
}

export class FileSearchTool implements ITool {
    private allowedRoot: string;

    constructor(rootPath: string) {
        this.allowedRoot = path.resolve(rootPath);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'file_search',
            description: 'Search for files (glob) or content (grep).',
            input_schema: {
                type: 'object',
                properties: {
                    type: {
                        type: 'string',
                        enum: ['glob', 'grep'],
                        description: 'Search type: "glob" for filenames, "grep" for file content.'
                    },
                    pattern: {
                        type: 'string',
                        description: 'The glob pattern (e.g. *.ts) or regex pattern to search for.'
                    },
                    path: {
                        type: 'string',
                        description: 'Directory to search in (relative to root). Defaults to root.',
                    }
                },
                required: ['type', 'pattern']
            }
        };
    }

    async execute(args: any): Promise<ToolExecutionResult> {
        const { type, pattern, path: searchPath } = args;
        const startDir = searchPath ? path.resolve(this.allowedRoot, searchPath) : this.allowedRoot;

        if (!startDir.startsWith(this.allowedRoot)) {
            return { toolName: 'file_search', isError: true, result: 'Access Denied' };
        }

        try {
            if (type === 'glob') {
                // Implementation note: This is a simplified "name match" recursive search.
                // Real globbing (like src/**/*.ts) parses path segments. 
                // Here we just search for filename matching the pattern recursively.
                const files = await this.recursiveFind(startDir, pattern);
                const relFiles = files.map(f => path.relative(this.allowedRoot, f));
                return {
                    toolName: 'file_search',
                    isError: false,
                    result: relFiles.length ? relFiles.join('\n') : 'No matching files found.'
                };
            } else if (type === 'grep') {
                const results = await this.grepFind(startDir, pattern);
                return {
                    toolName: 'file_search',
                    isError: false,
                    result: results.length ? results.join('\n') : 'No matches found.'
                };
            }

            return { toolName: 'file_search', isError: true, result: 'Invalid search type' };
        } catch (e: any) {
            return { toolName: 'file_search', isError: true, result: e.message };
        }
    }

    private async recursiveFind(dir: string, pattern: string): Promise<string[]> {
        // Convert simple glob * to regex
        // e.g. *.ts -> .*\.ts$
        // This is VERY BASIC. Ideally we use a library.
        let regexStr = pattern
            .replace(/\./g, '\\.')
            .replace(/\*\*/g, '___GROB___') // Placeholder
            .replace(/\*/g, '[^/]*')
            .replace(/___GROB___/g, '.*');

        // If pattern doesn't start with *, match from start (?) 
        // Actually usually glob matches whole path or filename.
        // Let's assume input is like "**/*.ts" or "*.ts"

        // Strategy: Use Node's built-in `find` via child_process if linux, or walking.
        // Let's use a Walker for cross-platform safety.

        const fileList: string[] = [];
        const regex = new RegExp(regexStr); // Case sensitive?

        const walk = async (currentDir: string) => {
            const list = await fs.readdir(currentDir, { withFileTypes: true });
            for (const dirent of list) {
                const fullPath = path.join(currentDir, dirent.name);
                const relativePath = path.relative(this.allowedRoot, fullPath).replace(/\\/g, '/');

                if (dirent.isDirectory()) {
                    if (dirent.name === 'node_modules' || dirent.name.startsWith('.')) continue;
                    await walk(fullPath);
                } else {
                    // Match against relative path for full globs like src/**/*.ts
                    // Or filename for *.ts
                    if (regex.test(relativePath) || regex.test(dirent.name)) {
                        fileList.push(fullPath);
                    }
                }
            }
        };
        await walk(dir);
        return fileList;
    }

    private async grepFind(dir: string, pattern: string): Promise<string[]> {
        const regex = new RegExp(pattern);
        const matches: string[] = [];

        const walk = async (currentDir: string) => {
            const list = await fs.readdir(currentDir, { withFileTypes: true });
            for (const dirent of list) {
                const fullPath = path.join(currentDir, dirent.name);
                if (dirent.isDirectory()) {
                    if (dirent.name === 'node_modules' || dirent.name.startsWith('.')) continue;
                    await walk(fullPath);
                } else {
                    // Only check text files - minimal heuristic
                    const ext = path.extname(dirent.name).toLowerCase();
                    if (['.ts', '.js', '.json', '.md', '.txt', '.py', '.css', '.html'].includes(ext)) {
                        const content = await fs.readFile(fullPath, 'utf-8');
                        const lines = content.split('\n');
                        lines.forEach((line, index) => {
                            if (regex.test(line)) {
                                const relPath = path.relative(this.allowedRoot, fullPath);
                                matches.push(`${relPath}:${index + 1}: ${line.trim().substring(0, 100)}`);
                            }
                        });
                        if (matches.length > 200) return; // Limit results
                    }
                }
            }
        };
        await walk(dir);
        return matches;
    }
}
