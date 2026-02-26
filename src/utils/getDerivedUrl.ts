import type { IceServer } from '../types'

// Helper to derive URLs from WebRTC and API domains
export const getDerivedUrls = (settings: {
    janusDomain: string
    apiDomain: string
    janusUrl?: string
    iceServers?: IceServer[]
    apiUrl?: string
}) => {
    const { janusDomain, apiDomain } = settings
    // Use http:// for localhost/127.0.0.1, https:// for everything else
    const isLocalhost =
        apiDomain === 'localhost' ||
        apiDomain.startsWith('127.0.0.1') ||
        apiDomain.startsWith('localhost:')
    const httpProtocol = isLocalhost ? 'http' : 'https'
    const wsProtocol = isLocalhost ? 'ws' : 'wss'
    const janusUrl = settings.janusUrl || `${wsProtocol}://${janusDomain}`
    const apiUrl = settings.apiUrl || `${httpProtocol}://${apiDomain}`

    return {
        janusServer: janusUrl, // Janus Gateway WebSocket (always secure)
        telapiUrl: apiUrl, // TelAPI REST endpoint
        telapiWsUrl: `${wsProtocol}://${apiDomain}`, // TelAPI WebSocket endpoint
        iceServers: settings.iceServers || [
            { urls: `stun:${janusDomain}:3478` },
            {
                urls: [
                    `turn:${janusDomain}:3478?transport=udp`,
                    `turn:${janusDomain}:3478?transport=tcp`,
                ],
                username: 'telpro',
                credential: 'changeme',
            },
        ],
    }
}
