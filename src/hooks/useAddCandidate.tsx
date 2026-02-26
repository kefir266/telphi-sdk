import { webrtcRefs } from '../stores/webrtcRefsStore'
import { logDebug } from '../utils'

// Add a single ICE candidate to the PeerConnection
export const useAddIceCandidate = () => {
    const { pcRef } = webrtcRefs

    return async (candidate: Record<string, unknown> | null) => {
        const pc = pcRef.current
        if (!pc) return

        try {
            if (candidate && !candidate.completed) {
                logDebug('Adding remote ICE candidate:', candidate)
                await pc.addIceCandidate({
                    candidate: candidate.candidate as string,
                    sdpMid: candidate.sdpMid as string | null,
                    sdpMLineIndex: candidate.sdpMLineIndex as number | null,
                })
            } else {
                logDebug('Remote ICE gathering complete')
            }
        } catch (e) {
            console.error('Error adding remote ICE candidate:', e)
        }
    }
}
