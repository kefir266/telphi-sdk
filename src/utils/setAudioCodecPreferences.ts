import { logDebug } from './index'

// Configure audio codec preferences on RTCPeerConnection
// This forces the browser to use PCMA (G.711 A-law) instead of Opus
// which eliminates transcoding overhead on the Janus/RTPEngine side
export const setAudioCodecPreferences = (pc: RTCPeerConnection, preferPcma: boolean = true) => {
    if (!preferPcma) return

    try {
        const transceivers = pc.getTransceivers()
        const audioTransceiver = transceivers.find(
            (t) => t.sender.track?.kind === 'audio' || t.receiver.track?.kind === 'audio',
        )

        if (!audioTransceiver) {
            logDebug('No audio transceiver found, skipping codec preferences')
            return
        }

        const capabilities = RTCRtpSender.getCapabilities('audio')
        if (!capabilities) {
            logDebug('Could not get audio capabilities')
            return
        }

        // Filter to PCMA (G.711 A-law) and telephone-event (for DTMF)
        // Order matters: PCMA first, then telephone-event
        const preferredCodecs = capabilities.codecs.filter(
            (codec) =>
                codec.mimeType === 'audio/PCMA' || codec.mimeType === 'audio/telephone-event',
        )

        // Sort to ensure PCMA comes before telephone-event
        preferredCodecs.sort((a, b) => {
            if (a.mimeType === 'audio/PCMA') return -1
            if (b.mimeType === 'audio/PCMA') return 1
            return 0
        })

        if (preferredCodecs.length > 0) {
            logDebug(
                'Setting audio codec preferences:',
                preferredCodecs.map((c) => c.mimeType),
            )
            audioTransceiver.setCodecPreferences(preferredCodecs)
        } else {
            logDebug('PCMA codec not available in browser capabilities')
        }
    } catch (e) {
        console.warn('Failed to set codec preferences:', e)
    }
}
