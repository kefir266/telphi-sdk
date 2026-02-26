/**
 * Browser entrypoint for @delphi/webrtc-sdk.
 *
 * Compiled to a self-contained IIFE (including React + MUI) by build.browser.mjs.
 * Exposes the global `window.DelphiWebRTC` object.
 *
 * Usage in plain HTML:
 * <script src="webrtc-sdk.iife.js"></script>
 * <div id="webrtc-root"></div>
 * <script>
 *   DelphiWebRTC.mount('#webrtc-root', {
 *     apiDomain: 'api.example.com',
 *     apiKey: 'my-key',
 *   })
 *   // later…
 *   DelphiWebRTC.initiateCall({ endpointId: 'ep_1', phoneNumber: '+14155550100' })
 * </script>
 */

import React from 'react'

import ReactDOM from 'react-dom/client'

import { useWebRTCPhoneStore } from './stores/webrtcPhoneStore'
import type { InitiateCallParams, WebRTCConfig } from './types'
import { WebRTCConfigInit } from './WebRTCConfigInit'
import { WebRTCPhone } from './WebRTCPhone'

type MountOptions = WebRTCConfig & {
    /** Called instead of `window.history.pushState` for SPA-style navigation. */
    onNavigate?: (path: string) => void
}

// Map of mounted roots keyed by container element so unmount works correctly
const roots = new Map<Element, ReactDOM.Root>()

/**
 * Mount the WebRTC phone UI into a DOM element.
 *
 * @param selector CSS selector string OR a DOM Element
 * @param options  WebRTC config + optional navigation callback
 *
 * @example
 * DelphiWebRTC.mount('#webrtc-root', {
 *   apiDomain: 'api.example.com',
 *   apiKey: 'my-key',
 *   preferPcma: true,
 * })
 */
function mount(selector: string | Element, options: MountOptions): void {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector

    if (!el) {
        console.error(`[DelphiWebRTC] mount(): element not found — "${selector}"`)
        return
    }

    const { onNavigate, ...config } = options

    // Reuse existing root if already mounted in the same element
    let root = roots.get(el)
    if (!root) {
        root = ReactDOM.createRoot(el)
        roots.set(el, root)
    }

    root.render(
        <React.StrictMode>
            <WebRTCConfigInit config={config} />
            <WebRTCPhone onNavigate={onNavigate} />
        </React.StrictMode>,
    )
}

/**
 * Unmount the WebRTC phone from a previously mounted element.
 *
 * @param selector CSS selector string OR a DOM Element
 */
function unmount(selector: string | Element): void {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector

    if (!el) return

    const root = roots.get(el)
    if (root) {
        root.unmount()
        roots.delete(el)
    }
}

/**
 * Update WebRTC configuration (can be called at any time after mount).
 *
 * @param config WebRTCConfig
 *
 * @example
 * DelphiWebRTC.configure({ apiDomain: 'new.example.com', apiKey: 'new-key' })
 */
function configure(config: WebRTCConfig): void {
    useWebRTCPhoneStore.getState().setWebRTCConfig(config)
}

/**
 * Trigger an outbound call. The mounted <WebRTCPhone> will open automatically.
 *
 * @param params InitiateCallParams
 *
 * @example
 * DelphiWebRTC.initiateCall({
 *   endpointId: 'ep_abc123',
 *   phoneNumber: '+14155550100',
 *   endpointName: 'NYC Office',
 * })
 */
function initiateCall(params: InitiateCallParams): void {
    useWebRTCPhoneStore.getState().initiateCall(params)
}

/**
 * Read-only access to the current WebRTC config and pending call state.
 */
function getState() {
    const s = useWebRTCPhoneStore.getState()
    return {
        webrtcConfig: s.webrtcConfig,
        pendingCall: s.pendingCall,
    }
}

export const DelphiWebRTC = {
    mount,
    unmount,
    configure,
    initiateCall,
    getState,
}

// Attach to window for plain-HTML / non-module usage
if (typeof window !== 'undefined') {
    ;(window as any).DelphiWebRTC = DelphiWebRTC
}
