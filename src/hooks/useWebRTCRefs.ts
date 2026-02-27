import { useRef } from 'react'

import type { PersistedCallState } from '../types'

export const useWebRTCRefs = () => {
    const wsRef = useRef<WebSocket | null>(null)
    const pendingReconnectRef = useRef<PersistedCallState | null>(null) // Call state to reconnect to after registration
    const sessionIdRef = useRef<number | null>(null)
    const handleIdRef = useRef<number | null>(null)
    const pcRef = useRef<RTCPeerConnection | null>(null)
    const localStreamRef = useRef<MediaStream | null>(null)
    const remoteAudioRef = useRef<HTMLAudioElement>(null)
    const localAudioRef = useRef<HTMLAudioElement>(null)
    const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const transactionsRef = useRef<Map<string, (msg: Record<string, unknown>) => void>>(new Map())
    const initializingRef = useRef(false)
    const initializedRef = useRef(false)
    const pendingCandidatesRef = useRef<Array<Record<string, unknown> | null>>([])
    const remoteDescriptionSetRef = useRef(false)

    return {
        wsRef,
        pendingReconnectRef,
        sessionIdRef,
        handleIdRef,
        pcRef,
        localStreamRef,
        remoteAudioRef,
        localAudioRef,
        keepAliveRef,
        transactionsRef,
        initializingRef,
        initializedRef,
        pendingCandidatesRef,
        remoteDescriptionSetRef,
    }
}
