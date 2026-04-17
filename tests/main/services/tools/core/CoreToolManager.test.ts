import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CoreToolManager } from '@/main/services/tools/core/CoreToolManager';
import { ToolRegistry } from '@/main/services/tools/ToolRegistry';
import { DEFAULT_SETTINGS } from '@/common/types/settings';

describe('CoreToolManager', () => {
    let registry: ToolRegistry;
    const mockWorkspacePath = '/mock/workspace';

    beforeEach(() => {
        vi.clearAllMocks();
        registry = new ToolRegistry();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('getCoreToolMetadata', () => {
        it('should return metadata for all core tools', () => {
            const coreToolManager = createCoreToolManager(registry);
            const metadata = coreToolManager.getCoreToolMetadata();

            expect(metadata.length).toBeGreaterThan(0);
            expect(metadata[0]).toHaveProperty('name');
            expect(metadata[0]).toHaveProperty('description');
            expect(metadata[0]).toHaveProperty('enabled');
            expect(metadata[0]).toHaveProperty('trustLevel');
        });

        it('should exclude hidden tools', () => {
            const coreToolManager = createCoreToolManager(registry);
            const metadata = coreToolManager.getCoreToolMetadata();
            const toolNames = metadata.map(t => t.name);

            expect(toolNames).not.toContain('todowrite');
            expect(toolNames).not.toContain('todoread');
            expect(toolNames).not.toContain('load_skill');
        });

        it('should include bash tool', () => {
            const coreToolManager = createCoreToolManager(registry);
            const metadata = coreToolManager.getCoreToolMetadata();
            const bashTool = metadata.find(t => t.name === 'bash');

            expect(bashTool).toBeDefined();
            expect(bashTool?.description).toContain('shell');
        });

        it('should include read tool', () => {
            const coreToolManager = createCoreToolManager(registry);
            const metadata = coreToolManager.getCoreToolMetadata();
            const readTool = metadata.find(t => t.name === 'read');

            expect(readTool).toBeDefined();
        });

        it('should include write tool', () => {
            const coreToolManager = createCoreToolManager(registry);
            const metadata = coreToolManager.getCoreToolMetadata();
            const writeTool = metadata.find(t => t.name === 'write');

            expect(writeTool).toBeDefined();
        });

        it('should set trustLevel to Auto for safe tools', () => {
            const coreToolManager = createCoreToolManager(registry);
            const metadata = coreToolManager.getCoreToolMetadata();
            const listTool = metadata.find(t => t.name === 'list');

            expect(listTool?.trustLevel).toBe('Auto');
        });

        it('should set trustLevel to Ask for dangerous tools', () => {
            const coreToolManager = createCoreToolManager(registry);
            const metadata = coreToolManager.getCoreToolMetadata();
            const bashTool = metadata.find(t => t.name === 'bash');

            expect(bashTool?.trustLevel).toBe('Ask');
        });
    });

    describe('updateWorkspacePath', () => {
        it('should update the workspace path', () => {
            const coreToolManager = createCoreToolManager(registry);
            expect(() => coreToolManager.updateWorkspacePath('/new/path')).not.toThrow();
        });
    });

    describe('refresh', () => {
        it('should not throw when called', () => {
            const coreToolManager = createCoreToolManager(registry);
            expect(() => coreToolManager.refresh()).not.toThrow();
        });
    });
});

function createCoreToolManager(registry: ToolRegistry): CoreToolManager {
    const mockConfigManager = {
        load: vi.fn().mockReturnValue({
            ...DEFAULT_SETTINGS,
            coreToolSettings: {}
        })
    };

    const mockSkillRegistry = {};

    const mockPathManager = {
        getSkillsLoadPaths: vi.fn().mockReturnValue(['/skills']),
        getTodosFile: vi.fn().mockReturnValue('/mock/workspace/.geni/todos.json')
    };

    const mockMemoryStore = {
        read: vi.fn().mockReturnValue('')
    };

    return new CoreToolManager(
        registry,
        mockConfigManager as any,
        mockSkillRegistry as any,
        '/mock/workspace',
        mockPathManager as any,
        mockMemoryStore as any
    );
}
