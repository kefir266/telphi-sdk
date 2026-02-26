/**
 * useCallChannel Hook
 *
 * React hook for bidirectional communication between browser and ARI (telphi)
 * via WebSocket through telapi.
 *
 * ## Two Communication Flows:
 *
 * ### Flow A: Tool Call Actions (AI-initiated)
 * AI tool call → browser executes → result back to AI context
 * - Automatic action execution via onAction handler
 * - Results automatically sent back
 *
 * ### Flow B: Text Chat (Browser-initiated, on-demand)
 * User enables text chat → types message → AI responds via text
 * - Use enableTextChat() to start text conversation
 * - Use disableTextChat() to go back to voice-only
 * - AI only responds to chat when text chat is enabled
 */

import { useRef, useState, useCallback, useEffect, startTransition } from 'react'

import type {
    ChannelMessage,
    ActionPayload,
    ChatPayload,
    StatusPayload,
    ControlPayload,
    ResponseMode,
} from '@delphi/validation'
import {
    createChatMessage,
    createActionResultMessage,
    createActionAckMessage,
    createAsyncActionResultMessage,
    createActionUpdateChatMessage,
    createReconnectMessage,
    createPingMessage,
    createEnableTextChatMessage,
    createDisableTextChatMessage,
    createContextUpdateMessage,
    createTextChatMessage,
    createReadAloudMessage,
} from '@delphi/validation'

// Connection states
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

/**
 * Sync action result - action completed immediately
 */
export interface SyncActionResult {
    success: boolean
    data?: unknown
    error?: string
}

/**
 * Async action result - action will complete later
 * Browser should call sendAsyncActionResult() when done
 */
export interface AsyncActionResult {
    /** Indicates this is an async action */
    async: true
    /** Optional acknowledgment message */
    message?: string
}

/**
 * Action handler return type
 * - Return SyncActionResult for immediate completion
 * - Return AsyncActionResult to indicate async execution
 */
export type ActionResult = SyncActionResult | AsyncActionResult

/**
 * Action handler type
 * Can return sync result or async indicator
 */
export type ActionHandler = (action: ActionPayload) => Promise<ActionResult>

// Message handler type
export type MessageHandler = (message: ChannelMessage) => void

export interface UseCallChannelOptions {
    /** Call ID from call token */
    callId: string | null
    /** WebSocket token for authentication */
    wsToken: string | null
    /** TelAPI WebSocket URL (defaults to env var or localhost) */
    wsUrl?: string
    /** Handler for action requests from ARI */
    onAction?: ActionHandler
    /** Handler for all incoming messages */
    onMessage?: MessageHandler
    /** Handler for chat messages specifically */
    onChat?: (chat: ChatPayload, message: ChannelMessage) => void
    /** Handler for status updates */
    onStatus?: (status: StatusPayload, message: ChannelMessage) => void
    /** Handler for control messages (text chat enable/disable confirmations) */
    onControl?: (control: ControlPayload, message: ChannelMessage) => void
    /** Handler for connection state changes */
    onConnectionChange?: (state: ConnectionState) => void
    /** Handler for errors */
    onError?: (error: Error) => void
    /** Enable auto-reconnection (default: true) */
    autoReconnect?: boolean
    /** Reconnection delay in ms (default: 2000) */
    reconnectDelay?: number
    /** Ping interval in ms (default: 30000) */
    pingInterval?: number
}

export interface UseCallChannelReturn {
    /** Current connection state */
    connectionState: ConnectionState
    /** Whether connected */
    connected: boolean
    /** Whether text chat is enabled (AI will respond to text) */
    textChatEnabled: boolean
    /** Chat message history */
    messages: ChannelMessage[]
    /**
     * Send a chat message with full control over response behavior
     * @param content - Message content
     * @param options - Intent, response behavior, and metadata
     */
    sendChat: (
        content: string,
        options?: {
            intent?: ChatPayload['intent']
            responseExpected?: boolean
            preferredResponse?: ResponseMode
            metadata?: Record<string, unknown>
        },
    ) => boolean
    /**
     * Send context update - adds to AI context WITHOUT triggering response
     * Use for: async action completed, background state changes, informational updates
     */
    sendContextUpdate: (content: string, metadata?: Record<string, unknown>) => boolean
    /**
     * Send text chat - expects TEXT response from AI
     * Use for: active text conversation
     */
    sendTextChat: (content: string, metadata?: Record<string, unknown>) => boolean
    /**
     * Send read-aloud request - expects VOICE response from AI
     * Use for: user highlighted text, wants AI to speak it
     */
    sendReadAloud: (content: string, metadata?: Record<string, unknown>) => boolean
    /** Enable text chat mode - AI will respond to text messages */
    enableTextChat: (responseMode?: ResponseMode) => boolean
    /** Disable text chat mode - AI returns to voice-only */
    disableTextChat: () => boolean
    /**
     * Send async action result (for actions that return { async: true })
     * Call this when async action completes
     */
    sendAsyncActionResult: (
        actionId: string,
        success: boolean,
        options?: { data?: unknown; error?: string; durationMs?: number },
    ) => boolean
    /**
     * Send async action progress update
     * Use to notify AI that action is still executing
     */
    sendActionProgress: (actionId: string, status: 'received' | 'executing') => boolean
    /**
     * Send async action update via chat
     * Alternative way to report async action completion with descriptive message
     */
    sendActionUpdateChat: (
        actionId: string,
        content: string,
        metadata?: Record<string, unknown>,
    ) => boolean
    /** Send a custom message */
    sendMessage: (message: Partial<ChannelMessage>) => boolean
    /** Manually connect */
    connect: () => void
    /** Manually disconnect */
    disconnect: () => void
    /** Clear message history */
    clearMessages: () => void
    /** Last error if any */
    lastError: Error | null
}

const DEFAULT_WS_URL = process.env.NEXT_PUBLIC_TELAPI_WS_URL || 'ws://localhost:3001'

export function useCallChannel(options: UseCallChannelOptions): UseCallChannelReturn {
    const {
        callId,
        wsToken,
        wsUrl = DEFAULT_WS_URL,
        onAction,
        onMessage,
        onChat,
        onStatus,
        onControl,
        onConnectionChange,
        onError,
        autoReconnect = true,
        reconnectDelay = 2000,
        pingInterval = 30000,
    } = options

    // State
    const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
    const [messages, setMessages] = useState<ChannelMessage[]>([])
    const [lastError, setLastError] = useState<Error | null>(null)
    const [textChatEnabled, setTextChatEnabled] = useState(false)

    // Refs
    const wsRef = useRef<WebSocket | null>(null)
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const lastMessageIdRef = useRef<string | null>(null)
    const mountedRef = useRef(true)
    const connectRef = useRef<(() => void) | null>(null)

    // Update connection state and notify
    const updateConnectionState = useCallback(
        (state: ConnectionState) => {
            if (!mountedRef.current) return
            setConnectionState(state)
            onConnectionChange?.(state)
        },
        [onConnectionChange],
    )

    // Handle errors
    const handleError = useCallback(
        (error: Error) => {
            if (!mountedRef.current) return
            setLastError(error)
            onError?.(error)
            console.error('[CallChannel] Error:', error)
        },
        [onError],
    )

    // Send message through WebSocket
    const sendRawMessage = useCallback(
        (message: ChannelMessage): boolean => {
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                return false
            }
            try {
                wsRef.current.send(JSON.stringify(message))
                return true
            } catch (error) {
                handleError(error instanceof Error ? error : new Error('Failed to send message'))
                return false
            }
        },
        [handleError],
    )

    // Handle incoming messages
    const handleMessage = useCallback(
        async (event: MessageEvent) => {
            if (!mountedRef.current) return

            let message: ChannelMessage
            try {
                message = JSON.parse(event.data)
            } catch (error) {
                console.error('[CallChannel] Failed to parse message:', error)
                return
            }

            // Track last message ID for reconnection replay
            lastMessageIdRef.current = message.messageId

            // Call general message handler
            onMessage?.(message)

            // Handle specific message types
            switch (message.type) {
                case 'chat':
                    if (message.chat) {
                        // Add to messages array
                        setMessages((prev) => [...prev, message])
                        onChat?.(message.chat, message)
                    }
                    break

                case 'action':
                    if (message.action && onAction) {
                        const actionId = message.action.actionId
                        const startTime = Date.now()

                        try {
                            const result = await onAction(message.action)

                            // Check if this is an async action
                            if ('async' in result && result.async) {
                                // Async action - send acknowledgment, browser will send result later
                                if (message.action.requiresResponse && callId) {
                                    const ackMessage = createActionAckMessage(
                                        callId,
                                        actionId,
                                        'received',
                                    )
                                    sendRawMessage(ackMessage)
                                }
                            } else {
                                // Sync action - send immediate result
                                const durationMs = Date.now() - startTime
                                const syncResult = result as SyncActionResult
                                if (message.action.requiresResponse && callId) {
                                    const resultMessage = createActionResultMessage(
                                        callId,
                                        actionId,
                                        syncResult.success,
                                        {
                                            data: syncResult.data,
                                            error: syncResult.error,
                                            durationMs,
                                        },
                                    )
                                    sendRawMessage(resultMessage)
                                }
                            }
                        } catch (error) {
                            // Send error result
                            if (message.action.requiresResponse && callId) {
                                const errorMessage = createActionResultMessage(
                                    callId,
                                    actionId,
                                    false,
                                    {
                                        error:
                                            error instanceof Error
                                                ? error.message
                                                : 'Action failed',
                                    },
                                )
                                sendRawMessage(errorMessage)
                            }
                        }
                    }
                    break

                case 'status':
                    if (message.status) {
                        // Track text chat state from server confirmations
                        if (message.status.state === 'text_chat_enabled') {
                            setTextChatEnabled(true)
                        } else if (message.status.state === 'text_chat_disabled') {
                            setTextChatEnabled(false)
                        }
                        onStatus?.(message.status, message)
                    }
                    break

                case 'control':
                    if (message.control) {
                        onControl?.(message.control, message)
                    }
                    break

                case 'pong':
                    // Keepalive response, nothing to do
                    break

                case 'error':
                    if (message.error) {
                        handleError(new Error(`${message.error.code}: ${message.error.message}`))
                    }
                    break
            }
        },
        [callId, onMessage, onChat, onStatus, onControl, onAction, sendRawMessage, handleError],
    )

    // Connect to WebSocket
    const connect = useCallback(() => {
        if (!callId || !wsToken) {
            console.debug('[CallChannel] Missing callId or wsToken, cannot connect')
            return
        }

        // Clear any pending reconnection
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current)
            reconnectTimerRef.current = null
        }

        // Close existing connection with proper close code
        if (wsRef.current) {
            wsRef.current.close(1000, 'New connection')
            wsRef.current = null
        }

        // Clear ping timer
        if (pingTimerRef.current) {
            clearInterval(pingTimerRef.current)
            pingTimerRef.current = null
        }

        updateConnectionState('connecting')

        try {
            const ws = new WebSocket(
                `${wsUrl}/ws/call?callId=${encodeURIComponent(callId)}&token=${encodeURIComponent(wsToken)}`,
            )
            wsRef.current = ws

            ws.onopen = () => {
                if (!mountedRef.current) return
                console.debug('[CallChannel] Connected')
                updateConnectionState('connected')
                setLastError(null)

                // Request missed messages if reconnecting
                if (lastMessageIdRef.current) {
                    const reconnectMsg = createReconnectMessage(callId, lastMessageIdRef.current)
                    ws.send(JSON.stringify(reconnectMsg))
                }

                // Start ping interval
                pingTimerRef.current = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        const pingMsg = createPingMessage(callId)
                        ws.send(JSON.stringify(pingMsg))
                    }
                }, pingInterval)
            }

            ws.onmessage = handleMessage

            ws.onclose = (event) => {
                if (!mountedRef.current) return
                console.debug('[CallChannel] Disconnected:', event.code, event.reason)

                // Clear ping timer
                if (pingTimerRef.current) {
                    clearInterval(pingTimerRef.current)
                    pingTimerRef.current = null
                }

                // Reset text chat state on disconnect
                setTextChatEnabled(false)

                // Handle reconnection - only reconnect on unexpected disconnections
                // Don't reconnect for:
                // - 1000: Normal closure (client initiated)
                // - 4000: Superseded by new connection (server initiated)
                // - 4001-4099: Client errors
                const shouldReconnect =
                    autoReconnect &&
                    callId &&
                    wsToken &&
                    event.code !== 1000 &&
                    event.code !== 4000 &&
                    !(event.code >= 4001 && event.code <= 4099)

                if (shouldReconnect) {
                    updateConnectionState('reconnecting')
                    reconnectTimerRef.current = setTimeout(() => {
                        if (mountedRef.current) {
                            console.debug('[CallChannel] Attempting reconnection...')
                            connectRef.current?.()
                        }
                    }, reconnectDelay)
                } else {
                    updateConnectionState('disconnected')
                }
            }

            ws.onerror = (event) => {
                console.error('[CallChannel] WebSocket error:', event)
                handleError(new Error('WebSocket connection error'))
            }
        } catch (error) {
            handleError(error instanceof Error ? error : new Error('Failed to create WebSocket'))
            updateConnectionState('disconnected')
        }
    }, [
        callId,
        wsToken,
        wsUrl,
        pingInterval,
        autoReconnect,
        reconnectDelay,
        handleMessage,
        updateConnectionState,
        handleError,
    ])

    // Update connect ref after function is created
    useEffect(() => {
        connectRef.current = connect
    }, [connect])

    // Disconnect from WebSocket
    const disconnect = useCallback(() => {
        // Clear timers
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current)
            reconnectTimerRef.current = null
        }
        if (pingTimerRef.current) {
            clearInterval(pingTimerRef.current)
            pingTimerRef.current = null
        }

        // Close WebSocket with proper close code
        if (wsRef.current) {
            wsRef.current.close(1000, 'Client disconnect')
            wsRef.current = null
        }

        updateConnectionState('disconnected')
        setTextChatEnabled(false)
        lastMessageIdRef.current = null
    }, [updateConnectionState])

    // Enable text chat mode
    const enableTextChat = useCallback(
        (responseMode: ResponseMode = 'text'): boolean => {
            if (!callId) return false
            const message = createEnableTextChatMessage(callId, responseMode)
            const sent = sendRawMessage(message)
            if (sent) {
                // Optimistically set state (will be confirmed by server)
                setTextChatEnabled(true)
            }
            return sent
        },
        [callId, sendRawMessage],
    )

    // Disable text chat mode
    const disableTextChat = useCallback((): boolean => {
        if (!callId) return false
        const message = createDisableTextChatMessage(callId)
        const sent = sendRawMessage(message)
        if (sent) {
            // Optimistically set state (will be confirmed by server)
            setTextChatEnabled(false)
        }
        return sent
    }, [callId, sendRawMessage])

    // Send async action result (for actions that returned { async: true })
    const sendAsyncActionResult = useCallback(
        (
            actionId: string,
            success: boolean,
            options: { data?: unknown; error?: string; durationMs?: number } = {},
        ): boolean => {
            if (!callId) return false
            const message = createAsyncActionResultMessage(callId, actionId, success, options)
            return sendRawMessage(message)
        },
        [callId, sendRawMessage],
    )

    // Send action progress update
    const sendActionProgress = useCallback(
        (actionId: string, status: 'received' | 'executing'): boolean => {
            if (!callId) return false
            const message = createActionAckMessage(callId, actionId, status)
            return sendRawMessage(message)
        },
        [callId, sendRawMessage],
    )

    // Send action update via chat (alternative to action_result)
    const sendActionUpdateChat = useCallback(
        (actionId: string, content: string, metadata?: Record<string, unknown>): boolean => {
            if (!callId) return false
            const message = createActionUpdateChatMessage(callId, actionId, content, metadata)
            return sendRawMessage(message)
        },
        [callId, sendRawMessage],
    )

    // Send a chat message with full control
    const sendChat = useCallback(
        (
            content: string,
            options: {
                intent?: ChatPayload['intent']
                responseExpected?: boolean
                preferredResponse?: ResponseMode
                metadata?: Record<string, unknown>
            } = {},
        ): boolean => {
            if (!callId) return false

            const message = createChatMessage(callId, 'to_ari', 'user', content, options.metadata)

            // Set optional fields if provided
            if (message.chat) {
                if (options.intent) message.chat.intent = options.intent
                if (options.responseExpected !== undefined)
                    message.chat.responseExpected = options.responseExpected
                if (options.preferredResponse)
                    message.chat.preferredResponse = options.preferredResponse
            }

            // Add to local messages
            setMessages((prev) => [...prev, message])

            return sendRawMessage(message)
        },
        [callId, sendRawMessage],
    )

    // Send context update - NO response expected
    const sendContextUpdate = useCallback(
        (content: string, metadata?: Record<string, unknown>): boolean => {
            if (!callId) return false
            const message = createContextUpdateMessage(callId, content, metadata)
            setMessages((prev) => [...prev, message])
            return sendRawMessage(message)
        },
        [callId, sendRawMessage],
    )

    // Send text chat - expects TEXT response
    const sendTextChat = useCallback(
        (content: string, metadata?: Record<string, unknown>): boolean => {
            if (!callId) return false
            const message = createTextChatMessage(callId, content, metadata)
            setMessages((prev) => [...prev, message])
            return sendRawMessage(message)
        },
        [callId, sendRawMessage],
    )

    // Send read-aloud request - expects VOICE response
    const sendReadAloud = useCallback(
        (content: string, metadata?: Record<string, unknown>): boolean => {
            if (!callId) return false
            const message = createReadAloudMessage(callId, content, metadata)
            setMessages((prev) => [...prev, message])
            return sendRawMessage(message)
        },
        [callId, sendRawMessage],
    )

    // Send a custom message
    const sendMessage = useCallback(
        (partial: Partial<ChannelMessage>): boolean => {
            if (!callId) return false

            const message: ChannelMessage = {
                type: 'chat',
                callId,
                messageId: crypto.randomUUID(),
                timestamp: Date.now(),
                direction: 'to_ari',
                ...partial,
            } as ChannelMessage

            return sendRawMessage(message)
        },
        [callId, sendRawMessage],
    )

    // Clear message history
    const clearMessages = useCallback(() => {
        setMessages([])
    }, [])

    // Track mounted state
    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
        }
    }, [])

    // Auto-connect when callId and wsToken are available
    // Using refs to avoid dependency on connect function which changes frequently
    // connectRef is already declared above and updated via useEffect

    // Track previous callId to detect call changes
    const prevCallIdRef = useRef<string | null>(null)

    useEffect(() => {
        // Detect if this is a new call (callId changed)
        const isNewCall =
            callId && prevCallIdRef.current !== null && prevCallIdRef.current !== callId
        prevCallIdRef.current = callId

        if (isNewCall) {
            // Clear messages when starting a new call
            startTransition(() => {
                setMessages([])
            })
            lastMessageIdRef.current = null
            console.debug('[CallChannel] New call detected, clearing messages')
        }

        if (callId && wsToken) {
            // Only connect if not already connected or connecting
            if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
                connectRef.current?.()
            }
        }

        return () => {
            // Cleanup on unmount or when callId/wsToken changes
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current)
                reconnectTimerRef.current = null
            }
            if (pingTimerRef.current) {
                clearInterval(pingTimerRef.current)
                pingTimerRef.current = null
            }
            if (wsRef.current) {
                // Close with proper code to avoid 1005
                wsRef.current.close(1000, 'Call ended')
                wsRef.current = null
            }
        }
    }, [callId, wsToken]) // Intentionally not including connect to avoid loops

    return {
        connectionState,
        connected: connectionState === 'connected',
        textChatEnabled,
        messages,
        sendChat,
        sendContextUpdate,
        sendTextChat,
        sendReadAloud,
        enableTextChat,
        disableTextChat,
        sendAsyncActionResult,
        sendActionProgress,
        sendActionUpdateChat,
        sendMessage,
        connect,
        disconnect,
        clearMessages,
        lastError,
    }
}

export default useCallChannel
