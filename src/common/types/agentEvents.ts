
import { AgentStep } from '../../main/services/agent/IAgent';

/**
 * IPC Payload Definitions
 */

export interface AgentStartRequest {
    sessionId?: string;
    prompt: string;
    options?: {
        model?: string;
        skills?: string[]; // skill IDs
    };
}

export interface AgentStartResponse {
    success: boolean;
    sessionId?: string; // Add this
    error?: string;
}

export interface SessionCreateResponse {
    id: string;
    createdAt: number;
}

/**
 * Event Payloads
 */

export interface AgentStreamEventPayload {
    content: string;
    isReset?: boolean;
}

export interface AgentStepEventPayload {
    steps: any[]; // Changed back
}
