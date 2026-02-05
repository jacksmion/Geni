import { create } from 'zustand'

export type MessageRole = 'user' | 'assistant' | 'system'

export interface AgentStep {
    thought?: string
    tool?: string
    toolInput?: string
    observation?: string
    isComplete: boolean
}

export interface ChatMessage {
    id: string
    role: MessageRole
    content: string
    steps?: AgentStep[]
    timestamp: number
    isError?: boolean
}

interface ChatState {
    messages: ChatMessage[]
    isSending: boolean
    activeTab: 'chat' | 'skills' | 'settings'

    // Actions
    addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void
    updateLastMessage: (updater: (msg: ChatMessage) => ChatMessage) => void
    setSending: (sending: boolean) => void
    setActiveTab: (tab: 'chat' | 'skills' | 'settings') => void
    clearMessages: () => void
    startNewChat: () => void
}

export const useChatStore = create<ChatState>((set) => ({
    messages: [
        {
            id: 'init-1',
            role: 'assistant',
            content: '你好！我是基于 Tool-Use 架构的新一代智能代理。\n我现在支持更复杂的任务拆解及工具调用。',
            timestamp: Date.now()
        }
    ],
    isSending: false,
    activeTab: 'chat',

    addMessage: (msg) => set((state) => ({
        messages: [
            ...state.messages,
            {
                ...msg,
                id: crypto.randomUUID(),
                timestamp: Date.now()
            }
        ]
    })),

    updateLastMessage: (updater) => set((state) => {
        const msgs = [...state.messages]
        if (msgs.length === 0) return state

        const lastIdx = msgs.length - 1
        msgs[lastIdx] = updater(msgs[lastIdx])
        return { messages: msgs }
    }),

    setSending: (isSending) => set({ isSending }),
    setActiveTab: (activeTab) => set({ activeTab }),
    clearMessages: () => set({ messages: [] }),
    startNewChat: () => set({
        messages: [
            {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: '你好！我是基于 Tool-Use 架构的新一代智能代理。\n我现在支持更复杂的任务拆解及工具调用。',
                timestamp: Date.now()
            }
        ]
    })
}))
