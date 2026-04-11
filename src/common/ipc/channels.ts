
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
    REASONING_STREAM: 'agent:reasoning-stream', // Reasoning delta (thinking process)
    STEP_UPDATE: 'agent:step',      // Thought/Tool execution update
    STATE_CHANGE: 'agent:state',    // Idle/Thinking/etc
    ERROR: 'agent:error',           // Fatal error
    AUTHORIZATION_REQUEST: 'agent:authorization-request', // Permission required
    AGENT_EVENT: 'agent:event',     // Phase 4: unified event channel
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
    TEST_WECOM: 'system:test-wecom',
    TEST_LARK: 'system:test-lark',
    TEST_WECHAT: 'system:test-wechat',
    READ_FILE_BASE64: 'system:read-file-base64',
    GET_USAGE_STATS: 'system:get-usage-stats',
    READ_PROFILE_FILE: 'system:read-profile-file',
    WRITE_PROFILE_FILE: 'system:write-profile-file',
} as const;

export const SYSTEM_EVENTS = {
    SETTINGS_CHANGED: 'system:settings-changed',
    WECHAT_QR: 'system:wechat-qr',
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
    IMPORT_SKILL: 'tool:import-skill',
    IMPORT_SKILL_CONFIRM: 'tool:import-skill-confirm',
    DELETE_SKILL: 'tool:delete-skill',
} as const;

// Scheduler Channels
export const SCHEDULER_CHANNELS = {
    TRIGGER_TASK: 'scheduler:trigger-task',
    GET_STATUSES: 'scheduler:get-statuses',
    GET_LOGS: 'scheduler:get-logs',
    VALIDATE_CRON: 'scheduler:validate-cron',
    DELETE_LOGS: 'scheduler:delete-logs',
    DELETE_ALL_LOGS: 'scheduler:delete-all-logs',
} as const;

// Tray Events (Server -> Client)
export const TRAY_EVENTS = {
    NAVIGATE_TO_SETTINGS: 'tray:navigate-to-settings',
    NEW_TASK: 'tray:new-task',
} as const;

// Update Channels
export const UPDATE_CHANNELS = {
    CHECK_FOR_UPDATES: 'update:check-for-updates',
    DOWNLOAD_UPDATE: 'update:download-update',
    QUIT_AND_INSTALL: 'update:quit-and-install',
    GET_VERSION: 'update:get-version',
} as const;

// Update Events (Server -> Client)
export const UPDATE_EVENTS = {
    UPDATE_AVAILABLE: 'update:available',
    UPDATE_NOT_AVAILABLE: 'update:not-available',
    DOWNLOAD_PROGRESS: 'update:download-progress',
    UPDATE_DOWNLOADED: 'update:downloaded',
    ERROR: 'update:error',
    CHECKING: 'update:checking',
} as const;

// Staff (Digital Employee) Channels
export const STAFF_CHANNELS = {
    LIST: 'staff:list',
    GET: 'staff:get',
    CREATE: 'staff:create',
    UPDATE: 'staff:update',
    DELETE: 'staff:delete',
} as const;
