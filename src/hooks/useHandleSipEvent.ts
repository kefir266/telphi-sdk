import { useWebRTCPhoneStore } from '../stores/webrtcPhoneStore'
import { webrtcRefs } from '../stores/webrtcRefsStore'
import { logDebug, clearCallState } from '../utils'

import { useHandleRemoteJsep } from './useHandleRemoteJsep'
import { useReconnectCall } from './useReconnectCall'

// Handle SIP events
export const useHandleSipEvent = () => {
    const { setStatus, setRegistered, setConnected, setCalling, setInCall, connection } =
        useWebRTCPhoneStore()
    const handleRemoteJsep = useHandleRemoteJsep()
    const reconnectCall = useReconnectCall()
    const { pendingReconnectRef } = webrtcRefs
    const { registered: _registered } = connection

    return (data: Record<string, unknown>, jsep?: { type: string; sdp?: string }) => {
        const result = data.result as Record<string, unknown> | undefined
        const event = result?.event || (data.sip !== 'event' ? data.sip : undefined)

        logDebug('SIP event:', event, data)

        switch (event) {
            case 'registering':
                setStatus('Registering...')
                break
            case 'registered':
                setRegistered(true)
                setConnected(true)
                setStatus('Connected')
                // Check if we need to reconnect to an existing call
                if (pendingReconnectRef.current) {
                    const reconnectState = pendingReconnectRef.current
                    // Use setTimeout to avoid calling during render
                    setTimeout(() => reconnectCall(reconnectState), 0)
                }
                break
            case 'registration_failed':
                setRegistered(false)
                setStatus(`Registration failed: ${result?.reason || 'Unknown'}`)
                // Clear pending reconnect on failure
                pendingReconnectRef.current = null
                clearCallState()
                break
            case 'calling':
                setCalling(true)
                setStatus('Calling...')
                break
            case 'ringing':
                setStatus('Ringing...')
                break
            case 'progress':
                setStatus('Connecting...')
                if (jsep) handleRemoteJsep(jsep)
                break
            case 'accepted':
                setInCall(true)
                setCalling(false)
                setStatus('In Call')
                if (jsep) handleRemoteJsep(jsep)
                break
            case 'hangup':
                logDebug('SIP hangup')
                webrtcRefs.onHangupRef.current?.()
                break
            case 'declining':
            case 'missed':
                logDebug('SIP declined/missed')
                webrtcRefs.onHangupRef.current?.()
                break
        }
    }
}
