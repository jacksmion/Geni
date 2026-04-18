import { describe, expect, it } from 'vitest';
import { extractArtifactsFromStep } from '@/renderer/utils/artifact';

describe('extractArtifactsFromStep', () => {
    it('collects write tool artifacts from explicit path', () => {
        const artifacts = extractArtifactsFromStep({
            tool: 'write',
            toolInput: JSON.stringify({
                path: 'tmp/generate-doc.js',
                content: 'console.log("hello");'
            })
        });

        expect(artifacts).toEqual([
            expect.objectContaining({
                path: 'tmp/generate-doc.js',
                ext: 'js',
                openMode: 'panel',
                sourceTool: 'write',
            })
        ]);
    });

    it('collects office artifacts referenced by bash command and output', () => {
        const artifacts = extractArtifactsFromStep({
            tool: 'bash',
            toolInput: JSON.stringify({
                command: 'node scripts/make-doc.js --output "./artifacts/report.docx"'
            }),
            observation: '[stdout]:\nSaved to ./artifacts/report.docx\nAlso created C:\\\\temp\\\\slides.pptx'
        });

        expect(artifacts).toEqual([
            expect.objectContaining({
                path: './artifacts/report.docx',
                ext: 'docx',
                openMode: 'external',
            }),
            expect.objectContaining({
                path: 'C:\\temp\\slides.pptx',
                ext: 'pptx',
                openMode: 'external',
            })
        ]);
    });

    it('deduplicates repeated bash artifact paths', () => {
        const artifacts = extractArtifactsFromStep({
            tool: 'bash',
            toolInput: JSON.stringify({
                command: 'node build.js out/final.docx'
            }),
            observation: '[stdout]:\nout/final.docx\nout/final.docx'
        });

        expect(artifacts).toHaveLength(1);
        expect(artifacts[0]).toEqual(expect.objectContaining({
            path: 'out/final.docx',
            ext: 'docx',
        }));
    });
});
