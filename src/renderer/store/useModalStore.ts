import { create } from 'zustand';

export interface AuthorizationRequest {
    requestId: string;
    toolName: string;
    args: any;
    trustLevel: string;
    reason: string;
}

interface ModalState {
    authRequest: AuthorizationRequest | null;
    requestQueue: AuthorizationRequest[];
    showAuthModal: boolean;

    setAuthRequest: (request: AuthorizationRequest | null) => void;
    pushAuthRequest: (request: AuthorizationRequest) => void;
    popAuthRequest: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
    authRequest: null,
    requestQueue: [],
    showAuthModal: false,

    setAuthRequest: (request) => set({
        authRequest: request,
        showAuthModal: !!request
    }),

    pushAuthRequest: (request) => set((state) => {
        if (!state.authRequest) {
            return { authRequest: request, showAuthModal: true };
        }
        return { requestQueue: [...state.requestQueue, request] };
    }),

    popAuthRequest: () => set((state) => {
        if (state.requestQueue.length > 0) {
            const [next, ...rest] = state.requestQueue;
            return { authRequest: next, requestQueue: rest, showAuthModal: true };
        }
        return { authRequest: null, showAuthModal: false };
    })
}));
