import { PersistedCallState } from '../types'

import { CALL_STATE_STORAGE_KEY } from './constants'

import { logDebug } from './index'

// Save call state to sessionStorage
export const saveCallState = (state: PersistedCallState) => {
    try {
        sessionStorage.setItem(CALL_STATE_STORAGE_KEY, JSON.stringify(state))
        logDebug('Call state saved:', state)
    } catch (e) {
        console.error('Failed to save call state:', e)
    }
}

// Load call state from sessionStorage
export const loadCallState = (): PersistedCallState | null => {
    try {
        const stored = sessionStorage.getItem(CALL_STATE_STORAGE_KEY)
        if (!stored) return null
        const state = JSON.parse(stored) as PersistedCallState
        // Server-side session only stays alive for ~20 seconds after disconnect
        const MAX_CALL_AGE_MS = 20 * 1000
        if (Date.now() - state.startedAt > MAX_CALL_AGE_MS) {
            logDebug('Stored call state is stale (>20s), clearing')
            clearCallState()
            return null
        }
        logDebug('Call state loaded:', state)
        return state
    } catch (e) {
        console.error('Failed to load call state:', e)
        return null
    }
}

// Clear call state from sessionStorage
export const clearCallState = () => {
    try {
        sessionStorage.removeItem(CALL_STATE_STORAGE_KEY)
        logDebug('Call state cleared')
    } catch (e) {
        console.error('Failed to clear call state:', e)
    }
}
