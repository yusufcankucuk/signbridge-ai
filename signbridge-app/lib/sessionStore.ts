import 'server-only';

import { randomUUID } from 'node:crypto';

import type { InteractionEventType, SessionState } from '@/types/session';
import { getSupabase } from '@/lib/supabase';

export interface SessionRecord {
    id: string;
    state: SessionState;
    created_at: string;
    expires_at: string;
}

interface StoredEvent {
    id: string;
    sessionId: string;
    type: InteractionEventType;
    payload: unknown;
}

export interface TransitionInput {
    id: string;
    expectedState: SessionState;
    nextState: SessionState;
    event?: { type: InteractionEventType; payload: unknown };
    deleteEvents?: boolean;
}

export interface SessionStore {
    readonly kind: 'memory' | 'supabase';
    create(): Promise<SessionRecord>;
    get(id: string): Promise<SessionRecord | null>;
    getPendingQuestionId(id: string): Promise<string | null>;
    transition(input: TransitionInput): Promise<boolean>;
    health(): Promise<boolean>;
}

type MemoryState = {
    sessions: Map<string, SessionRecord>;
    events: Map<string, StoredEvent[]>;
};

declare global {
    var __signbridgeMemoryState: MemoryState | undefined;
}

function memoryState(): MemoryState {
    globalThis.__signbridgeMemoryState ??= { sessions: new Map(), events: new Map() };
    return globalThis.__signbridgeMemoryState;
}

const memoryStore: SessionStore = {
    kind: 'memory',
    async create() {
        const now = new Date();
        const session: SessionRecord = {
            id: randomUUID(),
            state: 'patient_capture',
            created_at: now.toISOString(),
            expires_at: new Date(now.getTime() + 30 * 60_000).toISOString(),
        };
        const state = memoryState();
        state.sessions.set(session.id, session);
        state.events.set(session.id, []);
        return session;
    },
    async get(id) {
        const state = memoryState();
        const session = state.sessions.get(id);
        if (!session) return null;
        if (Date.parse(session.expires_at) <= Date.now()) {
            state.sessions.delete(id);
            state.events.delete(id);
            return null;
        }
        return { ...session };
    },
    async getPendingQuestionId(id) {
        const events = memoryState().events.get(id) ?? [];
        for (let index = events.length - 1; index >= 0; index -= 1) {
            const event = events[index];
            if (event.type !== 'doctor_question') continue;
            const questionId = (event.payload as { questionId?: unknown } | null)?.questionId;
            return typeof questionId === 'string' ? questionId : null;
        }
        return null;
    },
    async transition({ id, expectedState, nextState, event, deleteEvents }) {
        const state = memoryState();
        const session = await this.get(id);
        if (!session || session.state !== expectedState) return false;
        if (event) {
            const events = state.events.get(id) ?? [];
            events.push({ id: randomUUID(), sessionId: id, ...event });
            state.events.set(id, events);
        }
        if (deleteEvents) state.events.delete(id);
        if (nextState === 'ended') state.sessions.delete(id);
        else state.sessions.set(id, { ...session, state: nextState });
        return true;
    },
    async health() {
        return true;
    },
};

const supabaseStore: SessionStore = {
    kind: 'supabase',
    async create() {
        const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
        const { data, error } = await getSupabase()
            .from('consultation_sessions')
            .insert([{ state: 'patient_capture', expires_at: expiresAt }])
            .select('id,state,created_at,expires_at')
            .single();
        if (error || !data) throw new Error('SESSION_CREATE_FAILED');
        return data as SessionRecord;
    },
    async get(id) {
        const { data, error } = await getSupabase()
            .from('consultation_sessions')
            .select('id,state,created_at,expires_at')
            .eq('id', id)
            .maybeSingle();
        if (error) throw new Error('SESSION_READ_FAILED');
        return data as SessionRecord | null;
    },
    async getPendingQuestionId(id) {
        const { data, error } = await getSupabase()
            .from('interaction_events')
            .select('payload')
            .eq('session_id', id)
            .eq('type', 'doctor_question')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) throw new Error('PENDING_QUESTION_READ_FAILED');
        const questionId = (data?.payload as { questionId?: unknown } | undefined)?.questionId;
        return typeof questionId === 'string' ? questionId : null;
    },
    async transition({ id, expectedState, nextState, event, deleteEvents }) {
        const { data, error } = await getSupabase().rpc('advance_consultation', {
            p_session_id: id,
            p_expected_state: expectedState,
            p_next_state: nextState,
            p_event_type: event?.type ?? null,
            p_event_payload: event?.payload ?? null,
            p_delete_events: deleteEvents ?? false,
        });
        if (error) throw new Error('SESSION_TRANSITION_FAILED');
        return data === true;
    },
    async health() {
        const { error } = await getSupabase().from('consultation_sessions').select('id').limit(1);
        return !error;
    },
};

export function getSessionStore(): SessionStore {
    const configured = process.env.SESSION_STORE?.trim().toLowerCase();
    if (configured && configured !== 'memory' && configured !== 'supabase') {
        throw new Error('SESSION_STORE memory veya supabase olmalıdır.');
    }
    if (configured === 'supabase') return supabaseStore;
    if (configured === 'memory') return memoryStore;
    return process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
        ? supabaseStore
        : memoryStore;
}
