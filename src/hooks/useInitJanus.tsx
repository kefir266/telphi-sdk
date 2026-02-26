import { useEffect } from 'react'

import { useWebRTCPhoneStore } from '../stores/webrtcPhoneStore'
import { webrtcRefs } from '../stores/webrtcRefsStore'
import { loadCallState, logDebug, randomString, saveCallState } from '../utils'

import { useHandleMessage } from './useHandleMessage'
import { useSendMessage } from './useSendMessage'

// Initialize Janus
export const useInitJanus = () => {
    const { setStatus, setConnected, setRegistered, callData } = useWebRTCPhoneStore()
    const { telproDomain, janusUrl } = callData
    const { wsRef, sessionIdRef, handleIdRef, initializingRef, initializedRef, keepAliveRef } =
        webrtcRefs
    const sendMessage = useSendMessage()
    const handleMessage = useHandleMessage()
    const { inCall, calling } = useWebRTCPhoneStore((state) => state.connection)

    // Periodically update stored timestamp while in call (every 5s)
    // This ensures TTL check works even if beforeunload doesn't fire
    useEffect(() => {
        if (!inCall && !calling) return

        const updateTimestamp = () => {
            const currentState = loadCallState()
            if (currentState) {
                saveCallState({ ...currentState, startedAt: Date.now() })
                logDebug('Updated call state timestamp')
            }
        }

        // Update immediately and then every 5 seconds
        updateTimestamp()
        const interval = setInterval(updateTimestamp, 5000)

        return () => clearInterval(interval)
    }, [inCall, calling])

    return async (providedTelproDomain?: string) => {
        // Prevent multiple initializations (React StrictMode causes double-mount)
        if (initializingRef.current || initializedRef.current) {
            logDebug('Already initializing/initialized, skipping')
            return
        }
        initializingRef.current = true

        try {
            // Use provided telproDomain or fall back to state
            const domainToUse = providedTelproDomain || telproDomain
            if (!domainToUse) {
                throw new Error('TelPro domain is required to initialize Janus')
            }

            const janusServerUrl = janusUrl || `wss://${domainToUse}`
            setStatus('Connecting...')
            logDebug('Connecting to:', janusServerUrl)

            const ws = new WebSocket(janusServerUrl, 'janus-protocol')
            wsRef.current = ws

            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000)
                ws.onopen = () => {
                    clearTimeout(timeout)
                    resolve()
                }
                ws.onerror = (err) => {
                    console.error('WebSocket error:', err)
                    clearTimeout(timeout)
                    reject(new Error('Connection failed'))
                }
            })

            ws.onmessage = (e) => {
                try {
                    handleMessage(JSON.parse(e.data))
                } catch (err) {
                    console.error('Parse error:', err)
                }
            }

            ws.onclose = () => {
                logDebug('WebSocket closed')
                setConnected(false)
                setRegistered(false)
                if (keepAliveRef.current) {
                    clearInterval(keepAliveRef.current)
                    keepAliveRef.current = null
                }
            }

            // Create session
            setStatus('Creating session...')
            const createResp = await sendMessage({ janus: 'create' })
            sessionIdRef.current = (createResp.data as Record<string, unknown>)?.id as number
            logDebug('Session:', sessionIdRef.current)

            // Start keepalive
            keepAliveRef.current = setInterval(() => {
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(
                        JSON.stringify({
                            janus: 'keepalive',
                            session_id: sessionIdRef.current,
                            transaction: randomString(12),
                        }),
                    )
                }
            }, 25000)

            // Attach SIP plugin
            setStatus('Attaching SIP plugin...')
            const attachResp = await sendMessage({
                janus: 'attach',
                plugin: 'janus.plugin.sip',
            })
            handleIdRef.current = (attachResp.data as Record<string, unknown>)?.id as number
            logDebug('Handle:', handleIdRef.current)

            // Register as guest (requires telproDomain)
            setStatus('Registering...')
            await sendMessage({
                janus: 'message',
                body: {
                    request: 'register',
                    type: 'guest',
                    username: `sip:${window.location.hostname}@${domainToUse}`,
                    proxy: `sip:${domainToUse}`,
                },
            })

            initializedRef.current = true
            initializingRef.current = false
        } catch (error) {
            console.error('Init failed:', error)
            setStatus(`Failed: ${error instanceof Error ? error.message : 'Unknown'}`)
            initializingRef.current = false
        }
    }
}
