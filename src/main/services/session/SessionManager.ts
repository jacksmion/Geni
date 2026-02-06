
import { ChatMessage } from '../llm/IChatModel';
import { randomUUID } from 'crypto';

export interface SessionState {
    id: string;
    title: string;
    history: ChatMessage[];
    variables: Record<string, any>;
    activeSkillIds: string[];
    createdAt: number;
    updatedAt: number;
}

export class SessionManager {
    private sessions: Map<string, SessionState> = new Map();

    createSession(sessionId?: string): SessionState {
        const id = sessionId || randomUUID();
        const session: SessionState = {
            id,
            title: 'New Chat',
            history: [],
            variables: {},
            activeSkillIds: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        this.sessions.set(id, session);
        return session;
    }

    getSession(id: string): SessionState | undefined {
        return this.sessions.get(id);
    }

    deleteSession(id: string): boolean {
        return this.sessions.delete(id);
    }

    updateSession(id: string, updates: Partial<SessionState>): SessionState | undefined {
        const session = this.sessions.get(id);
        if (!session) return undefined;

        Object.assign(session, updates, { updatedAt: Date.now() });
        return session;
    }

    saveSession(session: any): boolean {
        // Handle "save" from frontend.
        if (!session.id) return false;

        let existing = this.sessions.get(session.id);

        if (!existing) {
            existing = {
                id: session.id,
                title: session.title || 'New Chat',
                history: [],
                variables: {},
                activeSkillIds: [],
                createdAt: session.createdAt || Date.now(),
                updatedAt: Date.now()
            };
            this.sessions.set(session.id, existing);
        }

        if (session.title) existing.title = session.title;

        return true;
    }

    addMessage(id: string, message: ChatMessage): void {
        const session = this.sessions.get(id);
        if (session) {
            session.history.push(message);
            session.updatedAt = Date.now();
        }
    }

    getHistory(id: string): ChatMessage[] {
        return this.sessions.get(id)?.history || [];
    }

    setVariable(sessionId: string, key: string, value: any): void {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.variables[key] = value;
            session.updatedAt = Date.now();
        }
    }

    getVariable(sessionId: string, key: string): any {
        return this.sessions.get(sessionId)?.variables[key];
    }

    listSessions(): SessionState[] {
        return Array.from(this.sessions.values()).sort((a, b) => b.updatedAt - a.updatedAt);
    }
}
