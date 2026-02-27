# @delphi/telphi-sdk

A self-contained React SDK for embedding a WebRTC softphone powered by [Janus Gateway](https://janus.conf.meetecho.com/). Ships with a pre-built phone UI (MUI) and a Zustand store for call initiation. Drop it into any React 18+ / Next.js application.

---

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Browser / Plain HTML](#browser--plain-html)
- [Configuration](#configuration)
- [Initiating Calls](#initiating-calls)
- [API Reference](#api-reference)
  - [Components](#components)
  - [Stores](#stores)
  - [Types](#types)
  - [Hooks (advanced)](#hooks-advanced)
  - [Utils (advanced)](#utils-advanced)
- [Architecture](#architecture)
- [Troubleshooting](#troubleshooting)

---

## Requirements

| Peer dependency | Version    |
| --------------- | ---------- |
| `react`         | `>=18.0.0` |
| `react-dom`     | `>=18.0.0` |

The following are **bundled** (no need to install separately):

- `@mui/material`, `@mui/icons-material`, `@mui/system` — phone UI
- `zustand` — state management

---

## Installation

Inside the monorepo (pnpm workspace):

```bash
pnpm add @kefir/telphi-sdk --filter <your-app>
```

Or add to `package.json` directly:

```json
{
  "dependencies": {
    "@kefir/telphi-sdk": "workspace:^0.1.0"
  }
}
```

---

## Quick Start

> **Next.js note:** Both `<WebRTCConfigInit>` and `<WebRTCPhone>` are `'use client'` components. Mount them inside a Client Component or a layout that supports client rendering.

### 1. Initialize config once at app root

Place `<WebRTCConfigInit>` high in your component tree (e.g. root layout). It reads config props and writes them into the SDK store.

```tsx
// app/layout.tsx  (Next.js App Router example)
import { WebRTCConfigInit } from "@kefir/telphi-sdk";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <WebRTCConfigInit
          apiDomain={process.env.NEXT_PUBLIC_API_DOMAIN!}
          apiKey={process.env.NEXT_PUBLIC_API_KEY!}
          preferPcma={true}
        />
        {children}
      </body>
    </html>
  );
}
```

### 2. Mount the phone UI

Place `<WebRTCPhone>` once per application (typically in an authenticated layout). It renders a floating action button and a full-screen call dialog.

```tsx
// app/(authenticated)/layout.tsx
import { WebRTCPhone } from "@kefir/telphi-sdk";

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <WebRTCPhone />
    </>
  );
}
```

### 3. Trigger a call from anywhere

Call `initiateCall` from the SDK store in any component:

```tsx
import { useWebRTCSdkStore } from "@kefir/telphi-sdk";

export function CallButton({
  endpointId,
  phoneNumber,
}: {
  endpointId: string;
  phoneNumber: string;
}) {
  const initiateCall = useWebRTCSdkStore((state) => state.initiateCall);

  return <button onClick={() => initiateCall({ endpointId, phoneNumber })}>Call</button>;
}
```

That's it — `<WebRTCPhone>` subscribes to `pendingCall` and opens the dialer automatically.

---

## Browser / Plain HTML

If your target environment is a plain HTML page (e.g. a CMS widget, a WordPress plugin, or a third-party embed), you can build a **fully self-contained IIFE bundle** that requires no build tool or npm on the host side.

### Building the bundle

```bash
# from the monorepo root
pnpm --filter @kefir/telphi-sdk build:browser

# or from inside packages/webrtc-sdk
node build.browser.mjs
```

Outputs:

| File                          | Description                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `dist/webrtc-sdk.iife.js`     | Readable, with source map                                                                    |
| `dist/webrtc-sdk.iife.min.js` | Minified for production                                                                      |
| `dist/meta.json`              | Bundle analysis — paste into [esbuild.github.io/analyze](https://esbuild.github.io/analyze/) |

### Drop-in HTML usage

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My Page</title>
  </head>
  <body>
    <!-- 1. Container element for the phone UI -->
    <div id="webrtc-root"></div>

    <!-- 2. Load the bundle (no other scripts required) -->
    <script src="webrtc-sdk.iife.min.js"></script>

    <!-- 3. Initialize and use -->
    <script>
      // Mount the phone UI into the container
      DelphiWebRTC.mount("#webrtc-root", {
        apiDomain: "api.example.com",
        apiKey: "my-api-key",
        preferPcma: true,
      });

      // Trigger a call from anywhere on the page
      function callEndpoint(endpointId, phoneNumber) {
        DelphiWebRTC.initiateCall({ endpointId, phoneNumber });
      }
    </script>
  </body>
</html>
```

### `window.DelphiWebRTC` API

| Method         | Signature                              | Description                                                                                                                     |
| -------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `mount`        | `(selector, options) => void`          | Mount the phone UI. `selector` is a CSS selector or DOM `Element`. `options` = `WebRTCConfig` + optional `onNavigate` callback. |
| `unmount`      | `(selector) => void`                   | Unmount and clean up the phone UI.                                                                                              |
| `configure`    | `(config: WebRTCConfig) => void`       | Update runtime config after mount.                                                                                              |
| `initiateCall` | `(params: InitiateCallParams) => void` | Open the dialer for an outbound call.                                                                                           |
| `getState`     | `() => { webrtcConfig, pendingCall }`  | Read current store state (useful for debugging).                                                                                |

> **Bundle size note:** The IIFE bundles React, ReactDOM, MUI and all dependencies (~2–3 MB unminified, ~800 KB–1 MB gzipped). For React apps, prefer the npm package to share React and MUI with the host application.

---

## Configuration

`<WebRTCConfigInit>` accepts all fields of `WebRTCConfig`:

| Prop         | Type          | Required | Description                                                                              |
| ------------ | ------------- | -------- | ---------------------------------------------------------------------------------------- |
| `apiDomain`  | `string`      | ✅       | Base domain for API and Janus (e.g. `api.example.com`)                                   |
| `apiKey`     | `string`      | ✅       | API key for call token requests                                                          |
| `preferPcma` | `boolean`     | —        | Use PCMA (G.711 A-law) instead of Opus. Eliminates transcoding on Janus. Default `true`. |
| `apiUrl`     | `string`      | —        | Override full API URL (skips `apiDomain`-based derivation)                               |
| `janusUrl`   | `string`      | —        | Override full Janus WebSocket URL                                                        |
| `iceServers` | `IceServer[]` | —        | Custom TURN/STUN servers. Falls back to SDK defaults if omitted.                         |

You can also set config programmatically (useful for server-side values loaded after hydration):

```ts
import { useWebRTCSdkStore } from "@kefir/telphi-sdk";

useWebRTCSdkStore.getState().setWebRTCConfig({
  apiDomain: "api.example.com",
  apiKey: "my-secret-key",
  iceServers: [{ urls: "turn:turn.example.com:3478", username: "user", credential: "pass" }],
});
```

---

## Initiating Calls

The SDK exposes a simple intent-based call API. Your application sets a `pendingCall`; the phone UI handles the rest.

```ts
import { useWebRTCSdkStore } from "@kefir/telphi-sdk";

// From a React component
const initiateCall = useWebRTCSdkStore((state) => state.initiateCall);
initiateCall({
  endpointId: "ep_abc123", // required
  phoneNumber: "+14155550100", // required
  endpointName: "NYC Office", // optional — shown in the UI
  appName: "Sales", // optional — shown in the UI
});

// From outside React (e.g. event handler, service)
useWebRTCSdkStore.getState().initiateCall({ endpointId: "ep_abc123", phoneNumber: "+14155550100" });
```

### Navigation callback (SPA routing)

If your app uses a client-side router pass `onNavigate` to `<WebRTCPhone>` so the phone can redirect after certain call events without triggering a full-page reload:

```tsx
import { useRouter } from "next/navigation";
import { WebRTCPhone } from "@kefir/telphi-sdk";

export function PhoneContainer() {
  const router = useRouter();
  return <WebRTCPhone onNavigate={(path) => router.push(path)} />;
}
```

---

## API Reference

### Components

#### `<WebRTCConfigInit>`

```tsx
import { WebRTCConfigInit } from "@kefir/telphi-sdk";

<WebRTCConfigInit apiDomain="api.example.com" apiKey="my-key" preferPcma={true} />;
```

Client component. Writes config into `useWebRTCSdkStore` on mount and whenever props change. Mount once at app root.

---

#### `<WebRTCPhone>`

```tsx
import { WebRTCPhone } from "@kefir/telphi-sdk";

<WebRTCPhone onNavigate={(path) => router.push(path)} />;
```

Client component. Renders a floating action button (minimized state) and a full-screen phone dialog. Subscribes to `pendingCall` in `useWebRTCSdkStore`.

| Prop         | Type                     | Description                                                                |
| ------------ | ------------------------ | -------------------------------------------------------------------------- |
| `onNavigate` | `(path: string) => void` | Optional. Called instead of `window.history.pushState` for SPA navigation. |

---

### Stores

#### `useWebRTCSdkStore`

The primary integration point. Use this store to configure the SDK and trigger calls.

```ts
import { useWebRTCSdkStore } from "@kefir/telphi-sdk";

const {
  webrtcConfig, // WebRTCConfig — current runtime config
  setWebRTCConfig, // (config: WebRTCConfig) => void
  pendingCall, // InitiateCallParams | null
  initiateCall, // (params: InitiateCallParams) => void
  clearPendingCall, // () => void
} = useWebRTCSdkStore();
```

#### `useWebRTCPhoneStore` (advanced)

Exposes internal phone state for advanced use cases (e.g. displaying call duration in a custom HUD, reading connection status).

```ts
import { useWebRTCPhoneStore } from "@kefir/telphi-sdk";

const { callState, callDuration, isMuted } = useWebRTCPhoneStore();
```

---

### Types

```ts
import type {
  WebRTCConfig, // SDK runtime configuration
  InitiateCallParams, // Parameters for initiateCall()
  IceServer, // TURN/STUN server definition
  WebRTCPhoneProps, // Props for <WebRTCPhone>
  PersistedCallState, // Stored across reconnections
  CallTokenResponse, // API response shape for call token endpoint
} from "@kefir/telphi-sdk";
```

---

### Hooks (advanced)

For building a fully custom phone UI without the MUI components:

```ts
import { useSendMessage, useCleanupCall, useCallChannel } from "@kefir/telphi-sdk";
```

| Hook             | Description                                                            |
| ---------------- | ---------------------------------------------------------------------- |
| `useSendMessage` | Send DTMF or arbitrary messages over the active call channel           |
| `useCleanupCall` | Tears down active WebRTC connections and resets phone store            |
| `useCallChannel` | Low-level bidirectional WebSocket channel with action/message handlers |

---

### Utils (advanced)

```ts
import {
  getDerivedUrls, // Derive API/Janus URLs from apiDomain
  animationStyles, // MUI keyframe animation presets
  playDtmfTone, // Play a DTMF tone via Web Audio API
  setAudioCodecPreferences, // Modify SDP to prefer PCMA/Opus
  logDebug, // Internal scoped logger
  randomString, // Crypto-safe random string generator
} from "@kefir/telphi-sdk";
```

---

## Architecture

```
@kefir/telphi-sdk
├── src/
│   ├── WebRTCPhone.tsx         # Full phone UI (MUI dialog + FAB)
│   ├── WebRTCConfigInit.tsx    # Config initializer component
│   ├── types.ts                # Shared TypeScript interfaces
│   ├── stores/
│   │   ├── webrtcSdkStore.ts   # Public store (config + call initiation)
│   │   ├── webrtcPhoneStore.ts # Internal phone state
│   │   └── webrtcRefsStore.ts  # Mutable refs (WebSocket, RTCPeerConnection)
│   ├── channel/
│   │   └── useCallChannel.ts   # Bidirectional WS channel (AI/ARI comms)
│   ├── hooks/                  # 15 internal hooks (connection, token, media, etc.)
│   └── utils/                  # Helpers (audio codec, DTMF, URL derivation, etc.)
└── index.ts                    # Public API surface
```

**Call flow:**

1. `initiateCall()` sets `pendingCall` in `useWebRTCSdkStore`
2. `<WebRTCPhone>` reacts to `pendingCall`, calls the API for a call token
3. Opens a Janus WebSocket, attaches SIP plugin, establishes RTCPeerConnection
4. Connects `useCallChannel` WebSocket for bidirectional AI/ARI communication
5. On hang-up, `useCleanupCall` tears down all connections and resets state

---

## Troubleshooting

**Phone doesn't open after calling `initiateCall()`**

- Verify `<WebRTCPhone>` is mounted in the component tree.
- Confirm `<WebRTCConfigInit>` ran before the call (check `apiKey` and `apiDomain` are non-empty in the store).

**`TypeError: Cannot read properties of null (reading 'createOffer')`**

- The Janus WebSocket failed to connect. Check `janusUrl` / `apiDomain` resolution and CORS/firewall rules.

**Audio one-way or missing**

- Ensure `iceServers` includes a valid TURN server if peers are behind symmetric NAT.
- Try setting `preferPcma: false` to use Opus if the gateway does not support PCMA pass-through.

**DTMF tones not audible**

- Web Audio API requires a user gesture before first use. Call `playDtmfTone` only in response to a user interaction.
