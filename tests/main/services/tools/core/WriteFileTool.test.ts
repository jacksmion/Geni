import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WriteFileTool } from '@/main/services/tools/core/WriteFileTool';

describe('WriteFileTool chunked writing', () => {
    let tempDir: string;
    let tool: WriteFileTool;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'geni-write-tool-'));
        tool = new WriteFileTool(tempDir);
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('should return a chunk_id on the first chunk and require it for later chunks', async () => {
        const first = await tool.execute({
            path: 'notes.txt',
            content: 'hello ',
            chunk_index: 0,
            is_last_chunk: false
        });

        expect(first.isError).toBe(false);
        expect(String(first.result)).toContain('chunk_id=');

        const chunkId = extractChunkId(String(first.result));
        const second = await tool.execute({
            path: 'notes.txt',
            content: 'world',
            chunk_index: 1,
            chunk_id: chunkId,
            is_last_chunk: true
        });

        expect(second.isError).toBe(false);
        const finalContent = await fs.readFile(path.join(tempDir, 'notes.txt'), 'utf-8');
        expect(finalContent).toBe('hello world');
    });

    it('should isolate concurrent chunk sessions for the same target file', async () => {
        const firstA = await tool.execute({
            path: 'shared.txt',
            content: 'A0-',
            chunk_index: 0,
            is_last_chunk: false
        });
        const firstB = await tool.execute({
            path: 'shared.txt',
            content: 'B0-',
            chunk_index: 0,
            is_last_chunk: false
        });

        const chunkIdA = extractChunkId(String(firstA.result));
        const chunkIdB = extractChunkId(String(firstB.result));

        const finishA = await tool.execute({
            path: 'shared.txt',
            content: 'A1',
            chunk_index: 1,
            chunk_id: chunkIdA,
            is_last_chunk: true
        });

        expect(finishA.isError).toBe(false);
        expect(await fs.readFile(path.join(tempDir, 'shared.txt'), 'utf-8')).toBe('A0-A1');

        const finishB = await tool.execute({
            path: 'shared.txt',
            content: 'B1',
            chunk_index: 1,
            chunk_id: chunkIdB,
            is_last_chunk: true
        });

        expect(finishB.isError).toBe(false);
        expect(await fs.readFile(path.join(tempDir, 'shared.txt'), 'utf-8')).toBe('B0-B1');
    });

    it('should reject out-of-order chunks', async () => {
        const first = await tool.execute({
            path: 'ordered.txt',
            content: 'part-0',
            chunk_index: 0,
            is_last_chunk: false
        });

        const chunkId = extractChunkId(String(first.result));
        const invalid = await tool.execute({
            path: 'ordered.txt',
            content: 'part-2',
            chunk_index: 2,
            chunk_id: chunkId,
            is_last_chunk: true
        });

        expect(invalid.isError).toBe(true);
        expect(String(invalid.result)).toContain('Expected chunk_index=1');
    });
});

function extractChunkId(result: string): string {
    const match = result.match(/chunk_id='([^']+)'/);
    if (!match) {
        throw new Error(`chunk_id not found in result: ${result}`);
    }
    return match[1];
}
