import { webrtcRefs } from '../stores/webrtcRefsStore'
import { logDebug } from '../utils'

import { useAddIceCandidate } from './useAddCandidate'

// Handle remote trickle ICE candidate from Janus (queue if needed)
export const useHandleRemoteTrickle = () => {
    const { pendingCandidatesRef, remoteDescriptionSetRef } = webrtcRefs
    const addIceCandidate = useAddIceCandidate()

    return (candidate: Record<string, unknown> | null) => {
        if (!remoteDescriptionSetRef.current) {
            // Queue candidate until remote description is set
            logDebug('Queueing ICE candidate (no remote description yet)')
            pendingCandidatesRef.current.push(candidate)
            return
        }
        addIceCandidate(candidate)
    }
}
