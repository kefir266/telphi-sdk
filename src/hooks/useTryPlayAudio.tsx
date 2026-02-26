import { useWebRTCPhoneStore } from '../stores/webrtcPhoneStore'
import { webrtcRefs } from '../stores/webrtcRefsStore'
import { logDebug } from '../utils'

// Try to play remote audio, track if blocked by autoplay policy
export const useTryPlayAudio = () => {
    const setAudioBlocked = useWebRTCPhoneStore((state) => state.setAudioBlocked)
    const { remoteAudioRef } = webrtcRefs

    return async () => {
        const audio = remoteAudioRef.current
        if (!audio || !audio.srcObject) return

        try {
            await audio.play()
            logDebug('Audio playback started successfully')
            setAudioBlocked(false)
        } catch (error) {
            if (error instanceof Error && error.name === 'NotAllowedError') {
                logDebug('Audio playback blocked - needs user interaction')
                setAudioBlocked(true)
            } else {
                console.error('Audio playback failed:', error)
            }
        }
    }
}
