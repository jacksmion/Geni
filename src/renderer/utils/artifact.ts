export function extractPathAndContent(jsonStr: string, toolName?: string): { path: string; content: string } {
    let pathResult = '';
    let contentResult = '';

    try {
        const parsed = JSON.parse(jsonStr || '{}');
        pathResult = parsed.path || parsed.file_path || parsed.target_file || parsed.TargetFile || '';

        // Diff view for edit tools
        if (toolName === 'edit' || toolName === 'replace_file_content' || toolName === 'multi_replace_file_content') {
            contentResult = '';

            // multi_replace_file_content logic
            if (parsed.ReplacementChunks || parsed.replacementChunks) {
                const chunks = parsed.ReplacementChunks || parsed.replacementChunks;
                if (Array.isArray(chunks)) {
                    contentResult = chunks.map((chunk, i) => {
                        const target = chunk.TargetContent || chunk.targetContent || chunk.target || '';
                        const replacement = chunk.ReplacementContent || chunk.replacementContent || chunk.replacement || '';

                        const targetLines = target ? target.split('\n').map((l: string) => `- ${l}`).join('\n') : '';
                        const replacementLines = replacement ? replacement.split('\n').map((l: string) => `+ ${l}`).join('\n') : '';

                        return `// --- Chunk ${i + 1} ---\n${targetLines}\n${replacementLines}`;
                    }).join('\n\n');
                }
            }
            // single edit logic
            else if (parsed.TargetContent || parsed.targetContent || parsed.target) {
                const target = parsed.TargetContent || parsed.targetContent || parsed.target;
                const replacement = parsed.ReplacementContent || parsed.replacementContent || parsed.replacement || parsed.content || '';

                const targetLines = target.split('\n').map((l: string) => `- ${l}`).join('\n');
                const replacementLines = replacement.split('\n').map((l: string) => `+ ${l}`).join('\n');

                contentResult = `${targetLines}\n${replacementLines}`;
            } else {
                // Fallback
                contentResult = parsed.content || parsed.replacement || parsed.ReplacementContent || '';
            }

        } else if (toolName === 'read' || toolName === 'bash') {
            // For these, the store/component usually overwrites content anyway, but we do basic parsing
            contentResult = parsed.content || '';
        } else {
            // Normal fallback content
            contentResult = parsed.content || parsed.replacement || parsed.CodeContent || '';
        }

    } catch {
        // regex fallback for streaming
        const pathMatch = jsonStr.match(/"(?:path|file_path|target_file|TargetFile)"\s*:\s*"([^"]*)/);
        if (pathMatch) pathResult = pathMatch[1];

        const contentMatch = jsonStr.match(/"(?:content|replacement|ReplacementContent|CodeContent)"\s*:\s*"/);
        if (contentMatch) {
            const startIndex = contentMatch.index! + contentMatch[0].length;
            let extracted = jsonStr.slice(startIndex);
            extracted = extracted.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\t/g, '\t');
            extracted = extracted.replace(/(?:")?\s*}\s*$/, '');
            if (extracted.endsWith('"')) extracted = extracted.slice(0, -1);
            contentResult = extracted;

            if (toolName === 'edit' || toolName === 'replace_file_content' || toolName === 'multi_replace_file_content') {
                // Very rough fallback diff stream
                contentResult = contentResult.split('\n').map(l => `+ ${l}`).join('\n');
            }
        }
    }

    return { path: pathResult, content: contentResult };
}

const PANEL_EXTENSIONS = new Set([
    'md', 'markdown', 'txt', 'log',
    'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
    'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'cpp', 'h', 'hpp',
    'html', 'htm', 'css', 'scss', 'less', 'vue', 'svelte',
    'json', 'yaml', 'yml', 'toml', 'xml', 'ini', 'conf', 'env',
    'sh', 'bash', 'zsh', 'fish', 'bat', 'ps1',
    'sql', 'graphql', 'proto', 'svg', 'pdf'
]);

const EXTERNAL_EXTENSIONS = new Set(['ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx']);
const ARTIFACT_EXTENSIONS = [...PANEL_EXTENSIONS, ...EXTERNAL_EXTENSIONS];
const BASH_DISCOVERABLE_EXTENSIONS = new Set(['ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx', 'pdf', 'html', 'htm']);
const PATH_LIKE_ARTIFACT_PATTERN = new RegExp(
    `(?:file:\\/\\/\\/)?(?:[A-Za-z]:[\\\\/]|\\.\\.?[\\\\/]|\\/)?[^\\s"'<>|]+?\\.(?:${ARTIFACT_EXTENSIONS.join('|')})(?![\\w-])`,
    'gi'
);

interface ArtifactStepLike {
    tool?: string;
    toolInput?: string;
    observation?: string;
    streamingObservation?: string;
}

export function getFileExtension(path: string): string {
    const cleaned = path.replace(/^file:\/\/\//, '').replace(/^file:\/\//, '');
    return cleaned.split('.').pop()?.toLowerCase() || '';
}

export function getArtifactOpenMode(ext: string): 'panel' | 'external' | null {
    if (PANEL_EXTENSIONS.has(ext)) return 'panel';
    if (EXTERNAL_EXTENSIONS.has(ext)) return 'external';
    return null;
}

export function getArtifactName(path: string): string {
    const normalized = path.replace(/\\/g, '/');
    const segments = normalized.split('/');
    return segments[segments.length - 1] || path;
}

function normalizeArtifactPath(rawPath: string): string {
    let normalized = rawPath
        .trim()
        .replace(/^['"`]+|['"`]+$/g, '')
        .replace(/\\\\/g, '\\')
        .replace(/[),.;:，。：；]+$/g, '');

    const labeledPathMatch = normalized.match(/^(?![A-Za-z]:[\\/])[^\\/]*[：:]\s*(.+)$/);
    if (labeledPathMatch) {
        normalized = labeledPathMatch[1].trim();
    }

    return normalized;
}

function extractArtifactPathsFromText(text: string, allowedExtensions?: Set<string>): string[] {
    if (!text) return [];

    const matches = text.match(PATH_LIKE_ARTIFACT_PATTERN) || [];
    const unique = new Set<string>();

    for (const match of matches) {
        const normalized = normalizeArtifactPath(match);
        if (!normalized) continue;
        if (/^https?:\/\//i.test(normalized)) continue;
        if (/[*?]/.test(normalized)) continue;

        const ext = getFileExtension(normalized);
        if (!getArtifactOpenMode(ext)) continue;
        if (allowedExtensions && !allowedExtensions.has(ext)) continue;

        unique.add(normalized);
    }

    return Array.from(unique);
}

export function extractArtifactsFromStep(step: ArtifactStepLike) {
    const tool = step.tool?.toLowerCase();
    const paths = new Set<string>();

    if (tool === 'write') {
        const { path } = extractPathAndContent(step.toolInput || '{}', step.tool);
        if (path) {
            const ext = getFileExtension(path);
            if (getArtifactOpenMode(ext)) {
                paths.add(path);
            }
        }
    }

    if (tool === 'bash') {
        for (const candidate of extractArtifactPathsFromText(step.toolInput || '', BASH_DISCOVERABLE_EXTENSIONS)) {
            paths.add(candidate);
        }
        for (const candidate of extractArtifactPathsFromText(step.observation || step.streamingObservation || '', BASH_DISCOVERABLE_EXTENSIONS)) {
            paths.add(candidate);
        }
    }

    return Array.from(paths).map(path => {
        const ext = getFileExtension(path);
        return {
            path,
            name: getArtifactName(path),
            ext,
            openMode: getArtifactOpenMode(ext)!,
            sourceTool: step.tool,
        };
    });
}
