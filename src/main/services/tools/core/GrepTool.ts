import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import readline from 'readline';
import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';

interface Match {
    lineNum: number;
    content: string;
}

interface FileResult {
    filePath: string;
    mtime: number;
    matches: Match[];
}

export class GrepTool implements ITool {
    private allowedRoot: string;
    private allowedPaths: string[];
    private readonly MAX_TOTAL_MATCHES = 1000;
    private readonly MAX_LINE_LENGTH = 500;
    private readonly DEFAULT_EXTENSIONS = [
        '.ts', '.js', '.jsx', '.tsx', '.json', '.md', '.txt',
        '.html', '.css', '.scss', '.less', '.xml', '.yml', '.yaml',
        '.sql', '.py', '.java', '.c', '.cpp', '.h', '.cs', '.go',
        '.rs', '.php', '.rb', '.sh', '.bat', '.cmd', '.ps1'
    ];

    constructor(rootPath: string, allowedPaths: string[] = []) {
        this.allowedRoot = path.resolve(rootPath);
        this.allowedPaths = [this.allowedRoot, ...allowedPaths.map(p => path.resolve(p))];
    }

    public setRoot(newRoot: string, allowedPaths: string[] = []) {
        this.allowedRoot = path.resolve(newRoot);
        this.allowedPaths = [this.allowedRoot, ...allowedPaths.map(p => path.resolve(p))];
    }

    protected isPathAllowed(targetPath: string): boolean {
        const normalizedTarget = path.resolve(targetPath);
        return this.allowedPaths.some(p => {
            if (process.platform === 'win32') {
                return normalizedTarget.toLowerCase().startsWith(p.toLowerCase());
            }
            return normalizedTarget.startsWith(p);
        });
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'grep',
            description:
                "Search for string patterns in files using regex or literal strings. " +
                "By default searches common source files (js,ts,py,go,java,etc). " +
                "Use include param to specify extensions (e.g. '*.md,*.txt'). " +
                "Results are limited to 1000 matches total. " +
                "Set isRegex=true when searching with regex patterns. " +
                "If regex fails, set isRegex=false for literal string search.",
            input_schema: {
                type: 'object',
                properties: {
                    pattern: {
                        type: 'string',
                        description: 'Pattern to search for'
                    },
                    path: {
                        type: 'string',
                        description: 'Directory to search in (relative to root)'
                    },
                    include: {
                        type: 'string',
                        description: 'Comma-separated file extensions or patterns to include'
                    },
                    caseInsensitive: {
                        type: 'boolean',
                        description: 'Ignore case (default false)'
                    },
                    isRegex: {
                        type: 'boolean',
                        description: 'Treat pattern as regex (default true)'
                    }
                },
                required: ['pattern']
            }
        };
    }

    async execute(args: any, _signal?: AbortSignal): Promise<ToolExecutionResult> {
        const { pattern, path: searchPath, include, caseInsensitive = false, isRegex = true } = args;

        const startDir = searchPath
            ? (path.isAbsolute(searchPath) ? path.normalize(searchPath) : path.resolve(this.allowedRoot, searchPath))
            : this.allowedRoot;
        // Ensure startDir is within allowedRoot
        if (!this.isPathAllowed(startDir)) {
            return {
                toolName: 'grep',
                isError: true,
                result: `Access Denied: Path '${searchPath}' is outside the allowed workspaces.`
            };
        }

        try {
            // 1. Prepare Regex
            let regex: RegExp;
            const flags = caseInsensitive ? 'i' : '';
            if (isRegex) {
                try {
                    regex = new RegExp(pattern, flags);
                } catch (e: any) {
                    return {
                        toolName: 'grep',
                        isError: true,
                        result: `Invalid Regular Expression: ${e.message}. If you meant to search for a literal string, set 'isRegex' to false.`
                    };
                }
            } else {
                // Escape special regex characters for literal search
                const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                regex = new RegExp(escapedPattern, flags);
            }

            // 2. Parse inclusions
            const includePatterns = include
                ? include.split(',').map((s: string) => s.trim())
                : null;

            // 3. Find files & Grep (Concurrent buffered)
            const results = await this.searchDirectory(startDir, regex, includePatterns);

            // 4. Sort by mtime (descending)
            results.sort((a, b) => b.mtime - a.mtime);

            // 5. Format Output
            const formattedOutput = this.formatResults(results, results.length > 50); // Truncation hint if too many files

            return {
                toolName: 'grep',
                isError: false,
                result: formattedOutput
            };

        } catch (error: any) {
            return {
                toolName: 'grep',
                isError: true,
                result: `Grep Error: ${error.message}`
            };
        }
    }

    private async searchDirectory(dir: string, regex: RegExp, includePatterns: string[] | null): Promise<FileResult[]> {
        const results: FileResult[] = [];
        const filesToProcess: string[] = [];

        // Helper to collect all file paths first (BFS/DFS) or we can process in chunks. 
        // For simplicity and avoiding "open too many files", we gather paths then process in batches.

        const walk = async (currentDir: string) => {
            let entries;
            try {
                entries = await fsPromises.readdir(currentDir, { withFileTypes: true });
            } catch (e) {
                return; // Access denied or removed
            }

            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);

                if (entry.isDirectory()) {
                    // Ignore common junk
                    if (['node_modules', '.git', '.vscode', '.idea', 'dist', 'build', 'coverage'].includes(entry.name)) continue;
                    await walk(fullPath);
                } else if (entry.isFile()) {
                    if (this.shouldInclude(entry.name, includePatterns)) {
                        filesToProcess.push(fullPath);
                    }
                }
            }
        };

        await walk(dir);

        // Process files in batches to control concurrency
        const CONCURRENCY = 20;
        for (let i = 0; i < filesToProcess.length; i += CONCURRENCY) {
            const batch = filesToProcess.slice(i, i + CONCURRENCY);
            const batchResults = await Promise.all(batch.map(f => this.grepFile(f, regex)));
            for (const res of batchResults) {
                if (res && res.matches.length > 0) {
                    results.push(res);
                }
            }

            // Safety break if too many matches already?
            // Calculating total matches so far
            const currentTotal = results.reduce((sum, r) => sum + r.matches.length, 0);
            if (currentTotal >= this.MAX_TOTAL_MATCHES) break;
        }

        return results;
    }

    private shouldInclude(filename: string, patterns: string[] | null): boolean {
        // Always ignore dotfiles (unless explicitly asked? For now assume basic code search logic)
        // If pattern explicitly includes dotfile logic, we might need change. 
        // Current logic: ignore system dotfiles
        if (filename.startsWith('.') && filename !== '.gitignore' && filename !== '.env') return false;

        const lowerName = filename.toLowerCase();

        if (!patterns) {
            // Use default extensions
            return this.DEFAULT_EXTENSIONS.some(ext => lowerName.endsWith(ext));
        }

        return patterns.some(p => {
            if (p.startsWith('*')) {
                return lowerName.endsWith(p.substring(1).toLowerCase());
            }
            return lowerName.endsWith(p.toLowerCase());
        });
    }

    private async grepFile(filePath: string, regex: RegExp): Promise<FileResult | null> {
        try {
            const stats = await fsPromises.stat(filePath);
            if (stats.size > 1024 * 1024 * 5) return null; // Skip files > 5MB

            const matches: Match[] = [];
            const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });

            const rl = readline.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });

            let lineNum = 0;
            for await (const line of rl) {
                lineNum++;
                if (regex.test(line)) {
                    // Truncate overly long lines
                    let content = line.trim();
                    if (content.length > this.MAX_LINE_LENGTH) {
                        content = content.substring(0, this.MAX_LINE_LENGTH) + '...';
                    }
                    matches.push({ lineNum, content });

                    if (matches.length >= 100) break; // Limit per file
                }
            }

            if (matches.length > 0) {
                return {
                    filePath: filePath,
                    mtime: stats.mtimeMs,
                    matches
                };
            }
        } catch (e) {
            // Ignore read errors
        }
        return null;
    }

    private formatResults(results: FileResult[], truncatedFiles: boolean): string {
        if (results.length === 0) return 'No matches found.';

        const outputLines: string[] = [];
        let totalMatches = 0;

        outputLines.push(`Found matches in ${results.length} files (sorted by modified time):`);
        outputLines.push('');

        for (const fileResult of results) {
            const relPath = path.relative(this.allowedRoot, fileResult.filePath).split(path.sep).join('/');
            outputLines.push(`${relPath}:`);

            for (const match of fileResult.matches) {
                outputLines.push(`  ${match.lineNum}: ${match.content}`);
                totalMatches++;
            }
            outputLines.push(''); // Empty line between files

            if (totalMatches >= this.MAX_TOTAL_MATCHES) {
                outputLines.push(`... (Limit of ${this.MAX_TOTAL_MATCHES} total matches reached)`);
                return outputLines.join('\n');
            }
        }

        if (truncatedFiles) {
            outputLines.push('... (Some matched files were skipped due to limit)');
        }

        return outputLines.join('\n');
    }
}
