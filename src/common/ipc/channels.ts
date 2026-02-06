
/**
 * IPC Channels Definition
 */

// Agent Channels
export const AGENT_CHANNELS = {
    START: 'agent:start',
    STOP: 'agent:stop',
    GET_STATE: 'agent:get-state',
} as const;

// Session Channels
export const SESSION_CHANNELS = {
    CREATE: 'session:create',
    LIST: 'session:list',
    GET: 'session:get',
    DELETE: 'session:delete',
    GET_HISTORY: 'session:get-history',
} as const;

// Agent Events (Server -> Client)
export const AGENT_EVENTS = {
    STREAM: 'agent:stream',         // Content delta
    STEP_UPDATE: 'agent:step',      // Thought/Tool execution update
    STATE_CHANGE: 'agent:state',    // Idle/Thinking/etc
    ERROR: 'agent:error',           // Fatal error
} as const;
