import { useWebRTCPhoneStore } from '../stores/webrtcPhoneStore'
import { webrtcRefs } from '../stores/webrtcRefsStore'
import { logDebug } from '../utils'

// Enable audio on user interaction (click)
export const useEnableAudio = () => {
    const { remoteAudioRef } = webrtcRefs
    const setAudioBlocked = useWebRTCPhoneStore((state) => state.setAudioBlocked)

    return async () => {
        const audio = remoteAudioRef.current
        if (!audio) return

        try {
            await audio.play()
            logDebug('Audio enabled after user interaction')
            setAudioBlocked(false)
        } catch (error) {
            console.error('Failed to enable audio:', error)
        }
    }
}
