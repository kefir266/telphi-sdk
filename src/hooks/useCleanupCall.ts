import { useWebRTCPhoneStore } from '../stores/webrtcPhoneStore'
import { webrtcRefs } from '../stores/webrtcRefsStore'

export const useCleanupCall = () => {
    const {
        pcRef,
        localStreamRef,
        remoteAudioRef,
        localAudioRef,
        pendingCandidatesRef,
        remoteDescriptionSetRef,
    } = webrtcRefs
    const setAudioBlocked = useWebRTCPhoneStore((state) => state.setAudioBlocked)

    return () => {
        if (pcRef.current) {
            pcRef.current.close()
            pcRef.current = null
        }
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => track.stop())
            localStreamRef.current = null
        }
        if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = null
        }
        if (localAudioRef.current) {
            localAudioRef.current.srcObject = null
        }
        // Reset ICE candidate queue state
        pendingCandidatesRef.current = []
        remoteDescriptionSetRef.current = false
        setAudioBlocked(false)
    }
}
