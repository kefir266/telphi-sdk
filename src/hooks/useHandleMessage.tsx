import { webrtcRefs } from '../stores/webrtcRefsStore'
import { logDebug } from '../utils'

import { useHandleRemoteTrickle } from './useHandleRemoteTrickle'
import { useHandleSipEvent } from './useHandleSipEvent'

// Handle incoming Janus message
export const useHandleMessage = () => {
    const { transactionsRef, handleIdRef } = webrtcRefs

    const handleSipEvent = useHandleSipEvent()
    const handleRemoteTrickle = useHandleRemoteTrickle()

    return (msg: Record<string, unknown>) => {
        logDebug('Received:', msg)

        // Handle transaction responses
        const transaction = msg.transaction as string
        if (transaction && transactionsRef.current.has(transaction)) {
            const handler = transactionsRef.current.get(transaction)
            if (handler) handler(msg)
            return
        }

        // Handle async events
        const janus = msg.janus as string
        switch (janus) {
            case 'event': {
                const plugindata = msg.plugindata as Record<string, unknown> | undefined
                if (plugindata?.data) {
                    handleSipEvent(
                        plugindata.data as Record<string, unknown>,
                        msg.jsep as { type: string; sdp?: string } | undefined,
                    )
                }
                break
            }
            case 'trickle': {
                // Handle remote ICE candidates from Janus
                const candidate = msg.candidate as Record<string, unknown> | null
                handleRemoteTrickle(candidate)
                break
            }
            case 'webrtcup':
                logDebug('WebRTC connection up')
                break
            case 'hangup':
                logDebug('Hangup')
                // Delegate to the component's handleHangup so all cleanup
                // (including local UI state like chatOpen) runs in one place
                webrtcRefs.onHangupRef.current?.()
                break
            case 'detached':
                handleIdRef.current = null
                break
        }
    }
}
