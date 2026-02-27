import { DTMF_FREQUENCIES } from './constants'
import { logger } from './sdkLogger'

// Audio context for DTMF tones (lazy initialized)
let audioContext: AudioContext | null = null

// Play DTMF tone for a digit
export const playDtmfTone = (digit: string, durationMs: number = 150) => {
    const frequencies = DTMF_FREQUENCIES[digit]
    if (!frequencies) return

    try {
        // Lazy initialize audio context (must be done after user interaction)
        if (!audioContext) {
            audioContext = new AudioContext()
        }

        // Resume if suspended (browser autoplay policy)
        if (audioContext.state === 'suspended') {
            audioContext.resume()
        }

        const [lowFreq, highFreq] = frequencies
        const duration = durationMs / 1000

        // Create oscillators for the two frequencies
        const osc1 = audioContext.createOscillator()
        const osc2 = audioContext.createOscillator()
        const gainNode = audioContext.createGain()

        osc1.frequency.value = lowFreq
        osc2.frequency.value = highFreq
        osc1.type = 'sine'
        osc2.type = 'sine'

        // Set volume (0.1 is fairly quiet but audible)
        gainNode.gain.value = 0.1

        // Connect oscillators through gain to output
        osc1.connect(gainNode)
        osc2.connect(gainNode)
        gainNode.connect(audioContext.destination)

        // Start and stop
        const now = audioContext.currentTime
        osc1.start(now)
        osc2.start(now)
        osc1.stop(now + duration)
        osc2.stop(now + duration)

        // Fade out to avoid click
        gainNode.gain.setValueAtTime(0.1, now)
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration)
    } catch (e) {
        logger.warn('Failed to play DTMF tone:', e)
    }
}
