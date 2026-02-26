import { useCallback, useEffect, useRef } from 'react'

import { useWebRTCPhoneStore } from '../stores/webrtcPhoneStore'
import { webrtcRefs } from '../stores/webrtcRefsStore'
import { logDebug, randomString, saveCallState, setAudioCodecPreferences } from '../utils'

import { useCleanupCall } from './useCleanupCall'
import { useRequestCallToken } from './useRequestCallToken'
import { useSendMessage } from './useSendMessage'
import { useTryPlayAudio } from './useTryPlayAudio'

/**
 * Encapsulates the entire "make a call" flow:
 *  - requests a call token if needed
 *  - acquires microphone
 *  - creates RTCPeerConnection (stored in webrtcRefs.pcRef)
 *  - wires up ICE trickle via webrtcRefs.wsRef (never exposed to the component)
 *  - creates & sends SDP offer to Janus
 *
 * The component only calls `makeCall()` — it never touches webrtcRefs directly.
 */
export const useMakeCall = () => {
    // Store unstable hook references in refs to allow a stable useCallback([]) below
    const sendMessage = useSendMessage()
    const cleanupCall = useCleanupCall()
    const requestCallToken = useRequestCallToken()
    const tryPlayAudio = useTryPlayAudio()

    const sendMessageRef = useRef(sendMessage)
    const cleanupCallRef = useRef(cleanupCall)
    const requestCallTokenRef = useRef(requestCallToken)
    const tryPlayAudioRef = useRef(tryPlayAudio)

    useEffect(() => {
        sendMessageRef.current = sendMessage
    }, [sendMessage])
    useEffect(() => {
        cleanupCallRef.current = cleanupCall
    }, [cleanupCall])
    useEffect(() => {
        requestCallTokenRef.current = requestCallToken
    }, [requestCallToken])
    useEffect(() => {
        tryPlayAudioRef.current = tryPlayAudio
    }, [tryPlayAudio])

    return useCallback(async () => {
        // Always read fresh state to avoid stale closures
        const { connection, callData } = useWebRTCPhoneStore.getState()
        const { registered } = connection
        const { endpointId, endpointName, appName, currentCallId, currentWsToken } = callData
        const {
            apiDomain: freshApiDomain,
            apiKey,
            preferPcma = true,
        } = useWebRTCPhoneStore.getState().webrtcConfig
        const { iceServers } = useWebRTCPhoneStore.getState().getDerivedUrlsFor(freshApiDomain)

        const { setCalling, setStatus, setCurrentCallId, setCurrentWsToken, setTelproDomain } =
            useWebRTCPhoneStore.getState()

        if (!registered) {
            logDebug('Not registered yet, waiting...')
            return
        }

        if (!endpointId) {
            logDebug('No endpoint ID, cannot make call')
            return
        }

        try {
            setCalling(true)
            setStatus('Setting up call...')

            // Acquire a call token if we don't have one yet
            let callId = currentCallId
            let wsToken = currentWsToken
            if (!callId && apiKey) {
                setStatus('Requesting call token...')
                try {
                    const tokenResponse = await requestCallTokenRef.current(endpointId)
                    callId = tokenResponse.callId
                    wsToken = tokenResponse.wsToken
                    setCurrentCallId(callId)
                    setCurrentWsToken(wsToken)

                    if (tokenResponse.telproDomain) {
                        setTelproDomain(tokenResponse.telproDomain)
                        logDebug('TelPro domain set from API:', tokenResponse.telproDomain)
                    }

                    logDebug('Using call ID:', callId)

                    saveCallState({
                        callId,
                        endpointId,
                        endpointName,
                        appName,
                        startedAt: Date.now(),
                        wsToken,
                        telproDomain: tokenResponse.telproDomain || undefined,
                    })
                } catch (tokenError) {
                    console.warn('Failed to get call token, proceeding without:', tokenError)
                }
            } else {
                logDebug('Using existing call ID:', callId)
            }

            // Acquire microphone
            setStatus('Getting microphone...')
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true },
                video: false,
            })
            webrtcRefs.localStreamRef.current = stream
            if (webrtcRefs.localAudioRef.current) {
                webrtcRefs.localAudioRef.current.srcObject = stream
            }

            // Create RTCPeerConnection
            const pc = new RTCPeerConnection({ iceServers })
            webrtcRefs.pcRef.current = pc

            stream.getTracks().forEach((track) => pc.addTrack(track, stream))
            setAudioCodecPreferences(pc, preferPcma)

            pc.ontrack = (event) => {
                logDebug('[Call] Remote track received:', event.track.kind)
                if (event.streams[0] && webrtcRefs.remoteAudioRef.current) {
                    webrtcRefs.remoteAudioRef.current.srcObject = event.streams[0]
                    logDebug('[Call] Remote audio stream attached, attempting playback...')
                    tryPlayAudioRef.current()
                }
            }

            pc.oniceconnectionstatechange = () => {
                logDebug('ICE state:', pc.iceConnectionState)
            }

            // Trickle ICE candidates to Janus — wsRef stays inside the SDK
            pc.onicecandidate = (event) => {
                const candidate = event.candidate
                    ? {
                          candidate: event.candidate.candidate,
                          sdpMid: event.candidate.sdpMid,
                          sdpMLineIndex: event.candidate.sdpMLineIndex,
                      }
                    : { completed: true }
                webrtcRefs.wsRef.current?.send(
                    JSON.stringify({
                        janus: 'trickle',
                        session_id: webrtcRefs.sessionIdRef.current,
                        handle_id: webrtcRefs.handleIdRef.current,
                        candidate,
                        transaction: randomString(12),
                    }),
                )
            }

            // Create and send SDP offer
            const offer = await pc.createOffer({ offerToReceiveAudio: true })
            await pc.setLocalDescription(offer)

            const sipHeaders: Record<string, string> = {}
            if (callId) sipHeaders['X-Call-ID'] = callId

            // Re-read telproDomain from store — it may have been updated by requestCallToken above
            const currentTelproDomain = useWebRTCPhoneStore.getState().callData.telproDomain
            if (!currentTelproDomain) {
                throw new Error(
                    'TelPro domain not available. Please ensure call token was received.',
                )
            }

            const uri = `sip:webrtc@${currentTelproDomain}`
            logDebug('Calling:', uri, 'with headers:', sipHeaders)

            const callBody: Record<string, unknown> = { request: 'call', uri }
            if (Object.keys(sipHeaders).length > 0) callBody.headers = sipHeaders

            await sendMessageRef.current({
                janus: 'message',
                body: callBody,
                jsep: { type: offer.type, sdp: offer.sdp },
            })
        } catch (error) {
            console.error('Call failed:', error)
            setCalling(false)
            setCurrentCallId(null)
            setCurrentWsToken(null)
            setStatus(`Call failed: ${error instanceof Error ? error.message : 'Unknown'}`)
            cleanupCallRef.current()
        }
    }, []) // empty deps — all state is read fresh via getState() or *Ref.current
}
