import { create } from 'zustand';

export interface ConfirmAction {
    label: string;
    value: string;
}

export interface ConfirmConfig {
    message: string;
    confirmText?: string;
    cancelText?: string;
    extraActions?: ConfirmAction[];
    onConfirm: (action?: string) => void;
    onCancel?: (action?: string) => void;
}

interface ModalState {
    confirmConfig: ConfirmConfig | null;
    showConfirm: (config: ConfirmConfig) => void;
    dismissConfirm: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
    confirmConfig: null,

    showConfirm: (config) => set({ confirmConfig: config }),
    dismissConfirm: () => set({ confirmConfig: null })
}));
