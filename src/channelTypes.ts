/**
 * Channel Types
 *
 * Shared types for bidirectional communication between
 * Browser (WebRTC Phone) <-> TelAPI (WS Gateway) <-> TelPhi (ARI/AI)
 *
 * ## Two Communication Flows:
 *
 * ### Flow A: Tool Call Actions (AI-initiated)
 * ```
 * AI tool call → telphi → redis stream → telapi → browser
 *                                                    ↓
 * AI receives result ← telphi ← redis stream ← telapi ← browser executes
 * ```
 * - AI calls a tool that needs browser interaction
 * - Browser executes and sends `action_result`
 * - Result ALWAYS goes to AI context (linked to original tool call)
 *
 * ### Flow B: Text Chat (Browser-initiated, on-demand)
 * ```
 * Browser sends control: enable_text_chat
 *     ↓
 * User types → chat message → AI processes → AI responds via TEXT (not voice!)
 *     ↓
 * Browser sends control: disable_text_chat
 * ```
 * - Browser explicitly enables text chat mode
 * - While enabled, user messages go to AI and AI responds via text
 * - Disabled by default - voice is primary
 *
 * ## Message Intent:
 * - `action`: AI wants browser to do something (expects `action_result`)
 * - `action_result`: Browser response to action → ALWAYS goes to AI context
 * - `chat`: Text message (only processed by AI when text_chat enabled)
 * - `control`: Session control (enable/disable text chat, response mode)
 */

import { z } from 'zod'

// =============================================================================
// Message Types
// =============================================================================

export type ChannelMessageType =
    | 'chat' // Text messages (bidirectional)
    | 'action' // AI requests browser to do something
    | 'action_result' // Browser reports action completion → AI context
    | 'status' // Call/connection status updates
    | 'control' // Session control (text chat enable/disable)
    | 'reconnect' // Reconnection handshake
    | 'ping' // Keepalive
    | 'pong' // Keepalive response
    | 'error' // Error notification

export type MessageDirection = 'to_browser' | 'to_ari'

export type MessageRole = 'user' | 'assistant' | 'system'

export type StatusState =
    | 'connected'
    | 'reconnecting'
    | 'disconnected'
    | 'call_active'
    | 'call_ended'
    | 'call_hold'
    | 'call_resumed'
    | 'text_chat_enabled' // Browser has enabled text chat
    | 'text_chat_disabled' // Browser has disabled text chat

export type ActionPriority = 'high' | 'normal' | 'low'

/**
 * Control command types for session management
 */
export type ControlCommand =
    | 'enable_text_chat' // Browser wants to receive AI responses via text
    | 'disable_text_chat' // Browser wants AI to respond via voice only
    | 'request_context' // Browser requests current conversation context
    | 'clear_context' // Browser requests to clear conversation context

/**
 * How the AI should respond to messages
 */
export type ResponseMode = 'voice' | 'text' | 'both'

// =============================================================================
// Payload Interfaces
// =============================================================================

/**
 * Chat message payload (bidirectional)
 *
 * When sent from browser:
 * - Only processed by AI if text_chat is enabled (via control message)
 * - OR if responseExpected is explicitly set (overrides text_chat state)
 * - Can reference an actionId for async action updates
 *
 * When sent from AI:
 * - Always delivered to browser
 * - Browser decides how to display (chat UI, notification, etc.)
 */
export interface ChatPayload {
    role: MessageRole
    content: string
    /**
     * Intent helps the receiver understand how to handle this message:
     * - 'conversation': Part of an active text chat conversation
     * - 'notification': Informational only, no response expected
     * - 'context_update': Updating the conversation context (e.g., action results)
     * - 'action_update': Async update related to a previous action
     * - 'read_aloud': User wants AI to read this content aloud (voice response)
     */
    intent?: 'conversation' | 'notification' | 'context_update' | 'action_update' | 'read_aloud'

    /**
     * Explicit control over AI response behavior.
     *
     * When true: AI MUST respond (overrides textChatEnabled state)
     * When false: AI should NOT respond (just add to context)
     * When undefined: Follow default rules (textChatEnabled state for chat, always for action_update)
     *
     * Use cases:
     * - false: Async action completed → context update, no response needed
     * - true + preferredResponse='voice': User highlighted text → read aloud
     * - true + preferredResponse='text': Text chat message → text response
     */
    responseExpected?: boolean

    /**
     * If responseExpected is true, how should AI respond?
     * - 'voice': Respond via voice/audio (e.g., read aloud request)
     * - 'text': Respond via text message only
     * - 'both': Respond via both voice and text
     *
     * If not set, defaults to current responseMode from control settings.
     */
    preferredResponse?: ResponseMode

    /**
     * Reference to a related actionId
     * Used when sending async action updates via chat flow.
     * AI can correlate this message with the original action request.
     */
    relatedActionId?: string
    metadata?: Record<string, unknown>
}

/**
 * Control message payload (Browser -> ARI)
 * Used to manage text chat mode and other session settings
 */
export interface ControlPayload {
    command: ControlCommand
    /** Optional settings for the command */
    settings?: {
        /** When enabling text chat, specify preferred response mode */
        responseMode?: ResponseMode
        /** Custom timeout for text chat session (ms) */
        sessionTimeout?: number
    }
    metadata?: Record<string, unknown>
}

/**
 * Action request payload (ARI -> Browser)
 * When the AI needs the browser to do something
 */
export interface ActionPayload {
    /** Unique ID to correlate with result */
    actionId: string
    /** Action name, e.g., 'click_button', 'fill_form', 'navigate' */
    name: string
    /** Action parameters */
    parameters: Record<string, unknown>
    /** If true, browser must send action_result */
    requiresResponse: boolean
    /** How long ARI will wait for response (ms) */
    timeoutMs?: number
    /** Priority for action execution */
    priority?: ActionPriority
    /** Human-readable description of what the action does */
    description?: string
}

/**
 * Action execution status for async actions
 */
export type ActionStatus =
    | 'received' // Action received, will process
    | 'executing' // Currently executing
    | 'completed' // Successfully completed (final)
    | 'failed' // Failed (final)

/**
 * Action result payload (Browser -> ARI)
 *
 * Supports both synchronous and asynchronous actions:
 *
 * **Synchronous** (default):
 * - Single response with success/failure and data
 *
 * **Asynchronous**:
 * - First response: { actionId, status: 'received' } or { actionId, status: 'executing' }
 * - Later response: { actionId, status: 'completed', data: {...} }
 * - Or on failure: { actionId, status: 'failed', error: '...' }
 *
 * Multiple results can be sent for the same actionId to track progress.
 */
export interface ActionResultPayload {
    /** Correlates to ActionPayload.actionId */
    actionId: string
    /**
     * Execution status for async actions
     * - If not provided, treated as synchronous (success field determines outcome)
     * - For async: 'received' → 'executing' → 'completed'/'failed'
     */
    status?: ActionStatus
    /** Whether the action succeeded (for sync) or completed successfully (for async final) */
    success: boolean
    /** Result data if any */
    data?: unknown
    /** Error message if !success or status='failed' */
    error?: string
    /** How long the action took (ms) - set on final response */
    durationMs?: number
    /**
     * For async actions: is this the final response?
     * If true, AI should consider this action complete.
     * If false/undefined and status is 'received'/'executing', more updates expected.
     */
    isFinal?: boolean
}

/**
 * Status update payload (bidirectional)
 */
export interface StatusPayload {
    state: StatusState
    metadata?: Record<string, unknown>
}

/**
 * Reconnection handshake payload
 */
export interface ReconnectPayload {
    /** Browser tells what was last received */
    lastReceivedMessageId?: string
    /** Restore any session state */
    sessionData?: Record<string, unknown>
}

/**
 * Error payload
 */
export interface ErrorPayload {
    code: string
    message: string
    details?: unknown
}

// =============================================================================
// Main Message Interface
// =============================================================================

/**
 * Channel message structure
 * All messages between browser-telapi-telphi follow this format
 */
export interface ChannelMessage {
    type: ChannelMessageType
    callId: string
    messageId: string
    timestamp: number
    direction: MessageDirection

    // Optional payloads based on type
    chat?: ChatPayload
    action?: ActionPayload
    actionResult?: ActionResultPayload
    status?: StatusPayload
    control?: ControlPayload
    reconnect?: ReconnectPayload
    error?: ErrorPayload
}

// =============================================================================
// Zod Schemas for Runtime Validation
// =============================================================================

export const chatPayloadSchema = z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    intent: z
        .enum(['conversation', 'notification', 'context_update', 'action_update', 'read_aloud'])
        .optional(),
    responseExpected: z.boolean().optional(),
    preferredResponse: z.enum(['voice', 'text', 'both']).optional(),
    relatedActionId: z.string().uuid().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
})

export const controlPayloadSchema = z.object({
    command: z.enum(['enable_text_chat', 'disable_text_chat', 'request_context', 'clear_context']),
    settings: z
        .object({
            responseMode: z.enum(['voice', 'text', 'both']).optional(),
            sessionTimeout: z.number().int().positive().max(3600000).optional(), // Max 1 hour
        })
        .optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
})

export const actionPayloadSchema = z.object({
    actionId: z.string().uuid(),
    name: z.string().min(1).max(100),
    parameters: z.record(z.string(), z.unknown()),
    requiresResponse: z.boolean(),
    timeoutMs: z.number().int().positive().max(300000).optional(), // Max 5 min
    priority: z.enum(['high', 'normal', 'low']).optional(),
    description: z.string().max(500).optional(),
})

export const actionResultPayloadSchema = z.object({
    actionId: z.string().uuid(),
    status: z.enum(['received', 'executing', 'completed', 'failed']).optional(),
    success: z.boolean(),
    data: z.unknown().optional(),
    error: z.string().max(1000).optional(),
    durationMs: z.number().int().positive().optional(),
    isFinal: z.boolean().optional(),
})

export const statusPayloadSchema = z.object({
    state: z.enum([
        'connected',
        'reconnecting',
        'disconnected',
        'call_active',
        'call_ended',
        'call_hold',
        'call_resumed',
        'text_chat_enabled',
        'text_chat_disabled',
    ]),
    metadata: z.record(z.string(), z.unknown()).optional(),
})

export const reconnectPayloadSchema = z.object({
    lastReceivedMessageId: z.string().uuid().optional(),
    sessionData: z.record(z.string(), z.unknown()).optional(),
})

export const errorPayloadSchema = z.object({
    code: z.string().min(1).max(50),
    message: z.string().min(1).max(1000),
    details: z.unknown().optional(),
})

export const channelMessageSchema = z.object({
    type: z.enum([
        'chat',
        'action',
        'action_result',
        'status',
        'control',
        'reconnect',
        'ping',
        'pong',
        'error',
    ]),
    callId: z.string().min(1).max(100),
    messageId: z.string().uuid(),
    timestamp: z.number().int().positive(),
    direction: z.enum(['to_browser', 'to_ari']),
    chat: chatPayloadSchema.optional(),
    action: actionPayloadSchema.optional(),
    actionResult: actionResultPayloadSchema.optional(),
    status: statusPayloadSchema.optional(),
    control: controlPayloadSchema.optional(),
    reconnect: reconnectPayloadSchema.optional(),
    error: errorPayloadSchema.optional(),
})

// =============================================================================
// WebSocket Token Types
// =============================================================================

/**
 * JWT payload for WebSocket authentication token
 */
export interface WsTokenPayload {
    /** Call identifier */
    callId: string
    /** Endpoint that initiated the call */
    endpointId: string
    /** Team that owns the endpoint */
    teamId: string
    /** Issued at (Unix timestamp) */
    iat: number
    /** Expiry (Unix timestamp) - short-lived, ~5 min */
    exp: number
    /** Subject identifier */
    sub: 'ws_token'
}

/**
 * Extended token for refresh purposes
 */
export interface WsRefreshPayload extends WsTokenPayload {
    refreshable: boolean
    originalIat: number
}

// =============================================================================
// Redis Channel Keys
// =============================================================================

/**
 * Get Redis channel key for browser -> ARI messages
 */
export function getToAriChannel(callId: string): string {
    return `voiceai:channel:${callId}:to_ari`
}

/**
 * Get Redis channel key for ARI -> browser messages
 */
export function getToBrowserChannel(callId: string): string {
    return `voiceai:channel:${callId}:to_browser`
}

/**
 * Get Redis stream key for message durability
 */
export function getChannelStream(callId: string): string {
    return `voiceai:stream:${callId}`
}

// =============================================================================
// Predefined Action Names (for consistency)
// =============================================================================

/**
 * Standard action names that browser should handle
 */
export const StandardActions = {
    /** Fill a form with provided data */
    FILL_FORM: 'fill_form',
    /** Click a button or element */
    CLICK_ELEMENT: 'click_element',
    /** Navigate to a URL */
    NAVIGATE: 'navigate',
    /** Show a notification/alert */
    SHOW_NOTIFICATION: 'show_notification',
    /** Open a modal/dialog */
    OPEN_MODAL: 'open_modal',
    /** Close a modal/dialog */
    CLOSE_MODAL: 'close_modal',
    /** Scroll to element */
    SCROLL_TO: 'scroll_to',
    /** Set a value in local/session storage */
    SET_STORAGE: 'set_storage',
    /** Get a value from local/session storage */
    GET_STORAGE: 'get_storage',
    /** Download a file */
    DOWNLOAD_FILE: 'download_file',
    /** Copy text to clipboard */
    COPY_TO_CLIPBOARD: 'copy_to_clipboard',
    /** Play audio */
    PLAY_AUDIO: 'play_audio',
    /** Stop audio */
    STOP_AUDIO: 'stop_audio',
} as const

export type StandardActionName = (typeof StandardActions)[keyof typeof StandardActions]
