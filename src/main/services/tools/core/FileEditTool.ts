import fs from 'fs/promises';
import path from 'path';
import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';

export class FileEditTool implements ITool {
    private allowedRoot: string;

    constructor(rootPath: string) {
        this.allowedRoot = path.resolve(rootPath);
    }

    public setRoot(newRoot: string) {
        this.allowedRoot = path.resolve(newRoot);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'edit_file',
            description: 'Edit a file by replacing a target string with a new string. This tool uses multiple strategies (exact match, trimmed match, fuzzy block match) to locate the target string, making it robust against minor formatting differences.',
            input_schema: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Relative path to the file'
                    },
                    target: {
                        type: 'string',
                        description: 'The exact string segment to replace. Must be unique in the file to avoid ambiguity.'
                    },
                    replacement: {
                        type: 'string',
                        description: 'The new string to insert in place of the target.'
                    },
                    replaceAll: {
                        type: 'boolean',
                        description: 'If true, replace all occurrences of the target string. Default is false.'
                    }
                },
                required: ['path', 'target', 'replacement']
            }
        };
    }

    async execute(args: any): Promise<ToolExecutionResult> {
        const { path: relPath, target, replacement, replaceAll } = args;

        const fullPath = path.resolve(this.allowedRoot, relPath);
        if (!fullPath.startsWith(this.allowedRoot)) {
            return {
                toolName: 'edit_file',
                isError: true,
                result: `Access Denied: Path '${relPath}' is outside the allowed workspace.`
            };
        }

        try {
            if (!target) throw new Error('Target string is empty');
            if (target === replacement) throw new Error('Target and replacement are identical');

            let content = await fs.readFile(fullPath, 'utf-8');

            // Use the robust replacement logic
            const newContent = replace(content, target, replacement, replaceAll);

            if (content === newContent) {
                // Should be caught by replace throwing error if not found, but double check
                return {
                    toolName: 'edit_file',
                    isError: true,
                    result: `Error: Target string not found in file: ${relPath}`
                };
            }

            await fs.writeFile(fullPath, newContent, 'utf-8');

            const diff = generateDiff(content, newContent, relPath);

            return {
                toolName: 'edit_file',
                isError: false,
                result: `Successfully modified ${relPath}\n\nDiff:\n${diff}`
            };

        } catch (error: any) {
            return {
                toolName: 'edit_file',
                isError: true,
                result: `Edit Error: ${error.message}`
            };
        }
    }
}

// --- Robust Replacement Logic (Adapted from Cline/Gemini-CLI) ---

type Replacer = (content: string, find: string) => Generator<string, void, unknown>;

// Similarity thresholds for block anchor fallback matching
const SINGLE_CANDIDATE_SIMILARITY_THRESHOLD = 0.0;
const MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD = 0.3;

/**
 * Levenshtein distance algorithm implementation
 */
function levenshtein(a: string, b: string): number {
    if (a === "" || b === "") {
        return Math.max(a.length, b.length);
    }
    const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
        Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
        }
    }
    return matrix[a.length][b.length];
}

/**
 * Lightweight Diff Generator
 * Generates a simple unified diff-like string showing changes.
 * Context lines are added for clarity.
 */
function generateDiff(original: string, modified: string, filepath: string): string {
    const originalLines = original.split(/\r?\n/);
    const modifiedLines = modified.split(/\r?\n/);

    let diff = `--- ${filepath}\n+++ ${filepath}\n`;
    let hunkStarted = false;
    let originalIndex = 0;
    let modifiedIndex = 0;

    // Simple line-by-line comparison (not a full Myers diff algorithm, but sufficient for small edits)
    // We look for the first difference and the last difference to show the changed block.

    let startChange = -1;
    let endChangeOriginal = -1;
    let endChangeModified = -1;

    // Find start of change
    while (originalIndex < originalLines.length && modifiedIndex < modifiedLines.length) {
        if (originalLines[originalIndex] !== modifiedLines[modifiedIndex]) {
            startChange = originalIndex;
            break;
        }
        originalIndex++;
        modifiedIndex++;
    }

    // If no change found (should not happen if check elsewhere passes), return empty
    if (startChange === -1 && originalLines.length === modifiedLines.length) return "";

    // Find end of change from the bottom
    let originalEnd = originalLines.length - 1;
    let modifiedEnd = modifiedLines.length - 1;

    while (originalEnd >= startChange && modifiedEnd >= modifiedIndex) { // corrected loop condition
        if (originalLines[originalEnd] !== modifiedLines[modifiedEnd]) {
            break;
        }
        originalEnd--;
        modifiedEnd--;
    }

    endChangeOriginal = originalEnd;
    endChangeModified = modifiedEnd;

    // Add context (3 lines before)
    const contextStart = Math.max(0, startChange - 3);
    if (contextStart > 0) diff += "...\n";

    for (let i = contextStart; i < startChange; i++) {
        diff += ` ${originalLines[i]}\n`;
    }

    // Output deletions
    for (let i = startChange; i <= endChangeOriginal; i++) {
        diff += `-${originalLines[i]}\n`;
    }

    // Output additions
    const startInsert = startChange;
    // Important: The indices between original and modified have shifted. 
    // We need to print the modified lines corresponding to the change block.
    // The modified block starts at 'startChange' (since we walked together until then)
    // and ends at 'modifiedEnd'.
    for (let i = startChange; i <= endChangeModified; i++) {
        diff += `+${modifiedLines[i]}\n`;
    }

    // Add context (3 lines after)
    const contextEnd = Math.min(modifiedLines.length, endChangeModified + 4);
    for (let i = endChangeModified + 1; i < contextEnd; i++) {
        diff += ` ${modifiedLines[i]}\n`;
    }
    if (contextEnd < modifiedLines.length) diff += "...\n";

    return diff;
}


const SimpleReplacer: Replacer = function* (_content, find) {
    yield find;
};

const LineTrimmedReplacer: Replacer = function* (content, find) {
    const originalLines = content.split("\n");
    const searchLines = find.split("\n");

    if (searchLines[searchLines.length - 1] === "") {
        searchLines.pop();
    }

    for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
        let matches = true;

        for (let j = 0; j < searchLines.length; j++) {
            const originalTrimmed = originalLines[i + j].trim();
            const searchTrimmed = searchLines[j].trim();

            if (originalTrimmed !== searchTrimmed) {
                matches = false;
                break;
            }
        }

        if (matches) {
            let matchStartIndex = 0;
            for (let k = 0; k < i; k++) {
                matchStartIndex += originalLines[k].length + 1; // +1 for newline
            }

            let matchEndIndex = matchStartIndex;
            for (let k = 0; k < searchLines.length; k++) {
                matchEndIndex += originalLines[i + k].length;
                if (k < searchLines.length - 1) {
                    matchEndIndex += 1; // Add newline character except for the last line
                }
            }

            yield content.substring(matchStartIndex, matchEndIndex);
        }
    }
};

const BlockAnchorReplacer: Replacer = function* (content, find) {
    const originalLines = content.split("\n");
    const searchLines = find.split("\n");

    if (searchLines.length < 3) {
        return;
    }

    if (searchLines[searchLines.length - 1] === "") {
        searchLines.pop();
    }

    const firstLineSearch = searchLines[0].trim();
    const lastLineSearch = searchLines[searchLines.length - 1].trim();
    const searchBlockSize = searchLines.length;

    // Collect all candidate positions where both anchors match
    const candidates: Array<{ startLine: number; endLine: number }> = [];
    for (let i = 0; i < originalLines.length; i++) {
        if (originalLines[i].trim() !== firstLineSearch) {
            continue;
        }

        // Look for the matching last line after this first line
        for (let j = i + 2; j < originalLines.length; j++) {
            if (originalLines[j].trim() === lastLineSearch) {
                candidates.push({ startLine: i, endLine: j });
                break; // Only match the first occurrence of the last line
            }
        }
    }

    if (candidates.length === 0) {
        return;
    }

    // Handle single candidate scenario (using relaxed threshold)
    if (candidates.length === 1) {
        const { startLine, endLine } = candidates[0];
        const actualBlockSize = endLine - startLine + 1;

        let similarity = 0;
        let linesToCheck = Math.min(searchBlockSize - 2, actualBlockSize - 2); // Middle lines only

        if (linesToCheck > 0) {
            for (let j = 1; j < searchBlockSize - 1 && j < actualBlockSize - 1; j++) {
                const originalLine = originalLines[startLine + j].trim();
                const searchLine = searchLines[j].trim();
                const maxLen = Math.max(originalLine.length, searchLine.length);
                if (maxLen === 0) {
                    continue;
                }
                const distance = levenshtein(originalLine, searchLine);
                similarity += (1 - distance / maxLen) / linesToCheck;

                if (similarity >= SINGLE_CANDIDATE_SIMILARITY_THRESHOLD) {
                    break;
                }
            }
        } else {
            // No middle lines to compare, just accept based on anchors
            similarity = 1.0;
        }

        if (similarity >= SINGLE_CANDIDATE_SIMILARITY_THRESHOLD) {
            let matchStartIndex = 0;
            for (let k = 0; k < startLine; k++) {
                matchStartIndex += originalLines[k].length + 1;
            }
            let matchEndIndex = matchStartIndex;
            for (let k = startLine; k <= endLine; k++) {
                matchEndIndex += originalLines[k].length;
                if (k < endLine) {
                    matchEndIndex += 1;
                }
            }
            yield content.substring(matchStartIndex, matchEndIndex);
        }
        return;
    }

    // Calculate similarity for multiple candidates
    let bestMatch: { startLine: number; endLine: number } | null = null;
    let maxSimilarity = -1;

    for (const candidate of candidates) {
        const { startLine, endLine } = candidate;
        const actualBlockSize = endLine - startLine + 1;

        let similarity = 0;
        let linesToCheck = Math.min(searchBlockSize - 2, actualBlockSize - 2); // Middle lines only

        if (linesToCheck > 0) {
            for (let j = 1; j < searchBlockSize - 1 && j < actualBlockSize - 1; j++) {
                const originalLine = originalLines[startLine + j].trim();
                const searchLine = searchLines[j].trim();
                const maxLen = Math.max(originalLine.length, searchLine.length);
                if (maxLen === 0) {
                    continue;
                }
                const distance = levenshtein(originalLine, searchLine);
                similarity += 1 - distance / maxLen;
            }
            similarity /= linesToCheck; // Average similarity
        } else {
            similarity = 1.0;
        }

        if (similarity > maxSimilarity) {
            maxSimilarity = similarity;
            bestMatch = candidate;
        }
    }

    // Threshold judgment
    if (maxSimilarity >= MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD && bestMatch) {
        const { startLine, endLine } = bestMatch!;
        let matchStartIndex = 0;
        for (let k = 0; k < startLine; k++) {
            matchStartIndex += originalLines[k].length + 1;
        }
        let matchEndIndex = matchStartIndex;
        for (let k = startLine; k <= endLine; k++) {
            matchEndIndex += originalLines[k].length;
            if (k < endLine) {
                matchEndIndex += 1;
            }
        }
        yield content.substring(matchStartIndex, matchEndIndex);
    }
};

const WhitespaceNormalizedReplacer: Replacer = function* (content, find) {
    const normalizeWhitespace = (text: string) => text.replace(/\s+/g, " ").trim();
    const normalizedFind = normalizeWhitespace(find);

    // Handle single line matches
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (normalizeWhitespace(line) === normalizedFind) {
            yield line;
        } else {
            // Only check for substring matches if the full line doesn't match
            const normalizedLine = normalizeWhitespace(line);
            if (normalizedLine.includes(normalizedFind)) {
                // Find the actual substring in the original line that matches
                const words = find.trim().split(/\s+/);
                if (words.length > 0) {
                    // Try to construct a regex to match the sequence of words with variable whitespace
                    const pattern = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
                    try {
                        const regex = new RegExp(pattern);
                        const match = line.match(regex);
                        if (match) {
                            yield match[0];
                        }
                    } catch (e) {
                        // regex construction failed, ignore
                    }
                }
            }
        }
    }

    // Handle multi-line matches
    const findLines = find.split("\n");
    if (findLines.length > 1) {
        for (let i = 0; i <= lines.length - findLines.length; i++) {
            const block = lines.slice(i, i + findLines.length);
            // Join the block and normalize to see if it matches the normalized find string
            if (normalizeWhitespace(block.join("\n")) === normalizedFind) {
                yield block.join("\n");
            }
        }
    }
};

// Main replace function
function replace(content: string, oldString: string, newString: string, replaceAll = false): string {
    if (oldString === newString) {
        throw new Error("oldString and newString must be different");
    }

    let notFound = true;

    // Ordered strategies: Exact -> Trimmed -> Block Anchor -> Whitespace Normalized
    const strategies = [
        SimpleReplacer,
        LineTrimmedReplacer,
        BlockAnchorReplacer,
        WhitespaceNormalizedReplacer
    ];

    for (const replacer of strategies) {
        for (const search of replacer(content, oldString)) {
            const index = content.indexOf(search);
            if (index === -1) continue;

            notFound = false;

            if (replaceAll) {
                return content.replaceAll(search, newString);
            }

            // Uniqueness check for single replacement
            const lastIndex = content.lastIndexOf(search);
            if (index !== lastIndex) {
                // If we found the same exact fuzzily-matched block appearing twice, 
                // we can't be sure which one to replace. 
                // Note: simple 'replace' replaces the first one. 
                // We threw an error in the original implementation, let's keep it safe.
                throw new Error(
                    "Found multiple matches for the target string (or its fuzzy equivalent). Please provide more surrounding lines (context) to uniquely identify the code block."
                );
            }

            return content.substring(0, index) + newString + content.substring(index + search.length);
        }
    }

    if (notFound) {
        throw new Error("Target string not found in file (even with fuzzy matching). Please check the content again.");
    }

    return content;
}
