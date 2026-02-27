import { useWebRTCPhoneStore } from '../stores/webrtcPhoneStore'
import { webrtcRefs } from '../stores/webrtcRefsStore'

import { useCleanupCall } from './useCleanupCall'

// Cleanup
export const useCleanupJanus = () => {
    const { setConnected, setRegistered, setInCall, setCalling } = useWebRTCPhoneStore()
    const {
        wsRef,
        sessionIdRef,
        handleIdRef,
        transactionsRef,
        initializingRef,
        initializedRef,
        keepAliveRef,
    } = webrtcRefs
    const cleanupCall = useCleanupCall()

    return () => {
        cleanupCall()
        if (keepAliveRef.current) {
            clearInterval(keepAliveRef.current)
            keepAliveRef.current = null
        }
        if (wsRef.current) {
            wsRef.current.close()
            wsRef.current = null
        }
        sessionIdRef.current = null
        handleIdRef.current = null
        transactionsRef.current.clear()
        initializingRef.current = false
        initializedRef.current = false
        setConnected(false)
        setRegistered(false)
        setInCall(false)
        setCalling(false)
    }
}
