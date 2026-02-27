import { useCallback } from 'react'

import { useWebRTCPhoneStore } from '../stores/webrtcPhoneStore'
import { logDebug, playDtmfTone, logger } from '../utils'

import { useSendMessage } from './useSendMessage'

/** Returns a memoized function that plays a DTMF tone locally and, when in a call,
 *  sends the digit to the remote party via the Janus SIP plugin. */
export const useSendDtmf = () => {
    const sendMessage = useSendMessage()
    const appendDtmfDigit = useWebRTCPhoneStore((state) => state.appendDtmfDigit)
    const inCall = useWebRTCPhoneStore((state) => state.connection.inCall)

    return useCallback(
        async (digit: string) => {
            // Play the DTMF tone locally for feedback (even if not in call)
            playDtmfTone(digit)

            // Track entered digits
            appendDtmfDigit(digit)

            if (!inCall) return
            try {
                logDebug('Sending DTMF:', digit)
                await sendMessage({
                    janus: 'message',
                    body: {
                        request: 'dtmf_info',
                        digit,
                    },
                })
            } catch (e) {
                logger.error('DTMF failed:', e)
            }
        },
        [appendDtmfDigit, inCall, sendMessage],
    )
}
