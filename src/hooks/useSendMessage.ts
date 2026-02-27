import { webrtcRefs } from '../stores/webrtcRefsStore'
import { logDebug, randomString } from '../utils'

// Send message to Janus
export const useSendMessage = () => {
    const { wsRef, sessionIdRef, handleIdRef, transactionsRef } = webrtcRefs

    return (msg: Record<string, unknown>): Promise<Record<string, unknown>> => {
        return new Promise((resolve, reject) => {
            const ws = wsRef.current
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                reject(new Error('WebSocket not connected'))
                return
            }

            const transaction = randomString(12)
            const message: Record<string, unknown> = {
                ...msg,
                transaction,
            }
            if (sessionIdRef.current) message.session_id = sessionIdRef.current
            if (handleIdRef.current) message.handle_id = handleIdRef.current

            const timeout = setTimeout(() => {
                transactionsRef.current.delete(transaction)
                reject(new Error('Transaction timeout'))
            }, 10000)

            transactionsRef.current.set(transaction, (response) => {
                clearTimeout(timeout)
                transactionsRef.current.delete(transaction)
                if (response.janus === 'error') {
                    const err = response.error as Record<string, unknown> | undefined
                    reject(new Error(String(err?.reason || err || 'Janus error')))
                } else {
                    resolve(response)
                }
            })

            logDebug('Sending:', message)
            ws.send(JSON.stringify(message))
        })
    }
}
