import { logger } from './sdkLogger'

export { playDtmfTone } from './playDtmfTone'
export { getDerivedUrls } from './getDerivedUrl'
export { animationStyles } from './animation'
export { setAudioCodecPreferences } from './setAudioCodecPreferences'
export { CALL_STATE_STORAGE_KEY } from './constants'
export { saveCallState, loadCallState, clearCallState } from './callState'

export { logger }

// Debug logger — routes through the configured SDK logger
export const logDebug = (...args: unknown[]) => logger.debug('[WebRTCPhone]', ...args)

// Generate random transaction ID
export const randomString = (len: number) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < len; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
}
