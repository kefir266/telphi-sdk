import { useMemo } from 'react'

import { useWebRTCPhoneStore } from '../stores/webrtcPhoneStore'
import { CallTokenResponse } from '../types'
import { logDebug } from '../utils'

// Request call token from TelAPI
export const useRequestCallToken = () => {
    const { apiDomain, apiKey } = useWebRTCPhoneStore((state) => state.webrtcConfig)
    const getDerivedUrlsFor = useWebRTCPhoneStore((state) => state.getDerivedUrlsFor)
    const { janusServer: _janusServer, telapiUrl } = useMemo(
        () => getDerivedUrlsFor(apiDomain),
        [apiDomain, getDerivedUrlsFor],
    )

    return async (targetEndpointId: string): Promise<CallTokenResponse> => {
        if (!apiDomain) {
            throw new Error('API domain not configured. Please set apiDomain in webrtcConfig.')
        }

        if (!apiKey) {
            throw new Error('API key not configured. Please set apiKey in webrtcConfig.')
        }

        const url = `${telapiUrl}/api/v1/calls/token`
        logDebug('Requesting call token for endpoint:', targetEndpointId, 'URL:', url)

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': apiKey,
                },
                body: JSON.stringify({
                    endpointId: targetEndpointId,
                }),
            })

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: 'Unknown error' }))
                throw new Error(error.error || `Failed to get call token: ${response.status}`)
            }

            const data: CallTokenResponse = await response.json()
            logDebug(
                'Call token received:',
                data.callId,
                'wsToken expires in:',
                data.wsTokenExpiresIn,
            )
            logDebug('Full token response:', data)
            return data
        } catch (error) {
            if (error instanceof Error && error.message.includes('Failed to fetch')) {
                logDebug('Network error - URL:', url, 'Domain:', apiDomain)
                throw new Error(
                    `Network error: Cannot reach ${apiDomain}. Check your network connection and API domain configuration.`,
                )
            }
            throw error
        }
    }
}
