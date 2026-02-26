// Interface for persisted call state
export interface PersistedCallState {
    callId: string
    endpointId: string
    endpointName?: string // Endpoint display name
    appName?: string // App display name
    startedAt: number // timestamp to detect stale sessions
    wsToken?: string // WebSocket token for channel communication
    telproDomain?: string // TelPro domain for reconnection
}

// Interface for call token response
export interface CallTokenResponse {
    callId: string
    wsToken: string
    wsTokenExpiresIn: number
    expiresIn: number
    telproDomain?: string // TelPro domain for WebRTC (Janus/TURN/STUN)
}

export interface WebRTCPhoneProps {
    /** Optional callback for SPA navigation. If not provided, falls back to History API. */
    onNavigate?: (path: string) => void
}

export type IceServer = {
    urls: string | string[]
    username?: string
    credential?: string
}

/**
 * WebRTC configuration passed to the SDK
 */
export interface WebRTCConfig {
    apiDomain: string
    apiKey: string
    /**
     * Use PCMA (G.711 A-law) codec instead of Opus.
     * Eliminates transcoding overhead on Janus gateway.
     * Default: true
     */
    preferPcma?: boolean
    apiUrl?: string // Optional full API URL (overrides apiDomain if provided)
    janusUrl?: string // Optional full Janus URL (overrides apiDomain if provided)
    iceServers?: Array<IceServer>
}

/**
 * Parameters for initiating a call
 */
export interface InitiateCallParams {
    endpointId: string
    phoneNumber: string
    endpointName?: string
    appName?: string
}
