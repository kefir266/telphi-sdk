import { useEffect } from 'react'

import { useWebRTCPhoneStore } from './stores/webrtcPhoneStore'
import type { WebRTCConfig } from './types'

export type { WebRTCConfig }

/**
 * Client component that initializes the WebRTC config in the SDK Zustand store.
 * Should be rendered once in the root layout with config from Server Component.
 */
export function WebRTCConfigInit({ config }: { config: WebRTCConfig }) {
    const setWebRTCConfig = useWebRTCPhoneStore((state) => state.setWebRTCConfig)
    const setCallData = useWebRTCPhoneStore((state) => state.setCallData)

    useEffect(() => {
        console.log('[WebRTCConfigInit] Setting config:', {
            apiDomain: config.apiDomain,
            hasApiKey: !!config.apiKey,
            apiUrl: config.apiUrl,
            janusUrl: config.janusUrl,
            iceServers: config.iceServers,
        })
        setWebRTCConfig(config)
        setCallData(config)
    }, [config, setWebRTCConfig, setCallData])

    return null
}
