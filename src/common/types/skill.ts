export interface Skill {
    id: string; // Directory name
    name: string;
    description: string;
    content: string; // Full markdown content (without frontmatter)
    rawContent: string; // Full file content (with frontmatter)
    path: string;
    enabled: boolean;
    trustLevel: 'Ask' | 'Auto';
    source: 'builtin' | 'global' | 'project' | 'dotAgents';
}

export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: 'object';
            properties: Record<string, any>;
            required: string[];
        };
    };
}
