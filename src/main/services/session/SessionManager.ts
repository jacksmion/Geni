
import { ChatMessage } from '../llm/IChatModel';
import { randomUUID } from 'crypto';

/**
 * Session State Definition
 */
export interface SessionState {
    id: string;
    history: ChatMessage[];
    variables: Record<string, any>;
    activeSkillIds: string[];
    createdAt: number;
    updatedAt: number;
}

/**
 * Session Manager
 * 
 * Phase 4.3: Session Management
 * 
 * Manages multiple conversation sessions, including history, context variables,
 * and active skills.
 */
export class SessionManager {
    private sessions: Map<string, SessionState> = new Map();

    /**
     * Create a new session
     */
    createSession(sessionId?: string): SessionState {
        const id = sessionId || randomUUID();
        const session: SessionState = {
            id,
            history: [],
            variables: {},
            activeSkillIds: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        this.sessions.set(id, session);
        return session;
    }

    /**
     * Get a session by ID
     */
    getSession(id: string): SessionState | undefined {
        return this.sessions.get(id);
    }

    /**
     * Delete a session
     */
    deleteSession(id: string): boolean {
        return this.sessions.delete(id);
    }

    /**
     * Update session state
     */
    updateSession(id: string, updates: Partial<SessionState>): SessionState | undefined {
        const session = this.sessions.get(id);
        if (!session) return undefined;

        Object.assign(session, updates, { updatedAt: Date.now() });
        return session;
    }

    /**
     * Add a message to session history
     */
    addMessage(id: string, message: ChatMessage): void {
        const session = this.sessions.get(id);
        if (session) {
            session.history.push(message);
            session.updatedAt = Date.now();
        }
    }

    /**
     * Get recent messages from session
     */
    getHistory(id: string): ChatMessage[] {
        return this.sessions.get(id)?.history || [];
    }

    /**
     * Set a context variable
     */
    setVariable(sessionId: string, key: string, value: any): void {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.variables[key] = value;
            session.updatedAt = Date.now();
        }
    }

    /**
     * Get a context variable
     */
    getVariable(sessionId: string, key: string): any {
        return this.sessions.get(sessionId)?.variables[key];
    }

    /**
     * List all active sessions
     */
    listSessions(): SessionState[] {
        return Array.from(this.sessions.values()).sort((a, b) => b.updatedAt - a.updatedAt);
    }
}
