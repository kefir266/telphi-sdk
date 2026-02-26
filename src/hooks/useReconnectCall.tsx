import { useWebRTCPhoneStore } from '../stores/webrtcPhoneStore'
import { webrtcRefs } from '../stores/webrtcRefsStore'
import { PersistedCallState } from '../types'
import { logDebug, randomString, setAudioCodecPreferences, clearCallState } from '../utils'

import { useCleanupCall } from './useCleanupCall'
import { useSendMessage } from './useSendMessage'
import { useTryPlayAudio } from './useTryPlayAudio'

// Reconnect to an existing call (after page reload)
export const useReconnectCall = () => {
    const { setEndpointId, setEndpointName, setAppName, setCurrentCallId, setCurrentWsToken } =
        useWebRTCPhoneStore()
    const { setStatus, setCalling, setReconnecting } = useWebRTCPhoneStore()
    const {
        wsRef,
        sessionIdRef,
        handleIdRef,
        localStreamRef,
        remoteAudioRef,
        localAudioRef,
        pcRef,
        remoteDescriptionSetRef,
        pendingReconnectRef,
    } = webrtcRefs
    const sendMessage = useSendMessage()
    const cleanupCall = useCleanupCall()
    const tryPlayAudio = useTryPlayAudio()

    const { preferPcma = true } = useWebRTCPhoneStore((state) => state.webrtcConfig)

    return async (state: PersistedCallState) => {
        logDebug('Reconnecting to call:', state.callId)
        setReconnecting(true)
        setStatus('Reconnecting...')

        if (!state.telproDomain) {
            throw new Error('TelPro domain not available in stored state')
        }

        try {
            // Clean up any existing call before reconnecting
            cleanupCall()

            // Reset the remote description flag for this new connection
            remoteDescriptionSetRef.current = false

            // Get microphone
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true },
                video: false,
            })
            localStreamRef.current = stream
            if (localAudioRef.current) localAudioRef.current.srcObject = stream

            // Create PeerConnection with ICE servers for this call's telproDomain
            const reconnectIceServers = [
                { urls: `stun:${state.telproDomain}:3478` },
                {
                    urls: [
                        `turn:${state.telproDomain}:3478?transport=udp`,
                        `turn:${state.telproDomain}:3478?transport=tcp`,
                    ],
                    username: 'telpro',
                    credential: 'changeme',
                },
            ]
            const pc = new RTCPeerConnection({ iceServers: reconnectIceServers })
            pcRef.current = pc

            stream.getTracks().forEach((track) => pc.addTrack(track, stream))

            // Force PCMA (G.711 A-law) codec to avoid transcoding on Janus
            setAudioCodecPreferences(pc, preferPcma)

            pc.ontrack = (event) => {
                logDebug('[Reconnect] Remote track received:', event.track.kind)
                if (event.streams[0] && remoteAudioRef.current) {
                    remoteAudioRef.current.srcObject = event.streams[0]
                    logDebug('[Reconnect] Remote audio stream attached, attempting playback...')
                    tryPlayAudio()
                }
            }

            pc.oniceconnectionstatechange = () => {
                logDebug('[Reconnect] ICE state:', pc.iceConnectionState)
            }

            // Send trickle ICE candidates as they're generated
            // Janus will queue early ones and process them after SDP is set
            pc.onicecandidate = (event) => {
                const candidate = event.candidate
                    ? {
                          candidate: event.candidate.candidate,
                          sdpMid: event.candidate.sdpMid,
                          sdpMLineIndex: event.candidate.sdpMLineIndex,
                      }
                    : { completed: true }

                logDebug('[Reconnect] Sending trickle ICE candidate:', candidate)
                wsRef.current?.send(
                    JSON.stringify({
                        janus: 'trickle',
                        session_id: sessionIdRef.current,
                        handle_id: handleIdRef.current,
                        candidate,
                        transaction: randomString(12),
                    }),
                )
            }

            // Create offer
            const offer = await pc.createOffer({ offerToReceiveAudio: true })
            await pc.setLocalDescription(offer)

            // Send call with the same X-Call-ID to reconnect
            const uri = `sip:webrtc@${state.telproDomain}`
            logDebug('Reconnecting to:', uri, 'with call ID:', state.callId)

            await sendMessage({
                janus: 'message',
                body: {
                    request: 'call',
                    uri,
                    headers: { 'X-Call-ID': state.callId },
                },
                jsep: { type: offer.type, sdp: offer.sdp },
            })

            // Restore state
            setEndpointId(state.endpointId)
            if (state.endpointName) {
                setEndpointName(state.endpointName)
            }
            if (state.appName) {
                setAppName(state.appName)
            }
            setCurrentCallId(state.callId)
            if (state.wsToken) {
                setCurrentWsToken(state.wsToken)
            }
            setCalling(true)
        } catch (error) {
            console.error('Reconnect failed:', error)
            setStatus(`Reconnect failed: ${error instanceof Error ? error.message : 'Unknown'}`)
            clearCallState()
            cleanupCall()
        } finally {
            setReconnecting(false)
            pendingReconnectRef.current = null
        }
    }
}
