import { describe, it, expect, vi, afterEach } from 'vitest';
import os from 'os';
import { BashTool } from '@/main/services/tools/core/BashTool';

describe('BashTool', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should describe Windows shell fallback behavior', () => {
        vi.spyOn(os, 'platform').mockReturnValue('win32');

        const tool = new BashTool('/workspace');
        const definition = tool.getDefinition();

        expect(definition.description).toContain('PowerShell 7');
        expect(definition.description).toContain('Windows PowerShell');
        expect(definition.description).toContain('cmd.exe');
    });

    it('should describe /bin/bash on non-Windows systems', () => {
        vi.spyOn(os, 'platform').mockReturnValue('linux');

        const tool = new BashTool('/workspace');
        const definition = tool.getDefinition();

        expect(definition.description).toContain('/bin/bash');
    });
});
