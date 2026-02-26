import type { PersistedCallState } from '../types'

/**
 * Module-level singleton for mutable WebRTC refs.
 *
 * Unlike React `useRef`, this is shared across ALL hooks that import it,
 * so setting `webrtcRefs.wsRef.current = ws` in one hook is immediately
 * visible to every other hook.
 *
 * Each property keeps the `{ current: T }` shape so that DOM-bound refs
 * (`remoteAudioRef`, `localAudioRef`) can still be passed to JSX `ref` props.
 */
export const webrtcRefs = {
    wsRef: { current: null as WebSocket | null },
    pendingReconnectRef: { current: null as PersistedCallState | null },
    sessionIdRef: { current: null as number | null },
    handleIdRef: { current: null as number | null },
    pcRef: { current: null as RTCPeerConnection | null },
    localStreamRef: { current: null as MediaStream | null },
    remoteAudioRef: { current: null as HTMLAudioElement | null },
    localAudioRef: { current: null as HTMLAudioElement | null },
    keepAliveRef: { current: null as ReturnType<typeof setInterval> | null },
    transactionsRef: { current: new Map<string, (msg: Record<string, unknown>) => void>() },
    initializingRef: { current: false },
    initializedRef: { current: false },
    pendingCandidatesRef: { current: [] as Array<Record<string, unknown> | null> },
    remoteDescriptionSetRef: { current: false },
    onHangupRef: { current: null as (() => void) | null },
}
