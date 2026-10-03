# AGENTS.md — Fast:V phone app (protocol 0.3)

Instructions for an AI coding agent working on a third-party app for the Fast:V Roleplay in-game phone.
Copy this file into the root of your app repository as `AGENTS.md` (Codex, Cursor, Copilot, Windsurf) or `CLAUDE.md`
(Claude Code). Canonical copy: https://developers.fast-rp.com/phone-apps/AGENTS.md
Human docs (Turkish): https://developers.fast-rp.com/docs/phone-apps — SDK on npm: `@fastrp/phone-app-sdk`.

Everything below is verified against the SDK and platform source. Do not invent methods, permissions, limits or
endpoints that are not listed here; when something is missing, read the docs instead of guessing.

---

## 1. What a phone app is

- A **static web app** (any framework, or plain HTML) that runs inside a **sandboxed iframe** in the in-game phone.
  The frame is `sandbox="allow-scripts"` with an **opaque origin**: no cookies, no `localStorage`/`sessionStorage`/IndexedDB,
  no `allow-same-origin`, no popups, no top-navigation.
- It talks to the phone **only** through the guest SDK, which uses `postMessage` to `window.parent`. The phone answers
  through the same channel. Nothing else reaches the game.
- It is packaged as a **zip**, uploaded in the developer portal, **scanned** automatically, **reviewed** by staff, and
  then served from `https://app-<slug>.gta5fast.com/` with a strict Content-Security-Policy.
- Players install it from the in-game store. Each install is tied to one **character**; the app sees that install
  through a random, stable **`installId`**, never the character id.
- It needs **no server** for shared data: **App Data** (section 10) is a platform-hosted database the app reads and
  writes directly over HTTPS with collections, schemas and access rules defined in the portal. A server of your own is
  only needed for work that happens while the player is offline (pushes, external APIs, payment fulfilment).

## 2. Non-negotiable rules (platform-enforced)

| # | Rule | Why / what breaks |
|---|---|---|
| 1 | **The SDK file ships inside the package** as `fastapp-sdk.js` next to `index.html`, loaded with `<script src="./fastapp-sdk.js">` **before** the app bundle. | CSP is `script-src 'self'`: a CDN or gateway `<script>` never executes. `bun run sync-sdk` copies it from `node_modules/@fastrp/phone-app-sdk/child.umd.js`; `bun run pack` refuses a zip without it. |
| 2 | **`index.html` is at the zip root.** No wrapping folder. | The phone loads the entry document from the root; the scan rejects `MISSING_INDEX`. |
| 3 | **No browser persistence.** Use `sdk.storage.*` (per install, 256 KB), App Data (section 10) or your own backend. | Opaque origin: everything in the browser is gone on the next open. |
| 4 | **`fetch` only to declared hostnames plus the two platform origins.** Declare your own hosts in the portal (max 10). `https://public-gateway.fast-rp.com` (App Data API) and `https://fastv.s3.us-east-2.amazonaws.com` (file uploads) are injected into every app's `connect-src` and cannot be declared. | Undeclared requests fail silently as CSP violations. |
| 5 | **`installId` identifies, it does not authenticate.** Backend requests must carry the JWT from `sdk.identity.getToken()`, verified against the platform JWKS. | Anyone can send any string to your backend. |
| 6 | **Permissions are a ceiling the player lowers.** `PERMISSION_DENIED` is a normal answer. Ask again with `permissions.request()`; never loop. | The player grants a subset at install and can be asked once more, in a sheet the phone draws. |
| 7 | **The declaration freezes on submit.** Permissions and domains of a submitted release cannot change; upload a new package to change them. App Data schemas and rules are **not** frozen — they change live in the portal. | Reviewers approve a specific declaration. |
| 8 | **Do not touch `window.parent`, `postMessage`, or the `__fastapp` envelope yourself.** | The SDK owns the protocol; hand-rolled messages are dropped or break the handshake. |
| 9 | **No `<iframe>`, `<object>`, `<embed>`, workers, service workers, `form` submissions, or remote `eval`.** | CSP: `frame-src`, `child-src`, `worker-src`, `object-src`, `form-action` are all `'none'`. `'unsafe-inline'`/`'unsafe-eval'` are allowed for your **own** bundle only. |
| 10 | **Allowed file types in the zip**: html, htm, css, js, mjs, json, map, png, jpg, jpeg, gif, webp, svg, ico, woff, woff2, ttf, eot, txt, webmanifest, xml. Zip ≤ 50 MB. | Anything else fails the scan (`DISALLOWED_EXTENSION`). |
| 11 | **Never trust `amount` or `paymentId` sent by the app to your backend.** Verify with `GET /v1/apps/payments/{paymentId}` or the `payment.recorded` webhook. | The frame is player-controlled; only the platform record proves money moved. |

Images, fonts and media may be loaded from any `https:` origin (`img-src`/`font-src`/`media-src` allow `https:` plus `data:`/`blob:`).
Scripts and stylesheets must be your own files.

## 3. Template and commands

Start from https://github.com/fastroleplay/phone-app-template (React 19 + Vite 6 + TypeScript + Tailwind v4 + shadcn/ui, Bun).

```
index.html             loads ./fastapp-sdk.js first, then /src/main.tsx
public/fastapp-sdk.js  vendored guest SDK — generated by sync-sdk, gitignored, never edit
src/main.tsx           <PhoneAppProvider sdk={sdk}><App/></PhoneAppProvider>
src/phone.ts           sdk = createPhoneSDK({ readyTimeoutMs: 2000 }); applyContext(); previewUrl()
src/App.tsx            status screens (connecting / ready / outside / mismatch) + the app
src/styles.css         maps --phone-* CSS variables onto shadcn tokens
vite.config.ts         base './', server.port 5024, server.cors '*', plugin that strips `crossorigin` — keep all three
scripts/pack.mjs       --sync-sdk copies the SDK; default run zips dist/ → app.zip (checks index.html + fastapp-sdk.js)
AGENTS.md              this file
```

| Command | Effect |
|---|---|
| `bun install` | installs deps incl. `@fastrp/phone-app-sdk` |
| `bun run dev` | Vite on http://localhost:5024 (CORS `*` because the harness frames it with `Origin: null`) |
| `bun run sync-sdk` | copies `child.umd.js` → `public/fastapp-sdk.js` |
| `bun run build` | sync-sdk + `tsc -b` + `vite build` → `dist/` |
| `bun run pack` | build + zip `dist/` contents (root-level) → `app.zip` |

Keep `base: './'` — the package is served from an arbitrary path. Keep the `strip-crossorigin` plugin — Vite's
`crossorigin` attribute makes module fetches CORS requests from an opaque origin.

## 4. Theme and layout

- **Viewport**: 459 × 995 CSS px. The phone draws its status bar over the top **64 px** and the home indicator over the
  bottom **16 px**; the app receives the full area, so paint under them and keep interactive controls out of them
  (`context.viewport = { width, height, safeAreaTop, safeAreaBottom }`). The phone scales the whole frame (about 0.75 at 1080p);
  author in these pixels.
- **Theme** (`context.theme`): `{ label, secondaryLabel, background, surface, accent, colorScheme: 'dark' | 'light' }`
  (hex strings). Dark: background `#08090b`, surface `#1a1c21`, label `#f5f6f8`, secondary label `#969799`, accent `#fab432`.
  Light: background `#f2f2f7`, surface `#ffffff`, label `#161a22`, secondary label `#6e7077`, accent `#fab432`. The phone
  resolves these from the FAST design system's phone tokens, so they move when the phone is restyled — read them from
  `context.theme`, never hard-code them. It changes live: handle `theme.changed` (the template's `applyContext()`
  writes `--phone-<key>` CSS variables and `color-scheme`, so shadcn components follow automatically).
- **Language** (`context.locale`, `'en' | 'tr'`): the player's game language. Handle `locale.changed`; ship both languages.
- **Keyboard**: `<input>`, `<textarea>` and `contenteditable` are tracked automatically; focusing one takes the game
  keyboard so typing does not move the player. Custom keypads with no real form element call `sdk.setInputFocus(true/false)`.
- **Navigation**: single page. The phone has a back gesture bar; provide your own in-app back affordance. `sdk.phone.close()`
  returns to the home screen.

## 5. SDK reference (`@fastrp/phone-app-sdk/client`)

### 5.1 Lifecycle

```ts
import { createPhoneSDK, isPhoneError, PhoneError } from '@fastrp/phone-app-sdk/client';

const sdk = createPhoneSDK({
  timeoutMs: 30_000,     // per-call deadline → TIMEOUT (default 30 000)
  readyTimeoutMs: 2000,  // whenReady() deadline; default: 3 s when not framed, unlimited when framed
});

sdk.isInsidePhone();                         // false when window.parent === window → show an "open in preview" screen
const ctx = await sdk.whenReady({ timeoutMs: 2000 }); // PhoneAppContext; rejects PROTOCOL_MISMATCH | TIMEOUT
sdk.getContext();                            // PhoneAppContext | null (live, updated by events)
const off = sdk.onContextChange((ctx) => {}); // fires on ready + every context-bearing event
sdk.supports('map.setWaypoint');             // boolean — reads context.actions; false before ready
sdk.version;                                 // SDK build version, e.g. '0.3.0'
sdk.protocolVersion;                         // '0.3'
sdk.dispose();                               // rejects pending calls with ACTION_FAILED, releases keyboard, instance dead
```

Create the SDK **at module load** (not inside a component): the handshake is sent on creation and the phone may answer
before a lazily created listener exists. One instance per page. Gate every 0.3 feature behind `sdk.supports(action)`
(or a check on `context.protoVersion`) — a 0.2 phone still serves the app and answers `UNKNOWN_ACTION` otherwise.

`PhoneAppContext`:

```ts
{
  protoVersion: string;            // '0.3' (a 0.2 phone sends '0.2' and omits the fields marked 0.3)
  appId: string;
  installId: string;               // stable per (character, app); identity handle
  characterId: string;             // DEPRECATED alias of installId (0.1 compat) — never the real character id
  permissions: string[];           // granted ∩ declared by the live release
  theme: PhoneAppTheme;
  viewport: { width: number; height: number; safeAreaTop: number; safeAreaBottom: number };
  locale: 'en' | 'tr';             // 0.3 — player's game language; live via locale.changed
  actions: string[];               // 0.3 — every action this phone answers; supports() reads it
  signal: { strength: number; bars: number; status: 'none' | 'weak' | 'fair' | 'good' | 'excellent' }; // 0.3 — live via signal.changed
  launch?: { source: 'push' | 'app'; from?: string; data?: Record<string, unknown> }; // 0.3 — only when opened by a push tap or another app
}
```

`launch` is present only for that one open: absent when the player taps the icon on the home screen. A push that arrives
while the app is already open does not produce `launch`; it arrives as the `notification` event. `launch.data` ≤ 1 KB.

### 5.2 Events (host → app)

```ts
const off = sdk.on('theme.changed', (theme) => ...);   // returns unsubscribe
sdk.off('theme.changed', listener);
```

| Event | Payload | When |
|---|---|---|
| `theme.changed` | `PhoneAppTheme` | player switches the phone palette |
| `viewport.changed` | `{ width, height, safeAreaTop, safeAreaBottom }` | reserved for future devices |
| `app.visibility` | `{ visible: boolean }` | phone opened/closed while this app is in the foreground |
| `permissions.changed` | `{ permissions: string[] }` | after `permissions.request()` or a grant change |
| `notification` | `{ title, body?, data? }` | a push sent by **your backend** while the app is open |
| `locale.changed` | `{ locale: 'en' \| 'tr' }` | 0.3 — player switched the game language |
| `signal.changed` | `{ strength, bars, status }` | 0.3 — cell signal changed |
| `storage.changed` | `{ key: string; source: 'backend' }` | 0.3 — **your backend** wrote or deleted this install's storage key through `/v1/apps/installs/{id}/storage/{key}`; re-read with `storage.get(key)`. Writes from the app itself do not fire it |

`theme.changed`, `viewport.changed`, `permissions.changed`, `locale.changed` and `signal.changed` also update
`getContext()` / `onContextChange`.

### 5.3 Namespaces

All methods return Promises and reject with `PhoneError`.

| Method | Params → Result | Permission | Consent sheet | Notes |
|---|---|---|---|---|
| `setInputFocus(focused)` | `boolean → null` | — | — | custom keypads only |
| `phone.notify({ title, body? })` | title ≤ 64 chars, body ≤ 160 → `null` | `phone.notify` | — | in-phone toast; strings are truncated |
| `phone.close()` | `→ null` | — | — | returns to home |
| `phone.setBadge(count)` | `0–99 → null` | — | — | home-icon badge, session-scoped, 0 clears |
| `phone.vibrate(pattern?)` | `'short' \| 'long' → null` | — | — | shakes the phone chrome |
| `phone.openApp({ appId, data? })` | data ≤ 1 KB → `null` | — | once per target app per session | 0.3 — opens another **installed** app; it receives `context.launch = { source: 'app', from: yourAppId, data }`; this app closes. Not installed → `ACTION_FAILED` (`details.reason: 'appNotInstalled'`) |
| `permissions.request(list)` | `string[] → string[]` (full granted list) | — | grant sheet | only declared-but-ungranted names are asked; others ignored |
| `storage.get<T>(key)` | `→ T \| undefined` | — | — | per install |
| `storage.set(key, value)` | value JSON-serialisable → `void` | — | — | value ≤ 32 KB; store ≤ 256 KB and ≤ 256 keys |
| `storage.remove(key)` | `→ void` | — | — | |
| `storage.list()` | `→ { keys: string[]; bytesUsed: number }` | — | — | |
| `storage.clear()` | `→ void` | — | — | 0.3 — drops **every** key, including ones your backend wrote and the App Data session (`__fastapp_session`) |
| `identity.getProfile()` | `→ { installId, displayName: string \| null, phoneNumber: string \| null }` | `identity.profile` and/or `identity.phoneNumber` | — | ungranted fields are `null`; needs at least one of the two |
| `identity.getToken()` | `→ { token: string; expiresAt: number }` (Unix ms) | — | — | ES256 JWT, 10 min; cached by the phone until ~1 min before expiry |
| `contacts.list()` | `→ Array<{ name: string; phone: string }>` (≤ 500) | `contacts.read` | once per app session | |
| `contacts.pick()` | `→ { name, phone } \| null` | — | the picker itself | 0.3 — one contact chosen in a phone-drawn list; cancel → `null`. Prefer it over `contacts.list` for "send to a friend" flows: no permission to declare |
| `location.get(accuracy)` | `'coarse' → { accuracy:'coarse', district: string \| null, x, y }` (500 m grid) · `'fine' → { accuracy:'fine', x, y, z, heading }` | `location.coarse` / `location.fine` | fine: once per session | `fine` also satisfies `coarse` |
| `messaging.send({ to, content })` | phone number string, content ≤ 500 chars → `{ messageId }` | `messaging.send` | **every call** | 20 messages/day/install; sent from the player's own number |
| `bank.requestPayment({ amount, description, nonce? })` | amount integer 1–50 000, description ≤ 80 → `{ paymentId, amount }` | `bank.payments` | **every call** | pays the app's payout account (set in the portal); nonce minted for you; same nonce never charges twice; 20 payments and 250 000 total per install per day. Since 0.3 every payment is recorded on the platform — your backend verifies `paymentId` (section 9) |
| `photos.pick()` | `→ { url: string; width: number \| null; height: number \| null } \| null` | `photos.read` | the picker | `url` is a public https image URL — renders in `<img>`, **not** fetchable from the app (CSP); cancel → `null`, not an error |
| `map.setWaypoint({ x, y, label? })` | label ≤ 40 chars → `null` | `map.waypoint` | **every call** (sheet shows label + coordinates) | 0.3 — sets the player's GPS waypoint; world `x, y` as in `location.get` |
| `map.clearWaypoint()` | `→ null` | `map.waypoint` | — | 0.3 |
| `map.open({ x, y, name? })` | `→ null` | — | — | 0.3 — opens the phone's Map app centred on the point; this app closes; no GPS change |
| `environment.get()` | `→ { hour, minute, weather, serverTime }` | — | — | 0.3 — in-game clock (0–23 / 0–59), GTA weather name (`EXTRASUNNY`, `RAIN`, …), server wall clock in Unix ms. Game time runs faster than real time; poll once a minute at most |
| `browser.open({ url })` | `→ null` | — | — | 0.3 — opens a `*.gta5fast.com` site in the phone's Browser app; this app closes. Any other host, `http:` or `fastapp:` → `INVALID_PARAMS` |
| `request(action, params?)` | raw typed escape hatch | per action | | for actions newer than this SDK build |

Storage keys match `^[A-Za-z0-9._-]{1,128}$`. Storage is shared with your backend through `/v1/apps/installs/{installId}/storage`.
`phone.openApp`, `map.open` and `browser.open` close your app; save state first.

### 5.4 Errors

```ts
try { await sdk.phone.notify({ title: 'Hi' }); }
catch (err) {
  if (isPhoneError(err)) switch (err.code) { /* ... */ }
}
```

| Code | Meaning | What to do |
|---|---|---|
| `USER_DENIED` | player refused a consent sheet | respect it; offer the feature again only on an explicit user action |
| `PERMISSION_DENIED` | not granted (or not declared by the live release) | show why you need it, then `permissions.request([...])` once |
| `UNKNOWN_ACTION` | not in the host allowlist | wrong action name, or a 0.3 action on a 0.2 phone — check `sdk.supports()` first |
| `PROTOCOL_MISMATCH` | host refuses this SDK line | the app cannot run; show a "please update" screen. Also returned for requests sent before `ready` |
| `INVALID_PARAMS` | validation failed before the action ran | fix the call |
| `TIMEOUT` | no answer within the deadline — the action **may** have happened | idempotent reads: retry; payments: retry **with the same nonce**; messages: ask the user |
| `RATE_LIMITED` | per-action or global bucket empty | wait `err.details.retryAfterMs` |
| `QUOTA_EXCEEDED` | per-install quota spent (storage bytes/keys, daily messages/payments) | stop; show the limit |
| `ACTION_FAILED` | the action ran and failed (e.g. insufficient funds, recipient has no phone, payout account missing, target app not installed) | show `err.message` (a locale-key-derived text from the phone) |

### 5.5 Rate limits (per app frame, token bucket)

| Action | Sustained | Burst |
|---|---|---|
| `phone.setInputFocus` | 10/s | 20 |
| `phone.notify` | 1/s | 5 |
| `phone.close` | 2/s | 2 |
| `phone.setBadge` | 2/s | 4 |
| `phone.vibrate` | 1/s | 2 |
| `phone.openApp` | 1 per 2 s | 1 |
| `permissions.request` | 1 per 10 s | 1 |
| `storage.get` | 20/s | 40 |
| `storage.set` / `storage.remove` | 5/s | 20 |
| `storage.list` | 2/s | 4 |
| `storage.clear` | 1 per 5 s | 1 |
| `identity.getProfile` | 1/s | 3 |
| `identity.getToken` | 1 per 30 s | 2 |
| `contacts.list` | 1 per 5 s | 1 |
| `contacts.pick` | 1 per 2 s | 1 |
| `location.get` | 1 per 2 s | 2 |
| `messaging.send` | 1 per 10 s | 1 |
| `bank.requestPayment` | 1 per 5 s | 1 |
| `photos.pick` | 1 per 2 s | 1 |
| `map.setWaypoint` / `map.clearWaypoint` / `map.open` | 1 per 2 s | 1 |
| `environment.get` | 1/s | 3 |
| `browser.open` | 1 per 2 s | 1 |
| **global** | 30/s | 60 |

Cache reads; debounce `storage.set`; never poll the SDK in a tight loop.

### 5.6 React (`@fastrp/phone-app-sdk/react`)

```tsx
import { PhoneAppProvider, usePhoneApp, usePhoneContext, usePhonePermission, usePhoneEvent } from '@fastrp/phone-app-sdk/react';

<PhoneAppProvider sdk={sdk}>            // or options={{ readyTimeoutMs }} to let it create one
const { sdk, status, error } = usePhoneApp();  // status: 'connecting' | 'ready' | 'mismatch' | 'outside'; error: PhoneError | null
const ctx = usePhoneContext();                 // live PhoneAppContext | null (useSyncExternalStore; re-renders on theme/viewport/permissions/locale/signal)
const { granted, request } = usePhonePermission('contacts.read'); // request(): Promise<boolean>
usePhoneEvent('notification', (push) => ...);  // always calls the latest listener
```

`@fastrp/phone-app-sdk/react` re-exports everything from `/client`. The package root `@fastrp/phone-app-sdk` exports the
protocol constants (`PHONE_APP_ACTIONS`, `PHONE_APP_PERMISSIONS`, `PHONE_APP_ACTION_SPECS`, `PHONE_APP_LIMITS`, `PHONE_APP_EVENTS`,
`PHONE_APP_PROTOCOL_VERSION`, `PHONE_APP_HOST_ACCEPTS`, `PHONE_APP_DATA_ORIGIN`, `PHONE_APP_UPLOAD_ORIGIN`) and types — use them
instead of string literals.

### 5.7 Vanilla (no bundler)

`fastapp-sdk.js` defines `window.PhoneSDK = { createPhoneSDK, PhoneError, isPhoneError, createDataClient, version }`. Same API as above.

## 6. Permissions

| Permission | Unlocks | Consent on use |
|---|---|---|
| `phone.notify` | `phone.notify()`, backend push | — |
| `identity.profile` | `displayName` in `identity.getProfile()` and `name` claim in the token | — |
| `identity.phoneNumber` | `phoneNumber` in `identity.getProfile()` and `phone` claim in the token | — |
| `contacts.read` | `contacts.list()` | once per session |
| `location.coarse` | `location.get('coarse')` | — |
| `location.fine` | `location.get('fine')` (implies coarse) | once per session |
| `messaging.send` | `messaging.send()` | every call |
| `bank.payments` | `bank.requestPayment()`; requires a payout account in the portal | every call |
| `photos.read` | `photos.pick()` | the picker itself |
| `map.waypoint` | `map.setWaypoint()`, `map.clearWaypoint()` | every `setWaypoint` call |

Declare only what the app needs; the store shows the list and players decline generously. `storage.*`, `identity.getToken()`,
`phone.close/setBadge/vibrate/openApp`, `contacts.pick`, `map.open`, `environment.get`, `browser.open`, `setInputFocus`,
`permissions.request` and every App Data call need no permission.

## 7. Local testing

**Preview harness** (zero setup, use this first):

```
https://public-gateway.fast-rp.com/api/sdk/0.3/preview.html?app=http://localhost:5024
```

Renders the real 459×995 frame, answers `hello` as protocol 0.3, lets you toggle every permission, language and signal, asks
`confirm()` for consent-gated actions (so `USER_DENIED` is reachable), emulates rate limits (`RATE_LIMITED` + `retryAfterMs`),
storage quotas, an unsigned test token (`alg: none` — your backend must reject it), pushes (`notification`), visibility, theme
changes, and logs every message. `openApp`, `map.*` and `browser.open` are logged, nothing opens. `installId` there is a fixed
test value. App Data calls are served by an **in-memory `/v1/data` shim** (rules `app`, no schema validation, reset on reload).

**Offline App Data without the harness** (unit tests, plain browser tab): pass the memory transport in development.

```ts
import { createDataClient, createMemoryDataTransport } from '@fastrp/phone-app-sdk/data';
export const data = createDataClient({ sdk, transport: import.meta.env.DEV ? createMemoryDataTransport() : undefined });
```

**In-game channel**: type `fastapp:<subdomain>` in the phone's browser address bar. It resolves through **website hosting**
(the UCP *Website* tab), so the package must be uploaded there first; it grants **no permissions** (every gated call answers
`PERMISSION_DENIED`) and cannot reach your backend. Use it for layout and input checks on a real phone, not for feature tests.

A plain browser tab never answers `hello`: `whenReady()` rejects `TIMEOUT` after `readyTimeoutMs`. Show a screen that links to
the harness (the template's `previewUrl()` builds the link).

## 8. Publishing (developer portal)

`https://ucp.fast-rp.com/<server>/developers/apps`

1. **Create the app**: name, slug (3–32 chars, lowercase letters, digits, hyphens, cannot start/end with `-`; **permanent**;
   reserved: admin, api, app, apps, cdn, fast, fastrp, mail, ns1, ns2, static, store, support, www). Slug becomes
   `app-<slug>.gta5fast.com`.
2. **Store listing** (not reviewed, instant): icon PNG/WebP ≤ 400 KB (resized to 256 px), name, description.
3. **Declaration** (reviewed, frozen per release): permissions, domains (bare hostnames, HTTPS implied, `*.` leftmost label allowed,
   max 10; refused: IP literals, `localhost`, `*.local`, `*.internal`, `*.localhost`, `fast-webview`, `cfx-nui-*`, anything under
   `fast-rp.com` or `gta5fast.com`), payout account (character or faction bank account) when `bank.payments` is declared.
4. **Data tab** (not reviewed, live): App Data collections, schemas, rules, indexes, accounts toggle, files, usage — section 10.
   Create the collections **before** submitting a release that writes to them.
5. **Upload** `app.zip` → automatic scan (extension allowlist, zip-slip, size, JS content scan, antivirus, `index.html` at root).
   States: `pending_scan` → `ready` (or `rejected` with reasons). Re-uploading replaces the unsubmitted package.
6. **Submit for review** → `submitted` → `in_review` → `live` (approval **is** publication) or `rejected` (reason shown).
7. **Releases** are numbered by the server (1, 2, 3…). A new live release supersedes the previous one; the last **3** releases
   keep their files and can be **restored** from the portal without re-review. Installs always run the live release; an update
   that declares new permissions re-asks the player before those actions work.
8. **Suspension** by staff stops the app at the edge immediately; `archived` is terminal (slug stays taken).

## 9. Backend integration (only if the app needs a server)

Create **server credentials** on the app page (an OAuth client bound to the app with scope `phone-app:server`; the secret is shown once,
rotate from the portal). These are **not** the account-level "Sign in with Fast:V" OAuth clients on the OAuth tab.

**Get a token**

```
POST https://public-gateway.fast-rp.com/oauth/token
Authorization: Basic base64(client_id:client_secret)
grant_type=client_credentials&scope=phone-app:server
→ { access_token, token_type: "Bearer", expires_in: 3600, scope }
```

**Endpoints** (Bearer token; 300 requests/min per client; JSON)

| Method & path | Body | Response | Errors |
|---|---|---|---|
| `GET /v1/apps/me` | — | `{ appId, slug, name, status }` | |
| `GET /v1/apps/installs?cursor&limit` | — | `{ installs: [{ installId, serverId, grantedPermissions, createdAt }], nextCursor }` | limit ≤ 100; never a character id |
| `GET /v1/apps/installs/{installId}/storage` | — | `{ keys, bytesUsed, bytesLimit }` | 404 unknown install |
| `GET /v1/apps/installs/{installId}/storage/{key}` | — | `{ key, value }` | 404 missing |
| `PUT /v1/apps/installs/{installId}/storage/{key}` | `{ value }` | listing | 400 bad key/value, 413 quota. Fires `storage.changed` in the app if it is open |
| `DELETE /v1/apps/installs/{installId}/storage/{key}` | — | listing | 404 |
| `POST /v1/apps/installs/{installId}/push` | `{ title ≤80, body? ≤240, data? ≤1 KB JSON, requestId? ≤128 }` | `{ accepted, remainingToday }` | 404 install; 400 invalid; **429** when refused — `message` is `quota_exceeded` (20/day/install) **or** `permission_denied` (install lacks `phone.notify`; do not retry). A tap on the push opens the app with `context.launch = { source: 'push', data }` |
| `GET /v1/apps/payments?installId&cursor&limit` | — | `{ payments: [AppPayment], nextCursor }` | `installId` optional filter |
| `GET /v1/apps/payments/{paymentId}` | — | `AppPayment = { paymentId, installId, serverId, amount, description, occurredAt, recordedAt }` | 404 not this app's, or **not recorded yet** — the record lands right after the payment and is retried within a minute; poll a few times before treating 404 as "no payment" |
| `POST /v1/apps/token/introspect` | `{ token }` (+ Basic auth or `client_id`/`client_secret` in body) | RFC 7662: `{ active, sub, aud, iss, exp, iat, jti, typ, server_id, name?, phone? }` or `{ active: false }` | inactive for other apps' tokens |
| `GET /.well-known/jwks.json` | — | JWK set (ES256) | cache 1 h |
| `GET /.well-known/openid-configuration` · `/.well-known/oauth-authorization-server` | — | metadata | |

`installId` in these paths must belong to your app; the platform checks it. `requestId` is an idempotency key: the same id within the
retention window is delivered once. Pushes are delivered as an in-phone toast and, if your app is open, as the `notification` event.

**Verify a payment** (order flow): app calls `bank.requestPayment` → sends `paymentId` to your backend with its install token →
backend `GET /v1/apps/payments/{paymentId}`, checks `amount` and that `installId === token.sub` → fulfils. Never fulfil on the
app's own `amount`.

**Webhooks**: set an `https://` URL on the app's Backend tab and rotate the secret (shown once). The platform `POST`s
`{ id, type, appId, createdAt, data }` with headers `X-Fastapp-Event`, `X-Fastapp-Delivery` and
`X-Fastapp-Signature: sha256=<hex HMAC-SHA256 of the raw body>`.

| `type` | `data` |
|---|---|
| `install.created` | `{ installId, serverId, grantedPermissions }` |
| `install.removed` | `{ installId }` |
| `install.permissions_changed` | `{ installId, grantedPermissions }` |
| `payment.recorded` | `{ paymentId, installId, amount, description, occurredAt }` |

Answer `2xx` within 2 s (queue the work). Retries: 3 (after 5 s, 30 s, 2 min). 50 consecutive failures disable the webhook
(re-enable in the portal). Deliveries may repeat and arrive out of order: dedupe on `id`, order by `createdAt`. Verify the
signature on the **raw** body bytes with a constant-time compare before parsing JSON:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';
app.post('/fastapp/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const expected = `sha256=${createHmac('sha256', SECRET).update(req.body).digest('hex')}`;
  const given = req.header('X-Fastapp-Signature') ?? '';
  if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return res.status(401).end();
  const event = JSON.parse(req.body.toString('utf8'));
  // dedupe on event.id, then enqueue
  res.status(200).end();
});
```

**Verify a player token** (preferred over introspection):

```ts
import { createRemoteJWKSet, jwtVerify } from 'jose';
const JWKS = createRemoteJWKSet(new URL('https://public-gateway.fast-rp.com/.well-known/jwks.json'));
const { payload } = await jwtVerify(token, JWKS, {
  issuer: 'https://public-gateway.fast-rp.com',
  audience: MY_APP_ID,
});
// payload: { iss, sub: installId, aud: appId, app: appId, server_id, iat, exp, jti, typ: 'phone-app', name?, phone? }
```

Key on `sub` (the installId). Reject `typ !== 'phone-app'`. Tokens live 10 minutes; the app can fetch a fresh one every 30 s.

The same server credentials also reach App Data (`/v1/data/*`, 3 000 requests/min per client) and **bypass collection rules**:
`createDataClient({ credentials: { clientId, clientSecret } })` in Node.

## 10. Data (serverless backend) — `@fastrp/phone-app-sdk/data`

App Data is a platform-hosted document database the app talks to **directly over HTTPS** from the frame. Collections, JSON
schemas, access rules and indexes are defined in the portal (**Data** tab); the SDK handles auth, the API base URL is
`https://public-gateway.fast-rp.com/v1/data` and is already in every app's CSP. Rules are evaluated on the platform, so a
modified client cannot read what the rules deny. Docs: https://developers.fast-rp.com/docs/phone-apps/data

### 10.1 Client

```ts
import { createDataClient, isDataError, type DataError } from '@fastrp/phone-app-sdk/data';

const data = createDataClient({ sdk });                 // in the phone: install token, auto-refreshed
// createDataClient({ credentials: { clientId, clientSecret } })  // in Node: bypasses rules
// createDataClient({ sdk, transport: createMemoryDataTransport() }) // offline dev, section 7

const notes = data.collection<{ text: string; done: boolean }>('notes');

await notes.create({ text: 'Milk', done: false });          // → Doc; optional { id } — same id twice → CONFLICT
await notes.create({ text: 'Eggs', done: false }, { id: 'eggs' });
const page = await notes.list({ where: [['done', 'eq', false]], orderBy: [['createdAt', 'desc']], limit: 50 });
//    page: { items: Doc[], nextCursor: string | null }
const doc = await notes.get('eggs');                          // Doc | null
await notes.set('eggs', { text: 'Eggs x12', done: false });   // replace whole document
await notes.update('eggs', { done: true });                   // merge-patch (RFC 7396): null deletes a field
await notes.remove('eggs');
const stop = notes.subscribe({ where: [['done', 'eq', false]] }, (change) => {...}, { onError });
const { collections, accountsEnabled } = await data.schema();
data.dispose();                                              // closes open streams

type Doc<T> = { id: string; data: T; ownerSubject: string; createdAt: string; updatedAt: string };
```

Identity in `ownerSubject`: `inst:<installId>` by default, `acct:<accountId>` after the player signs in to an app
account (10.5), `app:<appId>` for documents written with server credentials. The owner is set on create and never changes.

### 10.2 Collections and schema (portal)

- Name `^[a-z][a-z0-9_]{0,63}$`; max **20** collections per app; deleting a collection deletes its documents.
- Optional **JSON Schema 2020-12** (strict). Limits: ≤ 32 KB, ≤ 200 properties, depth ≤ 8, local `$ref` only, `pattern` ≤ 256 chars,
  no `format`. The schema describes `data` only; `id/createdAt/updatedAt/ownerSubject` are outside it.
- Every write validates the **whole** document: root must be an object, no `$`-prefixed keys, ≤ 64 KB, depth ≤ 16, else `VALIDATION`.
- **Indexes**: up to **5** dotted paths per collection. Required for range ops (`lt lte gt gte`) and `orderBy` on a data path;
  `eq`, `ne`, `in`, `contains` and the system fields `id createdAt updatedAt ownerSubject` need none. Missing index →
  `VALIDATION` with `details.code = 'appdata.query.unindexed_field'`, `details.path`.
- Schemas, rules and indexes are **live** (not frozen per release, `schemaVersion` increments). Widen the schema **before**
  shipping the release that needs it; narrowing does not re-validate old documents.

### 10.3 Rules (per collection, per operation)

| Operation | Values | Meaning |
|---|---|---|
| `read` | `none` · `owner` · `app` | `owner`: lists return only the caller's documents, another owner's `get` → `NOT_FOUND` |
| `create` | `none` · `app` | `owner` is meaningless on create |
| `update` | `none` · `owner` · `app` | |
| `delete` | `none` · `owner` · `app` | |

`none` = nobody from the app (server credentials, the portal explorer and staff bypass all rules). `app` = every install of
the app. There is no `public`: every request carries an install token. Rules are per document, never per field — put
server-only fields in a separate collection with `update: none`. Common layouts: private notes `owner/app/owner/owner`;
leaderboard `app/app/owner/none`; catalog written by your server `app/none/none/none`; order inbox `owner/app/none/none`
(your server flips the status, the app sees it via realtime).

### 10.4 Query

```ts
type Query = {
  where?: [path: string, op: 'eq'|'ne'|'lt'|'lte'|'gt'|'gte'|'in'|'contains', value: unknown][]; // ≤ 10, ANDed; no OR
  orderBy?: [path: string, 'asc' | 'desc'][];  // ≤ 2; default createdAt desc, id
  limit?: number;                              // 1–100, default 25
  cursor?: string;                             // opaque keyset cursor from page.nextCursor; bound to the same where/orderBy
};
```

Paths: `^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*){0,3}$`, must exist in the schema when one is set. `in` ≤ 20 values.
`contains`: array field contains the value, or string field ILIKE `%value%` (value ≤ 64 chars). Under `read: owner` the owner
filter is added by the platform; under `read: app` filter on `ownerSubject` yourself. No transactions and no atomic counters:
for shared counters write one document per event and sum on read.

REST (SDK uses these; same for other languages): `POST /v1/data/collections/:name/query` (body = Query) · `GET|POST
/v1/data/collections/:name/documents` · `GET|PUT|PATCH|DELETE /v1/data/collections/:name/documents/:id`. Headers
`Authorization: Bearer <install JWT | client_credentials token>`, optional `X-App-Session`. Errors
`{ error, error_description, details? }`.

### 10.5 Realtime

`subscribe(query, onChange, { onError? })` opens an SSE stream (`GET /v1/data/subscribe?collection=&filter=<base64url where>`,
fetch-based because `EventSource` cannot send `Authorization`). Only the `eq` clauses of the query filter the stream; the
`read` rule applies per event. Payload: `{ collection, docId, op: 'create'|'update'|'delete', ownerSubject, data: T | null,
version (updatedAt), at }`. `data` is `null` on delete **and** for documents > 16 KB — call `get(docId)`. The stream only
carries changes after it connects: `list` first, then `subscribe` (or use `useCollection`). Heartbeat `: ping` every 25 s;
the SDK reconnects on 60 s of silence with 1 s → 30 s backoff; changes during the gap are not replayed — refetch on reconnect.
Max **3** open streams per install (the 4th → `RATE_LIMITED`); close streams on `app.visibility` `false`.

### 10.6 Accounts (optional)

Off by default; enable in the portal (**Data › Accounts**). Without it every `auth.*` call → `FORBIDDEN` and
`auth.current()` reports `accountsEnabled: false`. Accounts are app-scoped (not the player's Fast:V account) and exist to
carry data **across characters** or give players a chosen username.

```ts
data.auth.signUp(username, password)   // → Session; CONFLICT username taken; VALIDATION password not 8–128 chars
data.auth.signIn(username, password)   // → Session; UNAUTHORIZED wrong; RATE_LIMITED after 10 failures (15 min lockout)
data.auth.signOut()
data.auth.createLinkCode()             // → { code, expiresAt } — 10 min, single use; run on the signed-in character
data.auth.link(code)                   // → Session — run on the other character; NOT_FOUND when expired/used
data.auth.current()                    // → { subject: 'inst:…' | 'acct:…', account: { id, username } | null, accountsEnabled }
data.auth.onChange((account) => ...)   // fires on sign-in, sign-out and session invalidation (account === null)
```

Sessions are opaque tokens (30 days) stored in `sdk.storage` under `__fastapp_session` and sent as `X-App-Session` next to the
install token. An install links to at most one account; `signIn` on an unlinked install links it; a linked install signing in
to a different account → `FORBIDDEN`. On `appdata.auth.session_invalid` / `session_expired` the SDK clears the session,
retries the request once as the install and calls `onChange(null)` — send the player to the sign-in screen.
**Pitfall**: documents written as `inst:` before sign-in are not migrated to `acct:` and become invisible under `owner`
rules. Ask for the account on first launch, before writing data.

### 10.7 Files

```ts
const { id, url, size, mime } = await data.files.upload(file, { name?: string }); // File | Blob
await data.files.remove(id);
```

`upload` = `POST /v1/data/files { name, mime, size }` → presigned `PUT` straight to S3 (5 min, bound to mime+size; the gateway
body limit is 256 KB so files never go through it) → `POST /v1/data/files/:id/complete`. Uncompleted uploads are deleted after
1 h. Limits: ≤ **10 MB** per file, **5 000** files and **500 MB** per app; mime allowlist images / audio / video / PDF / JSON /
plain text (a `File` with empty `type` → `VALIDATION`). `url` is **public and permanent** for anyone who has it — use it in
`<img>/<audio>/<video>`, never for secrets. Files and documents are not linked: store `id` and `url` in the document and call
`files.remove(id)` when you delete the document. Owner or server credentials may delete.

### 10.8 Limits and errors

| Limit | Value |
|---|---|
| Collections / app · documents / collection · document bytes / app | 20 · 50 000 · 200 MB |
| Document | ≤ 64 KB, depth ≤ 16, object root, no `$` keys |
| Schema | ≤ 32 KB, ≤ 200 properties, depth ≤ 8; indexes ≤ 5 |
| Query | `where` ≤ 10, `orderBy` ≤ 2, `in` ≤ 20, `contains` ≤ 64 chars, `limit` ≤ 100, request body ≤ 64 KB |
| Requests | 300/min per install; 3 000/min per server client |
| Streams | 3 per install; ping 25 s; dead after 60 s; backoff 1 → 30 s; event `data` ≤ 16 KB |
| Files | 10 MB each; 5 000 and 500 MB per app; upload URL 5 min; pending GC 1 h |
| Accounts | password 8–128; session 30 d; link code 10 min; lockout 10 failures / 15 min |

`DataError { code, status?, details? }`, `isDataError(err)`:

| `code` | HTTP | `error` | Meaning |
|---|---|---|---|
| `UNAUTHORIZED` | 401 | `invalid_token` | install token or `X-App-Session` invalid (`details.code`: `appdata.auth.session_invalid` / `session_expired`); SDK retries once without the session |
| `FORBIDDEN` | 403 | `access_denied` | rule denies; accounts disabled; app suspended |
| `NOT_FOUND` | 404 | `not_found` | collection/document/file/code missing, or another owner's document under `read: owner` |
| `VALIDATION` | 400 | `invalid_request` | schema/query/param error; `details.errors: [{ path, message }]`; `details.code` may be `appdata.query.unindexed_field` |
| `CONFLICT` | 409 | `conflict` | `create` with an existing `id`; username taken |
| `QUOTA` | 413 | `quota_exceeded` | `details.code`: `appdata.quota.documents` / `collections` / `bytes` / `files` / `file_bytes` |
| `RATE_LIMITED` | 429 | `rate_limited` | `Retry-After`; also account lockout and the 4th stream |
| `NETWORK` | — | — | request never reached the gateway; safe to retry when `create` was given an explicit `id` |

### 10.9 React (`@fastrp/phone-app-sdk/data/react`)

```tsx
import { DataProvider, useCollection, useDocument, useAuth } from '@fastrp/phone-app-sdk/data/react';

<DataProvider client={data}>…</DataProvider>
const { items, loading, error, refetch } = useCollection<Note>('notes', { where: [['done', 'eq', false]] }, { realtime: true });
const { doc, loading } = useDocument<Note>('notes', id, { realtime: true });
const { account, subject, accountsEnabled, loading, signIn, signUp, signOut } = useAuth();
```

`realtime: true` lists first, subscribes, applies changes and keeps the query's `orderBy`/`limit` client-side; the stream closes
on unmount.

## 11. Common mistakes to avoid

- Loading the SDK from `public-gateway.fast-rp.com/api/sdk/...` in production → blocked by CSP. Vendor it.
- Reading `context.characterId` as the player id → it is the installId alias; the real character id is never exposed.
- Treating `PERMISSION_DENIED` as a bug and retrying in a loop → `RATE_LIMITED`, then the player gets spammed with sheets.
- Retrying a payment after `TIMEOUT` with a new nonce → possible double charge. Reuse the nonce.
- Fulfilling an order on the `amount` the app sent → verify `GET /v1/apps/payments/{paymentId}` (or the webhook) and match `installId` to the token `sub`.
- `fetch` to a host not in the declaration → silent CSP failure. Declare it (max 10) or proxy through a declared backend.
- Expecting `localStorage` to persist → it does not. `sdk.storage`, App Data, or backend.
- Using `photos.pick().url` with `fetch` → blocked; only `<img src>` works. Your backend may fetch it.
- Calling a 0.3 action (`map.*`, `environment.get`, `browser.open`, `contacts.pick`, `phone.openApp`, `storage.clear`) without `sdk.supports()` → `UNKNOWN_ACTION` on a 0.2 phone.
- Reading `context.locale` / `signal` / `actions` unguarded → `undefined` on a 0.2 phone.
- `orderBy` or a range op on a field that is not in the collection's indexes → `appdata.query.unindexed_field`. Add the index in the portal or sort client-side.
- Shipping a release that writes a new field before widening the schema in the portal → every write `VALIDATION`.
- Enabling accounts after players already wrote data → their `inst:` documents vanish behind `owner` rules once they sign in.
- Assuming `subscribe` replays history or survives a reconnect gap → `list` first, refetch on reconnect.
- `storage.clear()` as "log out" → it also deletes `__fastapp_session` and keys your backend wrote; use `auth.signOut()` and `storage.remove`.
- Deleting a document and assuming its file went with it → files are separate; call `files.remove(id)`.
- Treating a `404` from `/v1/apps/payments/{id}` right after a payment as "no payment" → the record lands asynchronously; retry for a minute or use the webhook.
- Verifying the webhook signature on re-serialised JSON → sign the raw body bytes (`express.raw`).
- Testing only in a browser tab → `whenReady` never resolves. Use the harness.
- Putting the build in a subfolder of the zip → `MISSING_INDEX`.
- Changing permissions after submit and wondering why nothing changed → upload and submit a new package.

## 12. Versions

Protocol line **0.3**; the phone accepts `0.1`, `0.2` and `0.3` guests. A 0.3 SDK on a 0.2 phone works: the 0.3 context
fields are absent and the 0.3 actions answer `UNKNOWN_ACTION`, so gate them with `sdk.supports()`. Breaking changes bump the
major and are announced at https://developers.fast-rp.com/docs/phone-apps/changelog. Pin `@fastrp/phone-app-sdk` to `^0.3`
and run `bun run sync-sdk` after every update so the vendored file matches.
