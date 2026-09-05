# AGENTS.md — Fast:V phone app

Instructions for an AI coding agent working on a third-party app for the Fast:V Roleplay in-game phone.
Copy this file into the root of your app repository as `AGENTS.md` (Codex, Cursor, Copilot) or `CLAUDE.md` (Claude Code).
Canonical copy: https://developers.fast-rp.com/phone-apps/AGENTS.md — human docs: https://developers.fast-rp.com/docs/phone-apps

## What you are building

A static web app (HTML/JS/CSS, any framework) that runs inside a sandboxed iframe in the in-game phone.
It talks to the phone only through the `@fastrp/phone-app-sdk` guest SDK over `postMessage`.
It is uploaded as a zip through the developer portal, scanned automatically, reviewed by staff, then served from
`https://app-<slug>.gta5fast.com/`.

Start from the template: `git clone https://github.com/fastroleplay/phone-app-template` (React 19 + Vite + Tailwind v4 + shadcn, Bun).

## Hard rules (the platform enforces these; do not work around them)

1. **The SDK ships inside the package.** `public/fastapp-sdk.js` is copied from `node_modules/@fastrp/phone-app-sdk/child.umd.js`
   by `bun run sync-sdk` (part of `bun run build`). The page is served with `script-src 'self'`; a CDN `<script>` never runs.
   `index.html` must load `./fastapp-sdk.js` before the app bundle.
2. **`index.html` sits at the zip root.** No wrapping folder. `bun run pack` builds and zips `dist/` correctly.
3. **No browser storage.** The frame has an opaque origin: `localStorage`, `sessionStorage`, cookies and IndexedDB are empty on
   every open. Persist with `sdk.storage.*` (per install, 256 KB, 256 keys, 32 KB per value) or your own backend.
4. **Only declared hosts are reachable.** `fetch` works only against hostnames declared in the portal (max 10, HTTPS implied,
   `*.example.com` allowed, IP literals and platform hosts refused). Everything else is blocked by `connect-src`.
5. **`installId` is an identity handle, not proof of identity.** Never authenticate a backend request with it.
   Use `sdk.identity.getToken()` and verify the JWT on the server against
   `https://public-gateway.fast-rp.com/.well-known/jwks.json` (ES256; `sub` = installId, `aud` = your appId).
6. **Permissions are a ceiling the player lowers.** The portal declaration lists what you may ask for; the player grants a
   subset at install; `PERMISSION_DENIED` is a normal answer, not an error to retry. Ask again with `sdk.permissions.request([...])`.
7. **The declaration freezes on submit.** Permissions and domains cannot change after "Submit for review" without a new release.
8. **Never use `window.parent` yourself.** All host communication goes through the SDK.

## Project layout (template)

```
index.html            loads ./fastapp-sdk.js then the app
public/fastapp-sdk.js vendored SDK (generated; do not edit; gitignored)
src/main.tsx          <PhoneAppProvider sdk={sdk}>
src/phone.ts          createPhoneSDK(...) singleton + theme -> CSS variable mapping
src/App.tsx           status screens (connecting / ready / outside / mismatch) + your UI
vite.config.ts        base './', server.cors '*', strips crossorigin attributes — keep these
scripts/pack.mjs      bun run pack -> app.zip
```

Commands: `bun install` · `bun run dev` (port 5024) · `bun run build` · `bun run pack`.

## Local testing

Open the preview harness with the dev server URL:

```
https://public-gateway.fast-rp.com/api/sdk/0.2/preview.html?app=http://localhost:5024
```

It frames the app at the real 459×995 viewport, lets you toggle each permission, answers consent prompts, emulates
rate limits, storage quotas, `USER_DENIED`, pushes and theme changes. Nothing outside the harness or the phone answers
`hello`, so `whenReady()` never resolves in a plain browser tab — use `sdk.isInsidePhone()` for an "open in preview" screen.

## SDK cheat sheet (protocol 0.2)

```ts
import { createPhoneSDK, isPhoneError } from '@fastrp/phone-app-sdk/client';
const sdk = createPhoneSDK({ readyTimeoutMs: 3000 });
const ctx = await sdk.whenReady();          // { appId, installId, permissions, theme, viewport, protoVersion }
sdk.on('theme.changed', (theme) => ...);    // also: viewport.changed, app.visibility, permissions.changed, notification
```

React: `import { PhoneAppProvider, usePhoneApp, usePhoneContext, usePhonePermission, usePhoneEvent } from '@fastrp/phone-app-sdk/react'`.

| Namespace | Methods | Permission | Player consent |
|---|---|---|---|
| `phone` | `notify({title,body?})` (64/160 chars), `close()`, `setBadge({count})` (0–99), `vibrate()` | `phone.notify` for notify | — |
| `permissions` | `request([...])` → `{ permissions }` | — | grant sheet |
| `storage` | `get(key)`, `set(key,value)`, `remove(key)`, `list()` | — | — |
| `identity` | `getProfile()` → `{ installId, displayName, phoneNumber }`, `getToken()` → `{ token, expiresAt }` | `identity.profile`, `identity.phoneNumber` (fields null when not granted) | — |
| `contacts` | `list()` → `[{ name, phone }]` (≤500) | `contacts.read` | once per session |
| `location` | `get('coarse' \| 'fine')` | `location.coarse` / `location.fine` | fine: once per session |
| `messaging` | `send({ to, content })` (≤500 chars, 20/day) | `messaging.send` | every call |
| `bank` | `requestPayment({ amount ≤ 50000, description ≤ 80, nonce? })` | `bank.payments` | every call |
| `photos` | `pick()` → `{ url, width, height } \| null` | `photos.read` | picker |

Storage keys match `^[A-Za-z0-9._-]{1,128}$`. Values are JSON.

Error codes: `USER_DENIED`, `PERMISSION_DENIED`, `UNKNOWN_ACTION`, `PROTOCOL_MISMATCH`, `INVALID_PARAMS`, `TIMEOUT`,
`RATE_LIMITED` (`details.retryAfterMs`), `QUOTA_EXCEEDED`, `ACTION_FAILED`. Check with `isPhoneError(err)` and `err.code`.
`TIMEOUT` means "no answer", not "did not happen" — never blindly retry a payment or a message; reuse the same `nonce`.

Rate limits are per action (for example `storage.get` 20/s, `phone.notify` 1/s burst 5, `identity.getToken` 1 per 30 s) with a
global ceiling of 30/s. On `RATE_LIMITED`, wait `details.retryAfterMs`.

## Layout

Viewport 459×995 CSS px; the phone status bar covers the top 64 px and the home indicator the bottom 16 px (draw under them,
keep controls out of them). The phone scales the whole frame, so author in these pixels. Theme colours arrive in
`ctx.theme` (`background`, `surface`, `accent`, `label`, `secondaryLabel`, `colorScheme`) and change live via `theme.changed`.
Text inputs work as normal; the SDK reports focus to the phone so typing does not move the player.

## Backend (only if the app needs a server)

Create "server credentials" for the app in the portal (an OAuth client with scope `phone-app:server`), then:

```
POST https://public-gateway.fast-rp.com/oauth/token   grant_type=client_credentials  (Basic auth)  -> access_token (1 h)
GET/PUT/DELETE /v1/apps/installs/{installId}/storage[/{key}]   same store the SDK uses
POST /v1/apps/installs/{installId}/push  { title ≤80, body? ≤240, data? ≤1 KB, requestId }  -> 20/day/install; requires phone.notify
POST /v1/apps/token/introspect  { token }
GET  /v1/apps/me
```

Verify player tokens locally with the JWKS (recommended) or via introspect. `/v1/apps/*` is limited to 300 requests/min per client.
A push refused for a missing grant also returns 429 with `message: "permission_denied"` — do not retry that one.

## Publishing

Portal: `https://ucp.fast-rp.com/<server>/developers/apps`. Create the app (slug 3–32 chars, lowercase, digits, hyphens; permanent),
fill the store listing, set the declaration (permissions, domains, payout account if `bank.payments`), upload `app.zip`, wait for the
scan, submit for review. Approval publishes. Releases are numbered by the server (1, 2, 3…); the last three stay restorable from the portal.

## When unsure

Prefer the docs over guessing: https://developers.fast-rp.com/docs/phone-apps (quickstart, concepts, sdk, backend, faq).
Do not invent SDK methods; the full list is above. Do not add a service worker, `<iframe>`, `<object>` or `eval` of remote code.
