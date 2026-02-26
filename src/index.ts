'use client'

// Components
export { WebRTCConfigInit } from './WebRTCConfigInit'

// Types
export type {
    WebRTCConfig,
    WebRTCPhoneProps,
    IceServer,
    InitiateCallParams,
    PersistedCallState,
    CallTokenResponse,
} from './types'

// Phone Store (internal state - exposed for advanced use cases)
export { useWebRTCPhoneStore } from './stores/webrtcPhoneStore'
export { webrtcRefs } from './stores/webrtcRefsStore'

export type {
    WebRTCPhoneConnectionState,
    WebRTCPhoneCallData,
    WebRTCPhoneDerivedUrls,
} from './stores/webrtcPhoneStore'

// Channel
export { useCallChannel } from './channel'
export type {
    UseCallChannelOptions,
    UseCallChannelReturn,
    ConnectionState,
    ActionHandler,
    MessageHandler,
    ActionResult,
    SyncActionResult,
    AsyncActionResult,
} from './channel'

// Hooks (for custom integrations)
export {
    useSendMessage,
    useSendDtmf,
    useCleanupCall,
    useCleanupJanus,
    useEnableAudio,
    useInitializeForCall,
    useInitJanus,
    useMakeCall,
    useRequestCallToken,
    useSelectionTracking,
    useTryPlayAudio,
} from './hooks'

// Utils (for custom integrations)
export {
    logDebug,
    randomString,
    getDerivedUrls,
    animationStyles,
    playDtmfTone,
    setAudioCodecPreferences,
    saveCallState,
    loadCallState,
    clearCallState,
    CALL_STATE_STORAGE_KEY,
} from './utils'
