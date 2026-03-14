import fs from 'fs/promises';
import { Stats } from 'fs';
import path from 'path';
import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';

export class ReadFileTool implements ITool {
    private allowedRoot: string;
    private allowedPaths: string[];

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
            name: 'read',
            description: 'Read the contents of a file.',
            input_schema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path to file' },
                    start_line: { type: 'integer', description: 'Start line (1-indexed)' },
                    end_line: { type: 'integer', description: 'End line (inclusive)' },
                    with_line_numbers: { type: 'boolean', description: 'Include line numbers' }
                },
                required: ['path']
            }
        };
    }

    async execute(args: any, _signal?: AbortSignal): Promise<ToolExecutionResult> {
        const { path: relPath, start_line, end_line, with_line_numbers } = args;

        // Defensive Check: Ensure required path argument is present and valid
        if (typeof relPath !== 'string' || relPath.trim() === '') {
            return {
                toolName: 'read',
                isError: true,
                result: "Error: Missing or invalid 'path' argument. It must be a non-empty string."
            };
        }

        // Configuration constants
        const MAX_TOTAL_BYTES = 50 * 1024; // 50KB strict limit for output
        const MAX_LINE_LENGTH = 1000; // Truncate lines longer than this
        const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB file size limit to attempt reading

        // 1. Path Resolution & Security
        // Resolve path: supports both relative to root and absolute paths (if inside root)
        const fullPath = path.isAbsolute(relPath)
            ? path.normalize(relPath)
            : path.resolve(this.allowedRoot, relPath);

        // Security Check: Prevent directory traversal outside allowed paths
        if (!this.isPathAllowed(fullPath)) {
            return {
                toolName: 'read',
                isError: true,
                result: `Access Denied: Path '${relPath}' is outside the allowed workspaces.`
            };
        }

        try {
            // 2. Existence & Stats Check with Fuzzy Matching
            let stats: Stats;
            try {
                stats = await fs.stat(fullPath);
            } catch (error: any) {
                if (error.code === 'ENOENT') {
                    // Fuzzy matching suggestion
                    const dir = path.dirname(fullPath);
                    const base = path.basename(fullPath);
                    try {
                        const dirEntries = await fs.readdir(dir);
                        const suggestions = dirEntries
                            .filter(entry =>
                                entry.toLowerCase().includes(base.toLowerCase()) ||
                                base.toLowerCase().includes(entry.toLowerCase())
                            )
                            .slice(0, 3);

                        if (suggestions.length > 0) {
                            return {
                                toolName: 'read',
                                isError: true,
                                result: `File not found: '${relPath}'.\nDid you mean one of these?\n${suggestions.map(s => `- ${s}`).join('\n')}`
                            };
                        }
                    } catch (e) {
                        // Ignore directory read errors, just return generic not found
                    }
                    return {
                        toolName: 'read',
                        isError: true,
                        result: `File not found: '${relPath}'`
                    };
                }
                throw error;
            }

            if (!stats.isFile()) {
                return {
                    toolName: 'read',
                    isError: true,
                    result: `Error: '${relPath}' is not a file.`
                };
            }

            // 3. Size Check (Fail fast for massive files)
            if (stats.size > MAX_FILE_SIZE) {
                return {
                    toolName: 'read',
                    isError: true,
                    result: `Error: File is too large (${(stats.size / 1024 / 1024).toFixed(2)}MB). Max size is 10MB.`
                };
            }

            // 4. Binary Check (Extension + Content)
            if (this.isBinaryExtension(fullPath)) {
                return {
                    toolName: 'read',
                    isError: true,
                    result: `Error: Cannot read binary file extension: ${path.extname(fullPath)}`
                };
            }

            // Read buffer
            const buffer = await fs.readFile(fullPath);

            // Content-based binary check (NULL bytes or high non-printable ratio)
            if (this.isBinaryContent(buffer)) {
                return {
                    toolName: 'read',
                    isError: true,
                    result: `Error: File appears to be binary and cannot be read as text.`
                };
            }

            const content = buffer.toString('utf-8');
            const lines = content.split(/\r?\n/);
            const totalLines = lines.length;

            if (totalLines === 0) {
                return {
                    toolName: 'read',
                    isError: false,
                    result: `<file path="${relPath}">\n[Empty File]\n</file>`
                };
            }

            // 5. Handle Slice & Pagination & Byte Limiting
            let start = 1;
            let end = totalLines; // Default to reading until end or limit hit

            if (typeof start_line === 'number') {
                start = Math.max(1, start_line);
            }
            if (typeof end_line === 'number') {
                end = Math.min(totalLines, end_line);
            }
            // If no range specified and file huge, default to first 2000 lines
            // (But byte limit usually kicks in first)
            if (!start_line && !end_line && totalLines > 2000) {
                end = 2000;
            }

            if (start > end) {
                return {
                    toolName: 'read',
                    isError: true,
                    result: `Error: start_line (${start}) cannot be greater than end_line (${end}).`
                };
            }

            const processedLines: string[] = [];
            let currentBytes = 0;
            let truncatedByBytes = false;
            let lastProcessedLineNum = start - 1;

            // Loop and build output respecting limits
            for (let i = start - 1; i < end; i++) {
                let line = lines[i];

                // Truncate long lines to prevent minified file issues
                if (line.length > MAX_LINE_LENGTH) {
                    line = line.substring(0, MAX_LINE_LENGTH) + '...[line truncated]';
                }

                // Prepare output line string
                let outputLine = line;
                if (with_line_numbers) {
                    const lineNum = i + 1;
                    // Dynamic padding based on total lines for alignment
                    const padding = String(totalLines).length;
                    outputLine = `${String(lineNum).padStart(padding, ' ')} | ${line}`;
                }

                const lineBytes = Buffer.byteLength(outputLine, 'utf-8') + 1; // +1 for newline

                if (currentBytes + lineBytes > MAX_TOTAL_BYTES) {
                    truncatedByBytes = true;
                    break;
                }

                processedLines.push(outputLine);
                currentBytes += lineBytes;
                lastProcessedLineNum = i + 1;
            }

            // 6. Final Assembly with XML wrapping
            let output = `<file path="${relPath}">\n`;
            output += processedLines.join('\n');

            // Add informative footer
            const hasMoreLines = totalLines > lastProcessedLineNum;

            if (truncatedByBytes) {
                output += `\n\n... [Output truncated at ${MAX_TOTAL_BYTES / 1024}KB to prevent overflow]\n`;
                output += `... [Read lines ${start}-${lastProcessedLineNum} of ${totalLines}. Use start_line=${lastProcessedLineNum + 1} to read more]`;
            } else if (hasMoreLines) {
                output += `\n\n... [Lines ${lastProcessedLineNum + 1}-${totalLines} omitted]\n`;
                output += `... [Use start_line=${lastProcessedLineNum + 1} to read more]`;
            } else if (start > 1) {
                output += `\n\n... [End of file. Showing lines ${start}-${lastProcessedLineNum} of ${totalLines}]`;
            } else {
                // Fully read, small file
                output += `\n</file>`; // Close tag naturally
                // Or if strict XML structure preferred:
            }

            // Closing tag if not already arguably closed or just strictly wrap everything
            if (!output.endsWith('</file>')) {
                output += `\n</file>`;
            }

            return {
                toolName: 'read',
                isError: false,
                result: output
            };

        } catch (error: any) {
            return {
                toolName: 'read',
                isError: true,
                result: `Read File Error: ${error.message}`
            };
        }
    }

    private isBinaryExtension(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        const binaryExts = [
            '.zip', '.tar', '.gz', '.rar', '.7z',
            '.exe', '.dll', '.so', '.dylib', '.bin',
            '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp',
            '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
            '.class', '.pyc', '.pyo', '.o', '.obj', '.a', '.lib',
            '.sqlite', '.db', '.DS_Store'
        ];
        return binaryExts.includes(ext);
    }

    private isBinaryContent(buffer: Buffer): boolean {
        // Check for null bytes in the first 1000 bytes
        const sampleSize = Math.min(1000, buffer.length);
        if (sampleSize === 0) return false;

        const sample = buffer.slice(0, sampleSize);
        if (sample.includes(0)) return true; // Null byte check

        // Heuristic: Check for high ratio of non-printable characters (excluding common whitespace)
        let nonPrintableCount = 0;
        for (const byte of sample) {
            // Check for non-printable characters (ASCII < 32) except tabs (9), newlines (10), carriage returns (13)
            // Also consider extended ASCII (127+) as potential binary in some contexts, 
            // but UTF-8 text files use them. So we stick to control characters.
            if ((byte < 32) && (byte !== 9) && (byte !== 10) && (byte !== 13)) {
                nonPrintableCount++;
            }
        }

        // If > 20% of characters are non-printable control chars, likely binary
        return (nonPrintableCount / sampleSize) > 0.2;
    }
}
