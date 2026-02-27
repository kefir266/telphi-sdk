import { webrtcRefs } from '../stores/webrtcRefsStore'
import { logDebug, logger } from '../utils'

import { useAddIceCandidate } from './useAddCandidate'

// Handle remote JSEP
export const useHandleRemoteJsep = () => {
    const { pcRef, pendingCandidatesRef, remoteDescriptionSetRef } = webrtcRefs
    const addIceCandidate = useAddIceCandidate()
    return async (jsep: { type: string; sdp?: string }) => {
        const pc = pcRef.current
        if (!pc) return

        try {
            logDebug('Setting remote description:', jsep.type)
            await pc.setRemoteDescription({
                type: jsep.type as 'offer' | 'answer' | 'pranswer' | 'rollback',
                sdp: jsep.sdp,
            })
            remoteDescriptionSetRef.current = true

            // Process any queued ICE candidates
            const pending = pendingCandidatesRef.current
            if (pending.length > 0) {
                logDebug(`Processing ${pending.length} queued ICE candidates`)
                pendingCandidatesRef.current = []
                for (const candidate of pending) {
                    await addIceCandidate(candidate)
                }
            }
        } catch (e) {
            logger.error('Error setting remote description:', e)
        }
    }
}
