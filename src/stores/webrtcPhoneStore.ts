import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

import type { IceServer, PersistedCallState, WebRTCConfig, InitiateCallParams } from '../types'
import { clearCallState, getDerivedUrls, loadCallState, logDebug, setlogger } from '../utils'
/**
 * UI-related state for the WebRTC phone
 */
export interface WebRTCPhoneUIState {
    open: boolean
    dialpadOpen: boolean
    chatOpen: boolean
    audioBlocked: boolean
    selectedText: string
}

/**
 * Connection state for the WebRTC phone
 */
export interface WebRTCPhoneConnectionState {
    connected: boolean
    registered: boolean
    calling: boolean
    inCall: boolean
    initialized: boolean
    reconnecting: boolean
    status: string
}

/**
 * Call data for the active call
 */
export interface WebRTCPhoneCallData {
    endpointId: string
    endpointName: string
    appName: string
    currentCallId: string | null
    currentWsToken: string | null
    telproDomain: string | null
    janusUrl?: string
    apiUrl?: string
    iceServers?: Array<IceServer>
    dtmfDigits: string
}

/**
 * Derived URLs based on telproDomain and apiDomain
 */
export interface WebRTCPhoneDerivedUrls {
    janusServer: string
    telapiUrl: string
    telapiWsUrl: string
    iceServers: Array<IceServer>
}

/**
 * Complete WebRTC phone store interface
 */
interface IWebRTCPhoneStore {
    // UI State
    ui: WebRTCPhoneUIState
    setOpen: (open: boolean) => void
    setDialpadOpen: (dialpadOpen: boolean) => void
    setChatOpen: (chatOpen: boolean) => void
    setAudioBlocked: (audioBlocked: boolean) => void
    setSelectedText: (selectedText: string) => void

    // Connection State
    connection: WebRTCPhoneConnectionState
    setConnected: (connected: boolean) => void
    setRegistered: (registered: boolean) => void
    setCalling: (calling: boolean) => void
    setInCall: (inCall: boolean) => void
    setInitialized: (initialized: boolean) => void
    setReconnecting: (reconnecting: boolean) => void
    setStatus: (status: string) => void

    // Call Data
    callData: WebRTCPhoneCallData
    setAppEndpointName: (endpointId: string, endpointName: string, appName: string) => void
    setEndpointId: (endpointId: string) => void
    setEndpointName: (endpointName: string) => void
    setAppName: (appName: string) => void
    setCurrentCallId: (currentCallId: string | null) => void
    setCurrentWsToken: (currentWsToken: string | null) => void
    setTelproDomain: (telproDomain: string | null) => void
    setDtmfDigits: (dtmfDigits: string) => void
    appendDtmfDigit: (digit: string) => void
    clearDtmfDigits: () => void
    setCallData: (data: Partial<WebRTCPhoneCallData>) => void

    // Derived URLs (computed based on apiDomain from session store)
    getDerivedUrlsFor: (apiDomain: string) => WebRTCPhoneDerivedUrls

    // Restore persisted call state from sessionStorage
    // Returns the persisted state if found (so caller can trigger side-effects like initJanus),
    // or null if nothing to restore.
    restoreFromPersistedState: () => PersistedCallState | null

    // Bulk state updates
    resetCallData: () => void
    resetConnectionState: () => void
    resetUIState: () => void
    resetAll: () => void

    // WebRTC runtime config (set once at app startup)
    webrtcConfig: WebRTCConfig
    setWebRTCConfig: (config: WebRTCConfig) => void

    // WebRTC phone call initiation
    pendingCall: InitiateCallParams | null
    initiateCall: (params: InitiateCallParams) => void
    clearPendingCall: () => void
}

const initialUIState: WebRTCPhoneUIState = {
    open: false,
    dialpadOpen: false,
    chatOpen: false,
    audioBlocked: false,
    selectedText: '',
}

const initialConnectionState: WebRTCPhoneConnectionState = {
    connected: false,
    registered: false,
    calling: false,
    inCall: false,
    initialized: false,
    reconnecting: false,
    status: 'Disconnected',
}

const initialCallData: WebRTCPhoneCallData = {
    endpointId: '',
    endpointName: '',
    appName: '',
    currentCallId: null,
    currentWsToken: null,
    telproDomain: null,
    dtmfDigits: '',
}

export const useWebRTCPhoneStore = create<IWebRTCPhoneStore>()(
    subscribeWithSelector((set, get) => ({
        // UI State
        ui: initialUIState,
        setOpen: (open) =>
            set((state) => (state.ui.open === open ? state : { ui: { ...state.ui, open } })),
        setDialpadOpen: (dialpadOpen) =>
            set((state) =>
                state.ui.dialpadOpen === dialpadOpen ? state : { ui: { ...state.ui, dialpadOpen } },
            ),
        setChatOpen: (chatOpen) =>
            set((state) =>
                state.ui.chatOpen === chatOpen ? state : { ui: { ...state.ui, chatOpen } },
            ),
        setAudioBlocked: (audioBlocked) =>
            set((state) =>
                state.ui.audioBlocked === audioBlocked
                    ? state
                    : { ui: { ...state.ui, audioBlocked } },
            ),
        setSelectedText: (selectedText) =>
            set((state) =>
                state.ui.selectedText === selectedText
                    ? state
                    : { ui: { ...state.ui, selectedText } },
            ),

        // Connection State
        connection: initialConnectionState,
        setConnected: (connected) =>
            set((state) =>
                state.connection.connected === connected
                    ? state
                    : { connection: { ...state.connection, connected } },
            ),
        setRegistered: (registered) =>
            set((state) =>
                state.connection.registered === registered
                    ? state
                    : { connection: { ...state.connection, registered } },
            ),
        setCalling: (calling) =>
            set((state) =>
                state.connection.calling === calling
                    ? state
                    : { connection: { ...state.connection, calling } },
            ),
        setInCall: (inCall) =>
            set((state) =>
                state.connection.inCall === inCall
                    ? state
                    : { connection: { ...state.connection, inCall } },
            ),
        setInitialized: (initialized) =>
            set((state) =>
                state.connection.initialized === initialized
                    ? state
                    : { connection: { ...state.connection, initialized } },
            ),
        setReconnecting: (reconnecting) =>
            set((state) =>
                state.connection.reconnecting === reconnecting
                    ? state
                    : { connection: { ...state.connection, reconnecting } },
            ),
        setStatus: (status) =>
            set((state) =>
                state.connection.status === status
                    ? state
                    : { connection: { ...state.connection, status } },
            ),

        // Call Data
        callData: initialCallData,
        setAppEndpointName: (endpointId, endpointName, appName) => {
            set((state) => ({
                callData: { ...state.callData, endpointId, endpointName, appName },
            }))
        },
        setEndpointId: (endpointId) =>
            set((state) =>
                state.callData.endpointId === endpointId
                    ? state
                    : { callData: { ...state.callData, endpointId } },
            ),
        setEndpointName: (endpointName) =>
            set((state) =>
                state.callData.endpointName === endpointName
                    ? state
                    : { callData: { ...state.callData, endpointName } },
            ),
        setAppName: (appName) =>
            set((state) =>
                state.callData.appName === appName
                    ? state
                    : { callData: { ...state.callData, appName } },
            ),
        setCurrentCallId: (currentCallId) =>
            set((state) =>
                state.callData.currentCallId === currentCallId
                    ? state
                    : { callData: { ...state.callData, currentCallId } },
            ),
        setCurrentWsToken: (currentWsToken) =>
            set((state) =>
                state.callData.currentWsToken === currentWsToken
                    ? state
                    : { callData: { ...state.callData, currentWsToken } },
            ),
        setTelproDomain: (telproDomain) =>
            set((state) =>
                state.callData.telproDomain === telproDomain
                    ? state
                    : { callData: { ...state.callData, telproDomain } },
            ),
        setDtmfDigits: (dtmfDigits) =>
            set((state) =>
                state.callData.dtmfDigits === dtmfDigits
                    ? state
                    : { callData: { ...state.callData, dtmfDigits } },
            ),
        appendDtmfDigit: (digit) =>
            set((state) => ({
                callData: { ...state.callData, dtmfDigits: state.callData.dtmfDigits + digit },
            })),
        clearDtmfDigits: () =>
            set((state) =>
                state.callData.dtmfDigits === ''
                    ? state
                    : { callData: { ...state.callData, dtmfDigits: '' } },
            ),

        setCallData: (data: Partial<WebRTCPhoneCallData>) =>
            set((state) => ({
                callData: { ...state.callData, ...data },
            })),

        // Derived URLs
        getDerivedUrlsFor: (apiDomain: string): WebRTCPhoneDerivedUrls => {
            const { telproDomain, apiUrl, janusUrl, iceServers } = get().callData
            return getDerivedUrls({
                janusDomain: telproDomain || '',
                apiDomain,
                janusUrl,
                apiUrl,
                iceServers,
            })
        },

        // Restore persisted call state
        restoreFromPersistedState: (): PersistedCallState | null => {
            const storedState = loadCallState()
            if (!storedState) return null

            logDebug('Restoring persisted call state:', storedState)

            set((state) => {
                const newReconnecting = true
                const newInitialized = !!storedState.telproDomain
                const newEndpointId = storedState.endpointId
                const newEndpointName = storedState.endpointName || ''
                const newAppName = storedState.appName || ''
                const newCallId = storedState.callId || null
                const newWsToken = storedState.wsToken || null
                const newTelproDomain = storedState.telproDomain || null

                const connectionChanged =
                    state.connection.reconnecting !== newReconnecting ||
                    state.connection.initialized !== newInitialized
                const callDataChanged =
                    state.callData.endpointId !== newEndpointId ||
                    state.callData.endpointName !== newEndpointName ||
                    state.callData.appName !== newAppName ||
                    state.callData.currentCallId !== newCallId ||
                    state.callData.currentWsToken !== newWsToken ||
                    state.callData.telproDomain !== newTelproDomain

                if (!connectionChanged && !callDataChanged) return state

                return {
                    ...(connectionChanged
                        ? {
                              connection: {
                                  ...state.connection,
                                  reconnecting: newReconnecting,
                                  initialized: newInitialized,
                              },
                          }
                        : {}),
                    ...(callDataChanged
                        ? {
                              callData: {
                                  ...state.callData,
                                  endpointId: newEndpointId,
                                  endpointName: newEndpointName,
                                  appName: newAppName,
                                  currentCallId: newCallId,
                                  currentWsToken: newWsToken,
                                  telproDomain: newTelproDomain,
                              },
                          }
                        : {}),
                }
            })

            if (!storedState.telproDomain) {
                logDebug('No telproDomain in stored state, cannot reconnect')
                clearCallState()
                set((state) =>
                    state.connection.reconnecting === false
                        ? state
                        : { connection: { ...state.connection, reconnecting: false } },
                )
                return null
            }

            return storedState
        },

        // Bulk resets
        resetCallData: () => set({ callData: initialCallData }),
        resetConnectionState: () => set({ connection: initialConnectionState }),
        resetUIState: () => set({ ui: initialUIState }),
        resetAll: () =>
            set({
                ui: initialUIState,
                connection: initialConnectionState,
                callData: initialCallData,
            }),
        // WebRTC runtime config
        webrtcConfig: {
            apiDomain: 'localhost',
            apiKey: '',
            apiUrl: undefined,
            janusUrl: undefined,
            iceServers: undefined,
        },
        setWebRTCConfig: (config) => {
            setlogger(config.logger)
            set({ webrtcConfig: config })
        },

        // WebRTC phone call initiation
        pendingCall: null,
        initiateCall: (params) => set({ pendingCall: params }),
        clearPendingCall: () => set({ pendingCall: null }),
    })),
)
