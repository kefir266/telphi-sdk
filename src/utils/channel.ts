import type {
    ChannelMessage,
    MessageDirection,
    MessageRole,
    ControlCommand,
    ControlPayload,
    ResponseMode,
    StatusState,
    ActionPriority,
    ChannelMessageType,
} from '../channelTypes'

// =============================================================================
// Message Builder Helpers
// =============================================================================

/**
 * Create a unique message ID
 */
export function createMessageId(): string {
    return crypto.randomUUID()
}

/**
 * Create a base message with common fields
 */
export function createBaseMessage(
    type: ChannelMessageType,
    callId: string,
    direction: MessageDirection,
): Omit<ChannelMessage, 'chat' | 'action' | 'actionResult' | 'status' | 'reconnect' | 'error'> {
    return {
        type,
        callId,
        messageId: createMessageId(),
        timestamp: Date.now(),
        direction,
    }
}

/**
 * Create a chat message
 */
export function createChatMessage(
    callId: string,
    direction: MessageDirection,
    role: MessageRole,
    content: string,
    metadata?: Record<string, unknown>,
): ChannelMessage {
    return {
        ...createBaseMessage('chat', callId, direction),
        chat: { role, content, metadata },
    }
}

/**
 * Create an action request message
 */
export function createActionMessage(
    callId: string,
    name: string,
    parameters: Record<string, unknown>,
    options: {
        requiresResponse?: boolean
        timeoutMs?: number
        priority?: ActionPriority
        description?: string
    } = {},
): ChannelMessage {
    return {
        ...createBaseMessage('action', callId, 'to_browser'),
        action: {
            actionId: createMessageId(),
            name,
            parameters,
            requiresResponse: options.requiresResponse ?? true,
            timeoutMs: options.timeoutMs,
            priority: options.priority,
            description: options.description,
        },
    }
}

/**
 * Create an action result message (synchronous - immediate result)
 */
export function createActionResultMessage(
    callId: string,
    actionId: string,
    success: boolean,
    options: {
        data?: unknown
        error?: string
        durationMs?: number
    } = {},
): ChannelMessage {
    return {
        ...createBaseMessage('action_result', callId, 'to_ari'),
        actionResult: {
            actionId,
            success,
            data: options.data,
            error: options.error,
            durationMs: options.durationMs,
            isFinal: true, // Sync results are always final
        },
    }
}

/**
 * Create an async action acknowledgment (action received, will process)
 */
export function createActionAckMessage(
    callId: string,
    actionId: string,
    status: 'received' | 'executing' = 'received',
): ChannelMessage {
    return {
        ...createBaseMessage('action_result', callId, 'to_ari'),
        actionResult: {
            actionId,
            status,
            success: true, // Ack is always "success" in the sense that we received it
            isFinal: false, // More updates expected
        },
    }
}

/**
 * Create an async action completion message (final result)
 */
export function createAsyncActionResultMessage(
    callId: string,
    actionId: string,
    success: boolean,
    options: {
        data?: unknown
        error?: string
        durationMs?: number
    } = {},
): ChannelMessage {
    return {
        ...createBaseMessage('action_result', callId, 'to_ari'),
        actionResult: {
            actionId,
            status: success ? 'completed' : 'failed',
            success,
            data: options.data,
            error: options.error,
            durationMs: options.durationMs,
            isFinal: true,
        },
    }
}

/**
 * Create a chat message that references an action (for async updates via chat)
 */
export function createActionUpdateChatMessage(
    callId: string,
    actionId: string,
    content: string,
    metadata?: Record<string, unknown>,
): ChannelMessage {
    return {
        ...createBaseMessage('chat', callId, 'to_ari'),
        chat: {
            role: 'user',
            content,
            intent: 'action_update',
            relatedActionId: actionId,
            metadata,
        },
    }
}

/**
 * Create a status message
 */
export function createStatusMessage(
    callId: string,
    direction: MessageDirection,
    state: StatusState,
    metadata?: Record<string, unknown>,
): ChannelMessage {
    return {
        ...createBaseMessage('status', callId, direction),
        status: { state, metadata },
    }
}

/**
 * Create an error message
 */
export function createErrorMessage(
    callId: string,
    direction: MessageDirection,
    code: string,
    message: string,
    details?: unknown,
): ChannelMessage {
    return {
        ...createBaseMessage('error', callId, direction),
        error: { code, message, details },
    }
}

/**
 * Create a reconnect request message
 */
export function createReconnectMessage(
    callId: string,
    lastReceivedMessageId?: string,
    sessionData?: Record<string, unknown>,
): ChannelMessage {
    return {
        ...createBaseMessage('reconnect', callId, 'to_ari'),
        reconnect: { lastReceivedMessageId, sessionData },
    }
}

/**
 * Create a control message (browser -> ARI)
 */
export function createControlMessage(
    callId: string,
    command: ControlCommand,
    settings?: ControlPayload['settings'],
    metadata?: Record<string, unknown>,
): ChannelMessage {
    return {
        ...createBaseMessage('control', callId, 'to_ari'),
        control: { command, settings, metadata },
    }
}

/**
 * Create an enable text chat control message
 */
export function createEnableTextChatMessage(
    callId: string,
    responseMode: ResponseMode = 'text',
): ChannelMessage {
    return createControlMessage(callId, 'enable_text_chat', { responseMode })
}

/**
 * Create a disable text chat control message
 */
export function createDisableTextChatMessage(callId: string): ChannelMessage {
    return createControlMessage(callId, 'disable_text_chat')
}

/**
 * Create a context-only update (no AI response expected)
 * Use for: async action completed, informational updates, background state changes
 */
export function createContextUpdateMessage(
    callId: string,
    content: string,
    metadata?: Record<string, unknown>,
): ChannelMessage {
    return {
        ...createBaseMessage('chat', callId, 'to_ari'),
        chat: {
            role: 'user',
            content,
            intent: 'context_update',
            responseExpected: false, // Explicitly no response
            metadata,
        },
    }
}

/**
 * Create a text chat message (expects text response)
 * Use for: active text conversation with AI
 */
export function createTextChatMessage(
    callId: string,
    content: string,
    metadata?: Record<string, unknown>,
): ChannelMessage {
    return {
        ...createBaseMessage('chat', callId, 'to_ari'),
        chat: {
            role: 'user',
            content,
            intent: 'conversation',
            responseExpected: true,
            preferredResponse: 'text',
            metadata,
        },
    }
}

/**
 * Create a read-aloud request (expects voice response)
 * Use for: user highlighted text, wants AI to read it back
 */
export function createReadAloudMessage(
    callId: string,
    content: string,
    metadata?: Record<string, unknown>,
): ChannelMessage {
    return {
        ...createBaseMessage('chat', callId, 'to_ari'),
        chat: {
            role: 'user',
            content,
            intent: 'read_aloud',
            responseExpected: true,
            preferredResponse: 'voice',
            metadata,
        },
    }
}

/**
 * Create a ping message
 */
export function createPingMessage(callId: string): ChannelMessage {
    return createBaseMessage('ping', callId, 'to_ari') as ChannelMessage
}

/**
 * Create a pong message
 */
export function createPongMessage(callId: string): ChannelMessage {
    return createBaseMessage('pong', callId, 'to_browser') as ChannelMessage
}
