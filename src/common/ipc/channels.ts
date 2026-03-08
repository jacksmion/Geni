
/**
 * IPC Channels Definition
 */

// Agent Channels
export const AGENT_CHANNELS = {
    START: 'agent:start',
    STOP: 'agent:stop',
    GET_STATE: 'agent:get-state',
    AUTHORIZATION_RESPONSE: 'agent:authorization-response',
} as const;

// Session Channels
export const SESSION_CHANNELS = {
    CREATE: 'session:create',
    LIST: 'session:list',
    GET: 'session:get',
    DELETE: 'session:delete',
    GET_HISTORY: 'session:get-history',
    SAVE: 'session:save',
    ADD_MESSAGE: 'session:add-message',
} as const;

// Agent Events (Server -> Client)
export const AGENT_EVENTS = {
    STREAM: 'agent:stream',         // Content delta
    STEP_UPDATE: 'agent:step',      // Thought/Tool execution update
    STATE_CHANGE: 'agent:state',    // Idle/Thinking/etc
    ERROR: 'agent:error',           // Fatal error
    AUTHORIZATION_REQUEST: 'agent:authorization-request', // Permission required
} as const;

export const SYSTEM_CHANNELS = {
    SELECT_FILE: 'system:select-file',
    SELECT_DIRECTORY: 'system:select-directory',
    OPEN_EXPLORER: 'system:open-explorer',
    GET_SETTINGS: 'system:get-settings',
    SAVE_SETTINGS: 'system:save-settings',
    TEST_LLM: 'system:test-llm',
    FETCH_PROVIDER_MODELS: 'system:fetch-provider-models',
    GET_PATH_INFO: 'system:get-path-info',
    OPEN_USER_SKILLS: 'system:open-user-skills',
    TEST_TELEGRAM: 'system:test-telegram',
} as const;

export const TOOL_CHANNELS = {
    GET_SKILLS: 'tool:get-skills',
    TOGGLE_SKILL: 'tool:toggle-skill',
    SET_TRUST_LEVEL: 'tool:set-trust-level',
    MCP_CONNECT: 'tool:mcp-connect',
    MCP_LIST_TOOLS: 'tool:mcp-list-tools',
    MCP_TOGGLE_TOOL: 'tool:mcp-toggle-tool',
    MCP_SET_TOOL_TRUST_LEVEL: 'tool:mcp-set-tool-trust-level',
    MCP_TOGGLE_SERVER: 'tool:mcp-toggle-server',
    MCP_GET_STATUSES: 'tool:mcp-get-statuses',
    CORE_TOOL_LIST: 'tool:core-tool-list',
    CORE_TOOL_TOGGLE: 'tool:core-tool-toggle',
    CORE_TOOL_SET_TRUST_LEVEL: 'tool:core-tool-set-trust-level',
} as const;

// Scheduler Channels
export const SCHEDULER_CHANNELS = {
    TRIGGER_TASK: 'scheduler:trigger-task',
    GET_STATUSES: 'scheduler:get-statuses',
    GET_LOGS: 'scheduler:get-logs',
    VALIDATE_CRON: 'scheduler:validate-cron',
} as const;

// Tray Events (Server -> Client)
export const TRAY_EVENTS = {
    NAVIGATE_TO_SETTINGS: 'tray:navigate-to-settings',
    NEW_TASK: 'tray:new-task',
} as const;
