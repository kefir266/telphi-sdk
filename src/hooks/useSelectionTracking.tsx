'use client'

import { useCallback, useEffect } from 'react'

import { useWebRTCPhoneStore } from '../stores/webrtcPhoneStore'
import { logDebug } from '../utils'

interface UseSelectionTrackingOptions {
    sendReadAloud: (text: string) => void
    channelConnected: boolean
}

/**
 * Tracks text selection on the page and provides a handler to send selected text as read-aloud.
 * `selectedText` is stored in the WebRTC phone store (ui.selectedText).
 */
export const useSelectionTracking = ({
    sendReadAloud,
    channelConnected,
}: UseSelectionTrackingOptions) => {
    const selectedText = useWebRTCPhoneStore((state) => state.ui.selectedText)
    const setSelectedText = useWebRTCPhoneStore((state) => state.setSelectedText)
    const inCall = useWebRTCPhoneStore((state) => state.connection.inCall)

    // Track selected text globally
    useEffect(() => {
        const handleSelectionChange = () => {
            const selection = window.getSelection()
            const text = selection?.toString().trim() || ''
            setSelectedText(text)
        }

        document.addEventListener('selectionchange', handleSelectionChange)
        document.addEventListener('mouseup', handleSelectionChange)

        return () => {
            document.removeEventListener('selectionchange', handleSelectionChange)
            document.removeEventListener('mouseup', handleSelectionChange)
        }
    }, [setSelectedText])

    const handleReadAloudSelected = useCallback(() => {
        if (selectedText && inCall && channelConnected) {
            logDebug('Reading aloud selected text:', selectedText.substring(0, 50) + '...')
            sendReadAloud(selectedText)
            window.getSelection()?.removeAllRanges()
            setSelectedText('')
        }
    }, [selectedText, inCall, channelConnected, sendReadAloud, setSelectedText])

    const showReadAloudFab = selectedText.length > 0 && inCall && channelConnected

    return { selectedText, handleReadAloudSelected, showReadAloudFab }
}
