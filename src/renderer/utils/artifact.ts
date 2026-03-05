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
