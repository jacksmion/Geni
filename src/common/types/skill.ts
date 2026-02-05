export interface Skill {
    id: string; // Directory name
    name: string;
    description: string;
    content: string; // Full markdown content (without frontmatter)
    path: string;
    enabled: boolean;
    trustLevel: 'Ask' | 'Auto';
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
