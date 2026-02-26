export { playDtmfTone } from './playDtmfTone'
export { getDerivedUrls } from './getDerivedUrl'
export { animationStyles } from './animation'
export { setAudioCodecPreferences } from './setAudioCodecPreferences'
export { CALL_STATE_STORAGE_KEY } from './constants'
export { saveCallState, loadCallState, clearCallState } from './callState'

// Simple logger for debug visibility
export const logDebug = (...args: unknown[]) => console.debug('[WebRTCPhone]', ...args)

// Generate random transaction ID
export const randomString = (len: number) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < len; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
}
