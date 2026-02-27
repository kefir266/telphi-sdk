import { useWebRTCPhoneStore } from '../stores/webrtcPhoneStore'
import { webrtcRefs } from '../stores/webrtcRefsStore'
import { logDebug, saveCallState, logger } from '../utils'

import { useInitJanus } from './useInitJanus'
import { useRequestCallToken } from './useRequestCallToken'

// Request call token to get telproDomain, then initialize Janus
export const useInitializeForCall = () => {
    const { apiKey } = useWebRTCPhoneStore((state) => state.webrtcConfig)
    const requestCallToken = useRequestCallToken()

    const {
        setStatus,
        setCurrentCallId,
        setCurrentWsToken,
        setTelproDomain,
        setCalling,
        setInitialized,
        connection,
    } = useWebRTCPhoneStore()

    const initJanus = useInitJanus()
    const { initializingRef } = webrtcRefs

    const { initialized } = connection

    return async (pendingCall: { endpointId: string; endpointName?: string; appName?: string }) => {
        const {
            endpointId: pendingEndpointId,
            endpointName: pendingEndpointName,
            appName: pendingAppName,
        } = pendingCall

        if (!apiKey) {
            const errorMsg = 'API key not configured. Set TELAPI_KEY environment variable.'
            logDebug('No API key, cannot get call token')
            setStatus(`Failed: ${errorMsg}`)
            logger.error(errorMsg)
            return
        }

        try {
            setStatus('Preparing call...')
            const tokenResponse = await requestCallToken(pendingEndpointId)
            setCurrentCallId(tokenResponse.callId)
            setCurrentWsToken(tokenResponse.wsToken)

            // Set telproDomain from API response - REQUIRED for Janus connection
            if (tokenResponse.telproDomain) {
                setTelproDomain(tokenResponse.telproDomain)
                logDebug('TelPro domain set from API:', tokenResponse.telproDomain)

                // Save call state for potential reconnection
                saveCallState({
                    callId: tokenResponse.callId,
                    endpointId: pendingEndpointId,
                    endpointName: pendingEndpointName || '',
                    appName: pendingAppName || '',
                    startedAt: Date.now(),
                    wsToken: tokenResponse.wsToken,
                    telproDomain: tokenResponse.telproDomain,
                })

                // Now initialize Janus with the telproDomain
                if (!initialized && !initializingRef.current) {
                    setInitialized(true)
                    await initJanus(tokenResponse.telproDomain)
                }
            } else {
                throw new Error(
                    `TelPro domain not provided in call token response. Received: ${JSON.stringify(tokenResponse)}`,
                )
            }
        } catch (error) {
            logger.error('Failed to prepare call:', error)
            setStatus(`Failed: ${error instanceof Error ? error.message : 'Unknown'}`)
            setCalling(false)
        }
    }
}
