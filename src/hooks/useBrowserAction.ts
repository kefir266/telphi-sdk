import { useCallback } from 'react'

import type { WebRTCPhoneProps } from '../types'
import { logDebug } from '../utils'

// Action handler for browser actions from ARI (AI tool calls)
export const useBrowserAction = (onNavigate: WebRTCPhoneProps['onNavigate']) =>
    useCallback(
        async (action: { name: string; parameters: Record<string, any> }) => {
            logDebug('Browser action received:', action.name, action.parameters)

            switch (action.name) {
                // ============================================================
                // Alert/Notification Actions
                // ============================================================
                case 'show_alert': {
                    // Show a browser alert dialog - blocks until user clicks OK
                    const message = (action.parameters.message as string) || 'Alert'
                    const title = action.parameters.title as string
                    const fullMessage = title ? `${title}\n\n${message}` : message
                    alert(fullMessage)
                    return { success: true, data: { dismissed: true } }
                }

                case 'show_confirm': {
                    // Show a confirm dialog - returns user's choice
                    const message = (action.parameters.message as string) || 'Confirm?'
                    const confirmed = confirm(message)
                    return { success: true, data: { confirmed } }
                }

                case 'show_prompt': {
                    // Show a prompt dialog - returns user input
                    const message = (action.parameters.message as string) || 'Enter value:'
                    const defaultValue = (action.parameters.defaultValue as string) || ''
                    const result = prompt(message, defaultValue)
                    return {
                        success: true,
                        data: {
                            value: result,
                            cancelled: result === null,
                        },
                    }
                }

                case 'show_notification': {
                    // Show a notification (same as show_alert for now)
                    const notificationMessage = action.parameters.message as string
                    alert(notificationMessage)
                    return { success: true }
                }

                // ============================================================
                // Navigation Actions
                // ============================================================
                case 'navigate': {
                    // Navigate to a URL in new tab
                    const url = action.parameters.url as string
                    if (url) {
                        window.open(url, '_blank')
                        return { success: true, data: { url } }
                    }
                    return { success: false, error: 'No URL provided' }
                }

                case 'navigate_current': {
                    // Navigate current tab using SPA navigation for internal URLs
                    const url = action.parameters.url as string
                    if (url) {
                        // Check if it's an internal path (starts with /) or same-origin URL
                        const isInternal =
                            url.startsWith('/') || url.startsWith(window.location.origin)

                        if (isInternal) {
                            const path = url.startsWith('/')
                                ? url
                                : url.replace(window.location.origin, '')

                            if (onNavigate) {
                                // Use provided callback (e.g., Next.js router, React Router)
                                onNavigate(path)
                                return { success: true, data: { url: path, method: 'callback' } }
                            } else {
                                // Fallback to History API (works with most SPA routers)
                                window.history.pushState({}, '', path)
                                window.dispatchEvent(new PopStateEvent('popstate'))
                                return { success: true, data: { url: path, method: 'history' } }
                            }
                        } else {
                            // External URL - use full page navigation
                            window.location.href = url
                            return { success: true, data: { url, method: 'full' } }
                        }
                    }
                    return { success: false, error: 'No URL provided' }
                }

                // ============================================================
                // Clipboard Actions
                // ============================================================
                case 'copy_to_clipboard': {
                    const text = action.parameters.text as string
                    if (text) {
                        try {
                            await navigator.clipboard.writeText(text)
                            return { success: true, data: { copied: text.length } }
                        } catch {
                            return { success: false, error: 'Clipboard access denied' }
                        }
                    }
                    return { success: false, error: 'No text provided' }
                }

                // ============================================================
                // Storage Actions
                // ============================================================
                case 'get_storage': {
                    const key = action.parameters.key as string
                    const storage = (action.parameters.storage as 'local' | 'session') || 'local'
                    const store = storage === 'session' ? sessionStorage : localStorage
                    const value = store.getItem(key)
                    return { success: true, data: { key, value, found: value !== null } }
                }

                case 'set_storage': {
                    const key = action.parameters.key as string
                    const value = action.parameters.value as string
                    const storage = (action.parameters.storage as 'local' | 'session') || 'local'
                    const store = storage === 'session' ? sessionStorage : localStorage
                    store.setItem(key, value)
                    return { success: true, data: { key } }
                }

                // ============================================================
                // Default Handler
                // ============================================================
                default:
                    logDebug('Unknown action:', action.name)
                    return { success: false, error: `Unknown action: ${action.name}` }
            }
        },
        [onNavigate],
    )
