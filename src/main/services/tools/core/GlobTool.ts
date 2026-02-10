import fg from 'fast-glob';
import path from 'path';
import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';

export class GlobTool implements ITool {
    private allowedRoot: string;

    constructor(rootPath: string) {
        this.allowedRoot = path.resolve(rootPath);
    }

    public setRoot(newRoot: string) {
        this.allowedRoot = path.resolve(newRoot);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'glob',
            description: 'Find files matching a glob pattern (e.g., **/*.ts, src/services/*.js). Supports standard glob patterns including braces, negation, and wildcards. Results are sorted by modification time (newest first) and limited to top 100 matches to save context.',
            input_schema: {
                type: 'object',
                properties: {
                    pattern: {
                        type: 'string',
                        description: 'The glob pattern to search for (e.g., "src/**/*.ts", "!**/*.test.ts").'
                    },
                    path: {
                        type: 'string',
                        description: 'Directory to search in (relative to root). Defaults to root if omitted. DO NOT enter "undefined" or "null" - simply omit it for the default behavior.'
                    },
                    exclude: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Patterns to exclude (e.g., ["**/dist/**"]). Defaults to ["**/node_modules/**", "**/.git/**"].'
                    },
                    limit: {
                        type: 'number',
                        description: 'Max results to return. Default 100.'
                    }
                },
                required: ['pattern']
            }
        };
    }

    async execute(args: any, _signal?: AbortSignal): Promise<ToolExecutionResult> {
        const { pattern, path: relativeSearchPath, exclude, limit = 100 } = args;
        const searchDir = relativeSearchPath
            ? path.resolve(this.allowedRoot, relativeSearchPath)
            : this.allowedRoot;

        // Security Check
        if (!searchDir.startsWith(this.allowedRoot)) {
            return {
                toolName: 'glob',
                isError: true,
                result: `Access Denied: Path '${relativeSearchPath}' is outside the allowed workspace.`
            };
        }

        try {
            const defaultIgnore = ['**/node_modules/**', '**/.git/**'];
            const ignorePatterns = exclude ? [...defaultIgnore, ...exclude] : defaultIgnore;

            // Use fast-glob to find files
            const entries = await fg(pattern, {
                cwd: searchDir,
                ignore: ignorePatterns,
                absolute: true,
                stats: true, // Return stats to sort by mtime
                objectMode: true, // Required to get stats
                onlyFiles: true,
                dot: true // Match dotfiles (e.g. .env)
            });

            // Sort by mtime (newest first)
            entries.sort((a, b) => {
                return (b.stats?.mtimeMs || 0) - (a.stats?.mtimeMs || 0);
            });

            // Apply limit
            const limitedEntries = entries.slice(0, limit);
            const truncated = entries.length > limit;

            // Format results as relative paths from root
            // fast-glob returns forward slashes, but we use path.relative which uses OS separator.
            // We then normalize back to forward slashes for LLM consistency.
            const relFiles = limitedEntries.map(entry => {
                const rel = path.relative(this.allowedRoot, entry.path);
                return rel.split(path.sep).join('/');
            });

            let resultOutput = relFiles.length > 0 ? relFiles.join('\n') : 'No matching files found.';

            if (truncated) {
                resultOutput += `\n\n(Results are truncated. ${entries.length - limit} more files found. Consider using a more specific path or pattern.)`;
            }

            return {
                toolName: 'glob',
                isError: false,
                result: resultOutput
            };

        } catch (error: any) {
            return {
                toolName: 'glob',
                isError: true,
                result: `Glob Error: ${error.message}`
            };
        }
    }
}
