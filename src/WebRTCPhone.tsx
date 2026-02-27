'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo, startTransition } from 'react'

import {
    Phone as PhoneIcon,
    Close as CloseIcon,
    CallEnd as CallEndIcon,
    ExpandMore as ExpandMoreIcon,
    ExpandLess as ExpandLessIcon,
    Dialpad as DialpadIcon,
    VolumeOff as VolumeOffIcon,
    VolumeUp as VolumeUpIcon,
    Chat as ChatIcon,
    Send as SendIcon,
} from '@mui/icons-material'
import {
    Box,
    Fab,
    Dialog,
    DialogTitle,
    DialogContent,
    IconButton,
    TextField,
    Button,
    Typography,
    Paper,
    Chip,
    CircularProgress,
    Collapse,
    Badge,
    Tooltip,
} from '@mui/material'

import type { ActionHandler, useCallChannel } from './channel/useCallChannel'
import {
    useSendMessage,
    useMakeCall,
    useCleanupCall,
    useCleanupJanus,
    useEnableAudio,
    useInitializeForCall,
    useInitJanus,
    useSendDtmf,
    useSelectionTracking,
} from './hooks'
import { useBrowserAction } from './hooks/useBrowserAction'
import { useWebRTCPhoneStore } from './stores/webrtcPhoneStore'
import { webrtcRefs } from './stores/webrtcRefsStore'
import { animationStyles, logDebug, saveCallState, loadCallState, clearCallState } from './utils'

interface WebRTCPhoneProps {
    /** Optional callback for SPA navigation. If not provided, falls back to History API. */
    onNavigate?: (path: string) => void
}

export const WebRTCPhone: React.FC<WebRTCPhoneProps> = ({ onNavigate }) => {
    // Get config and pending call from SDK store
    const { apiDomain, preferPcma: _preferPcma = true } = useWebRTCPhoneStore(
        (state) => state.webrtcConfig,
    )
    const pendingCall = useWebRTCPhoneStore((state) => state.pendingCall)
    const clearPendingCall = useWebRTCPhoneStore((state) => state.clearPendingCall)

    // Local UI state
    const [open, setOpen] = useState(false)
    const [dialpadOpen, setDialpadOpen] = useState(false)
    const [chatOpen, setChatOpen] = useState(false)

    // Use WebRTC phone store for state management
    const audioBlocked = useWebRTCPhoneStore((state) => state.ui.audioBlocked)
    const connection = useWebRTCPhoneStore((state) => state.connection)
    const callData = useWebRTCPhoneStore((state) => state.callData)

    const setCalling = useWebRTCPhoneStore((state) => state.setCalling)
    const setInCall = useWebRTCPhoneStore((state) => state.setInCall)
    const setStatus = useWebRTCPhoneStore((state) => state.setStatus)
    const setInitialized = useWebRTCPhoneStore((state) => state.setInitialized)
    const setReconnecting = useWebRTCPhoneStore((state) => state.setReconnecting)
    const setAppEndpointName = useWebRTCPhoneStore((state) => state.setAppEndpointName)
    const setCurrentCallId = useWebRTCPhoneStore((state) => state.setCurrentCallId)
    const setCurrentWsToken = useWebRTCPhoneStore((state) => state.setCurrentWsToken)
    const clearDtmfDigits = useWebRTCPhoneStore((state) => state.clearDtmfDigits)
    const getDerivedUrlsFor = useWebRTCPhoneStore((state) => state.getDerivedUrlsFor)

    // Derive URLs from config (recalculated when telproDomain changes)
    // Note: telproDomain will be set when call token is received from API
    const {
        janusServer: _janusServer,
        telapiWsUrl,
        iceServers: _iceServers,
    } = useMemo(() => getDerivedUrlsFor(apiDomain), [apiDomain, getDerivedUrlsFor])

    // Destructure commonly used values for convenience
    const { connected, registered, calling, inCall, initialized, reconnecting, status } = connection
    const { endpointId, appName, currentCallId, currentWsToken, telproDomain, dtmfDigits } =
        callData

    const { remoteAudioRef, localAudioRef, initializingRef, pendingReconnectRef } = webrtcRefs
    const sendMessage = useSendMessage()
    const cleanupCall = useCleanupCall()
    const initJanus = useInitJanus()
    const cleanupJanus = useCleanupJanus()
    const enableAudio = useEnableAudio()
    const initializeForCall = useInitializeForCall()
    const restoreFromPersistedState = useWebRTCPhoneStore(
        (state) => state.restoreFromPersistedState,
    )
    const handleCall = useMakeCall()
    const sendDtmf = useSendDtmf()

    // Refs for unstable hook return values (not wrapped in useCallback)
    // These prevent useEffect dependency changes on every render
    const initJanusRef = useRef(initJanus)
    const cleanupJanusRef = useRef(cleanupJanus)
    const initializeForCallRef = useRef(initializeForCall)
    // Tracks whether we've already auto-enabled text chat for the current call session
    // Prevents the auto-enable effect from overriding an intentional user disable
    const hasAutoEnabledTextChatRef = useRef(false)
    useEffect(() => {
        initJanusRef.current = initJanus
    }, [initJanus])
    useEffect(() => {
        cleanupJanusRef.current = cleanupJanus
    }, [cleanupJanus])
    useEffect(() => {
        initializeForCallRef.current = initializeForCall
    }, [initializeForCall])

    // Check for stored call state on mount and auto-reconnect (in background, no dialog)
    // Uses refs for unstable functions to ensure this only runs on mount
    useEffect(() => {
        const storedState = restoreFromPersistedState()
        if (storedState) {
            pendingReconnectRef.current = storedState
            if (storedState.telproDomain) {
                initJanusRef.current(storedState.telproDomain)
            }
        }
    }, [restoreFromPersistedState, pendingReconnectRef])

    // Initialize Janus when dialog is first opened, keep running in background
    // Only if we have telproDomain (either from config or from call token)
    useEffect(() => {
        if (open && !initialized && !initializingRef.current && telproDomain) {
            setInitialized(true)
            initJanusRef.current(telproDomain)
        }
    }, [open, telproDomain, initialized, initializingRef, setInitialized])

    // Periodically update stored timestamp while in call (every 5s)
    // This ensures TTL check works even if beforeunload doesn't fire
    useEffect(() => {
        if (!inCall && !calling) return

        const updateTimestamp = () => {
            const currentState = loadCallState()
            if (currentState) {
                saveCallState({ ...currentState, startedAt: Date.now() })
                logDebug('Updated call state timestamp')
            }
        }

        // Update immediately and then every 5 seconds
        updateTimestamp()
        const interval = setInterval(updateTimestamp, 5000)

        return () => clearInterval(interval)
    }, [inCall, calling])

    // Cleanup only on component unmount
    useEffect(() => {
        return () => cleanupJanusRef.current()
    }, [])

    useEffect(() => {
        if (!pendingCall) return

        const {
            endpointId: pendingEndpointId,
            phoneNumber,
            endpointName: pendingEndpointName,
            appName: pendingAppName,
        } = pendingCall

        logDebug('Pending call received:', pendingEndpointId, phoneNumber, 'app:', pendingAppName)

        initializeForCallRef.current(pendingCall)

        // Batch all state updates as a non-urgent transition to avoid cascading renders
        startTransition(() => {
            setAppEndpointName(pendingEndpointId, pendingEndpointName || '', pendingAppName || '')
            setOpen(true)
            clearPendingCall()
        })
    }, [pendingCall, clearPendingCall, setAppEndpointName, setOpen])

    // Hangup
    const handleHangup = useCallback(async () => {
        try {
            await sendMessage({ janus: 'message', body: { request: 'hangup' } })
        } catch {
            // Ignore hangup errors
        }
        setInCall(false)
        setCalling(false)
        setCurrentCallId(null)
        setCurrentWsToken(null)
        setChatOpen(false) // Close chat panel
        clearDtmfDigits() // Clear DTMF digits
        setStatus(registered ? 'Connected' : 'Disconnected')
        cleanupCall()
        clearCallState() // Clear stored state on explicit hangup
        // Keep endpointId and endpointName for "Call Again" functionality
    }, [
        sendMessage,
        setInCall,
        setCalling,
        setCurrentCallId,
        setCurrentWsToken,
        clearDtmfDigits,
        setStatus,
        registered,
        cleanupCall,
    ])

    // Register handleHangup so hooks (e.g. useHandleMessage) can trigger it for remote hangups
    useEffect(() => {
        webrtcRefs.onHangupRef.current = handleHangup
        return () => {
            webrtcRefs.onHangupRef.current = null
        }
    }, [handleHangup])

    // Minimize - just close the dialog, keep call running
    const handleMinimize = () => {
        setOpen(false)
    }

    // Full disconnect - hangup and cleanup
    const handleDisconnect = async () => {
        if (inCall || calling) await handleHangup()
        cleanupJanus()
        setInitialized(false)
        setOpen(false)
    }

    // State for chat input
    const [chatInput, setChatInput] = useState('')

    // Action handler for browser actions from ARI (AI tool calls)
    const handleBrowserAction: ActionHandler = useBrowserAction(onNavigate)

    // Call channel hook for bidirectional communication with ARI
    const {
        connectionState: _channelState,
        connected: channelConnected,
        textChatEnabled,
        messages: channelMessages,
        sendChat: _sendChannelChat,
        sendContextUpdate,
        sendTextChat,
        sendReadAloud,
        enableTextChat,
        disableTextChat,
        clearMessages: _clearChannelMessages,
    } = useCallChannel({
        callId: currentCallId,
        wsToken: currentWsToken,
        wsUrl: telapiWsUrl,
        onAction: handleBrowserAction,
        onChat: (chat, _message) => {
            logDebug('Chat received:', chat.role, chat.content)
        },
        onStatus: (status) => {
            logDebug('Channel status:', status.state)
            // Show notification for text chat state changes
            if (status.state === 'text_chat_enabled') {
                logDebug('Text chat mode enabled - AI will respond via text')
            } else if (status.state === 'text_chat_disabled') {
                logDebug('Text chat mode disabled - AI will respond via voice')
            }
        },
        onConnectionChange: (state) => {
            logDebug('Channel connection state:', state)
        },
    })

    // Toggle text chat mode
    const handleToggleTextChat = useCallback(() => {
        if (textChatEnabled) {
            disableTextChat()
        } else {
            enableTextChat('text')
        }
    }, [textChatEnabled, enableTextChat, disableTextChat])

    // Send chat message (as text chat - expects text response)
    const handleSendChat = useCallback(() => {
        if (!chatInput.trim()) return
        if (textChatEnabled) {
            // When text chat is enabled, use sendTextChat for proper routing
            sendTextChat(chatInput.trim())
        } else {
            // Otherwise send as context_update (informational, no response)
            sendContextUpdate(chatInput.trim())
        }
        setChatInput('')
    }, [chatInput, sendTextChat, sendContextUpdate, textChatEnabled])

    // Send as read-aloud request - AI will speak this
    const handleReadAloud = useCallback(() => {
        if (!chatInput.trim()) return
        sendReadAloud(chatInput.trim())
        setChatInput('')
    }, [chatInput, sendReadAloud])

    // Auto-enable text chat once when call and channel first connect
    // Uses a ref so the effect doesn't re-enable after the user manually disables it
    useEffect(() => {
        if (inCall && channelConnected && !hasAutoEnabledTextChatRef.current) {
            hasAutoEnabledTextChatRef.current = true
            logDebug('Auto-enabling text chat - call and channel connected')
            enableTextChat('text')
        }
        // Reset on call end so next call gets auto-enabled again
        if (!inCall) {
            hasAutoEnabledTextChatRef.current = false
        }
    }, [inCall, channelConnected, enableTextChat])

    // Track selected text and provide read-aloud handler (state lives in the store)
    const { selectedText, handleReadAloudSelected, showReadAloudFab } = useSelectionTracking({
        sendReadAloud,
        channelConnected,
    })

    // Determine if there's an active session (calling, in call, or reconnecting)
    const hasActiveCall = inCall || calling || reconnecting

    return (
        <>
            {/* Read-aloud FAB - appears when text is selected during a call */}
            {showReadAloudFab && (
                <Tooltip
                    title={`Read aloud: "${selectedText.substring(0, 30)}${selectedText.length > 30 ? '...' : ''}"`}
                >
                    <Fab
                        color="secondary"
                        size="medium"
                        aria-label="read aloud"
                        onClick={handleReadAloudSelected}
                        sx={{
                            position: 'fixed',
                            bottom: 28,
                            right: 88, // Position to the left of phone FAB
                            zIndex: 1300,
                            animation: 'fadeIn 0.2s ease-in-out',
                            '@keyframes fadeIn': {
                                from: { opacity: 0, transform: 'scale(0.8)' },
                                to: { opacity: 1, transform: 'scale(1)' },
                            },
                        }}
                    >
                        <VolumeUpIcon />
                    </Fab>
                </Tooltip>
            )}

            {/* Phone FAB */}
            <Badge
                color={audioBlocked ? 'warning' : reconnecting ? 'warning' : 'error'}
                variant="dot"
                invisible={!hasActiveCall && !audioBlocked}
                overlap="circular"
                sx={{
                    position: 'fixed',
                    bottom: 24,
                    right: 24,
                    zIndex: 1300,
                }}
            >
                <Fab
                    color={
                        reconnecting
                            ? 'warning'
                            : hasActiveCall
                              ? 'error'
                              : connected
                                ? 'primary'
                                : 'default'
                    }
                    aria-label="phone"
                    onClick={() => {
                        // If audio is blocked, clicking FAB enables audio first
                        if (audioBlocked) {
                            enableAudio()
                        }
                        setOpen(true)
                    }}
                    sx={{
                        ...(hasActiveCall && {
                            animation: animationStyles(reconnecting),
                        }),
                    }}
                >
                    {audioBlocked ? (
                        <VolumeOffIcon />
                    ) : hasActiveCall ? (
                        <CallEndIcon />
                    ) : (
                        <PhoneIcon />
                    )}
                </Fab>
            </Badge>

            <Dialog
                open={open}
                onClose={handleMinimize}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        position: 'fixed',
                        bottom: 80,
                        right: 24,
                        m: 0,
                        maxHeight: 'calc(100vh - 120px)',
                        width: 360,
                    },
                }}
            >
                <DialogTitle sx={{ pb: 1 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Typography variant="h6">
                            WebRTC Phone
                            {hasActiveCall && (
                                <Chip
                                    label={
                                        reconnecting
                                            ? 'Reconnecting...'
                                            : inCall
                                              ? appName
                                                  ? `In Call: ${appName}`
                                                  : 'In Call'
                                              : appName
                                                ? `Calling ${appName}...`
                                                : 'Calling...'
                                    }
                                    size="small"
                                    color={reconnecting ? 'warning' : 'error'}
                                    sx={{ ml: 1, verticalAlign: 'middle' }}
                                />
                            )}
                        </Typography>
                        <IconButton onClick={handleMinimize} size="small" title="Minimize">
                            <CloseIcon />
                        </IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Paper sx={{ p: 1.5, bgcolor: connected ? 'success.light' : 'grey.200' }}>
                            <Box display="flex" justifyContent="space-between" alignItems="center">
                                <Typography variant="body2" fontWeight="medium">
                                    Status:
                                </Typography>
                                <Chip
                                    label={status}
                                    size="small"
                                    color={connected ? 'success' : 'default'}
                                />
                            </Box>
                        </Paper>

                        {(!connected || reconnecting) && (
                            <Box display="flex" alignItems="center" gap={1}>
                                <CircularProgress size={16} />
                                <Typography variant="body2" color="text.secondary">
                                    {reconnecting
                                        ? 'Reconnecting to existing call...'
                                        : 'Connecting...'}
                                </Typography>
                            </Box>
                        )}

                        {/* Audio blocked warning - needs user interaction to enable */}
                        {audioBlocked && (
                            <Paper
                                sx={{
                                    p: 1.5,
                                    bgcolor: 'warning.light',
                                    cursor: 'pointer',
                                    '&:hover': { bgcolor: 'warning.main' },
                                }}
                                onClick={enableAudio}
                            >
                                <Box display="flex" alignItems="center" gap={1}>
                                    <VolumeOffIcon color="warning" />
                                    <Box>
                                        <Typography variant="body2" fontWeight="medium">
                                            Audio playback blocked
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Click here to enable audio
                                        </Typography>
                                    </Box>
                                    <VolumeUpIcon sx={{ ml: 'auto' }} />
                                </Box>
                            </Paper>
                        )}

                        {/* Dialpad Toggle */}
                        <Button
                            variant="text"
                            size="small"
                            onClick={() => setDialpadOpen(!dialpadOpen)}
                            startIcon={<DialpadIcon />}
                            endIcon={dialpadOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                            sx={{ alignSelf: 'flex-start' }}
                        >
                            {dialpadOpen ? 'Hide Dialpad' : 'Show Dialpad'}
                        </Button>

                        {/* Collapsible Dialpad */}
                        <Collapse in={dialpadOpen}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                {/* DTMF digit display */}
                                <Paper
                                    sx={{
                                        p: 1.5,
                                        bgcolor: 'grey.100',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        minHeight: 48,
                                    }}
                                >
                                    <Typography
                                        variant="h5"
                                        fontFamily="monospace"
                                        letterSpacing={2}
                                        sx={{
                                            color: dtmfDigits ? 'text.primary' : 'text.disabled',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            flex: 1,
                                        }}
                                    >
                                        {dtmfDigits || 'Enter digits...'}
                                    </Typography>
                                    {dtmfDigits && (
                                        <IconButton
                                            size="small"
                                            onClick={clearDtmfDigits}
                                            title="Clear digits"
                                        >
                                            <CloseIcon fontSize="small" />
                                        </IconButton>
                                    )}
                                </Paper>

                                {/* Dialpad buttons */}
                                <Box
                                    sx={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(3, 1fr)',
                                        gap: 1,
                                    }}
                                >
                                    {[
                                        '1',
                                        '2',
                                        '3',
                                        '4',
                                        '5',
                                        '6',
                                        '7',
                                        '8',
                                        '9',
                                        '*',
                                        '0',
                                        '#',
                                    ].map((digit) => (
                                        <Button
                                            key={digit}
                                            variant="outlined"
                                            onClick={() => sendDtmf(digit)}
                                            disabled={calling}
                                            sx={{
                                                minWidth: 0,
                                                py: 1.5,
                                                fontSize: '1.25rem',
                                                fontWeight: 'bold',
                                                '&:active': {
                                                    bgcolor: 'primary.light',
                                                    transform: 'scale(0.95)',
                                                },
                                                transition: 'transform 0.1s',
                                            }}
                                        >
                                            {digit}
                                        </Button>
                                    ))}
                                </Box>
                            </Box>
                        </Collapse>

                        <Box display="flex" gap={2} justifyContent="center">
                            {reconnecting ? (
                                <Button
                                    variant="outlined"
                                    color="warning"
                                    startIcon={<CircularProgress size={16} color="warning" />}
                                    onClick={() => {
                                        pendingReconnectRef.current = null
                                        setReconnecting(false)
                                        clearCallState()
                                        cleanupCall()
                                        setStatus(registered ? 'Connected' : 'Disconnected')
                                    }}
                                    fullWidth
                                >
                                    Cancel Reconnect
                                </Button>
                            ) : !inCall && !calling ? (
                                <Button
                                    variant="contained"
                                    startIcon={<PhoneIcon />}
                                    onClick={handleCall}
                                    disabled={!registered || !endpointId}
                                    fullWidth
                                >
                                    {endpointId
                                        ? appName
                                            ? `Call ${appName}`
                                            : 'Call Again'
                                        : 'Select Endpoint'}
                                </Button>
                            ) : calling ? (
                                <Button
                                    variant="outlined"
                                    startIcon={<CircularProgress size={16} />}
                                    disabled
                                    fullWidth
                                >
                                    Calling {appName || 'endpoint'}...
                                </Button>
                            ) : (
                                <Button
                                    variant="contained"
                                    color="error"
                                    startIcon={<CallEndIcon />}
                                    onClick={handleHangup}
                                    fullWidth
                                >
                                    Hang Up
                                </Button>
                            )}
                        </Box>

                        {/* Chat toggle (only when in call and channel available) */}
                        {hasActiveCall && currentCallId && (
                            <Button
                                variant="text"
                                size="small"
                                onClick={() => setChatOpen(!chatOpen)}
                                startIcon={
                                    <Badge
                                        color={channelConnected ? 'success' : 'default'}
                                        variant="dot"
                                        invisible={!currentWsToken}
                                    >
                                        <ChatIcon />
                                    </Badge>
                                }
                                endIcon={chatOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                sx={{ alignSelf: 'flex-start' }}
                            >
                                {chatOpen ? 'Hide Chat' : 'Show Chat'}
                                {channelConnected && (
                                    <Chip
                                        label="Connected"
                                        size="small"
                                        color="success"
                                        sx={{ ml: 1, height: 20 }}
                                    />
                                )}
                            </Button>
                        )}

                        {/* Collapsible Chat Panel */}
                        <Collapse in={chatOpen && hasActiveCall}>
                            {/* Text Chat Mode Toggle */}
                            <Box
                                display="flex"
                                alignItems="center"
                                justifyContent="space-between"
                                mb={1}
                            >
                                <Typography variant="caption" color="text.secondary">
                                    {textChatEnabled
                                        ? '💬 Text chat active - AI will respond via text'
                                        : '🎤 Voice mode - Messages are informational only'}
                                </Typography>
                                <Button
                                    size="small"
                                    variant={textChatEnabled ? 'contained' : 'outlined'}
                                    color={textChatEnabled ? 'primary' : 'inherit'}
                                    onClick={handleToggleTextChat}
                                    disabled={!channelConnected}
                                    sx={{ minWidth: 100 }}
                                >
                                    {textChatEnabled ? 'Disable Chat' : 'Enable Chat'}
                                </Button>
                            </Box>

                            <Paper
                                sx={{
                                    p: 1.5,
                                    maxHeight: 200,
                                    overflow: 'auto',
                                    bgcolor: 'grey.100',
                                }}
                            >
                                {channelMessages.length === 0 ? (
                                    <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        textAlign="center"
                                    >
                                        {textChatEnabled
                                            ? 'No messages yet. Type below to chat with AI.'
                                            : 'Enable text chat to have a conversation with AI.'}
                                    </Typography>
                                ) : (
                                    <Box
                                        sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}
                                    >
                                        {channelMessages
                                            .filter((m) => m.type === 'chat' && m.chat)
                                            .map((msg) => (
                                                <Box
                                                    key={msg.messageId}
                                                    sx={{
                                                        alignSelf:
                                                            msg.chat?.role === 'user'
                                                                ? 'flex-end'
                                                                : 'flex-start',
                                                        bgcolor:
                                                            msg.chat?.role === 'user'
                                                                ? 'primary.light'
                                                                : 'grey.300',
                                                        color:
                                                            msg.chat?.role === 'user'
                                                                ? 'primary.contrastText'
                                                                : 'text.primary',
                                                        px: 1.5,
                                                        py: 0.5,
                                                        borderRadius: 2,
                                                        maxWidth: '80%',
                                                    }}
                                                >
                                                    <Typography variant="body2">
                                                        {msg.chat?.content}
                                                    </Typography>
                                                </Box>
                                            ))}
                                    </Box>
                                )}
                            </Paper>
                            <Box display="flex" gap={1} mt={1}>
                                <TextField
                                    size="small"
                                    placeholder={
                                        textChatEnabled
                                            ? 'Type a message to AI...'
                                            : 'Type info for context...'
                                    }
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault()
                                            handleSendChat()
                                        }
                                    }}
                                    fullWidth
                                    disabled={!channelConnected}
                                />
                                <Tooltip
                                    title={textChatEnabled ? 'Send as text' : 'Add to context'}
                                >
                                    <span>
                                        <IconButton
                                            color="primary"
                                            onClick={handleSendChat}
                                            disabled={!channelConnected || !chatInput.trim()}
                                        >
                                            <SendIcon />
                                        </IconButton>
                                    </span>
                                </Tooltip>
                                <Tooltip title="Have AI read aloud (voice)">
                                    <span>
                                        <IconButton
                                            color="secondary"
                                            onClick={handleReadAloud}
                                            disabled={
                                                !channelConnected || !chatInput.trim() || !inCall
                                            }
                                        >
                                            <VolumeUpIcon />
                                        </IconButton>
                                    </span>
                                </Tooltip>
                            </Box>
                        </Collapse>

                        {/* Minimize hint when in call */}
                        {hasActiveCall && (
                            <Typography variant="caption" color="text.secondary" textAlign="center">
                                You can minimize this dialog - the call will continue in the
                                background.
                            </Typography>
                        )}

                        {/* Disconnect button (only when connected but not in a call) */}
                        {connected && !hasActiveCall && (
                            <Button
                                variant="text"
                                size="small"
                                color="inherit"
                                onClick={handleDisconnect}
                                sx={{ alignSelf: 'center', color: 'text.secondary' }}
                            >
                                Disconnect
                            </Button>
                        )}
                    </Box>
                </DialogContent>
            </Dialog>

            {/* Audio elements outside dialog so they persist when minimized */}
            <audio
                ref={remoteAudioRef}
                autoPlay
                aria-label="Remote audio"
                style={{ display: 'none' }}
            >
                <track kind="captions" />
            </audio>
            <audio ref={localAudioRef} muted aria-label="Local audio" style={{ display: 'none' }}>
                <track kind="captions" />
            </audio>
        </>
    )
}
