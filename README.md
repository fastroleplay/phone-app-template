# Fast:V Phone App Template

A starting point for an app that runs inside the in-game phone. Clone it, change the name, ship it.

```bash
bun install
bun run dev
```

Then open the preview harness with the dev server's address — the app's own "outside the phone"
screen links to it, or:

```
https://public-gateway.fast-rp.com/api/sdk/0.2/preview.html?app=http://localhost:5024
```

`preview.html` in this repo is the same file for offline use.

```bash
bun run pack     # syncs the SDK into public/, builds, and writes app.zip — the file you upload
```

The dev server allows requests from an opaque origin (`server.cors` in `vite.config.ts`). It has
to: the harness frames your app sandboxed, the way the phone does, so every request it makes
carries `Origin: null` and Vite refuses those by default — which fails every module script before
your app runs a line.

## What you get

React + TypeScript + Tailwind v4 + shadcn/ui wired to `@fastrp/phone-app-sdk/react`, a `pack`
script that writes the zip the developer portal accepts, and shadcn tokens mapped to the phone's
palette and safe areas through CSS variables (`src/phone.ts` → `src/styles.css`), so every
component you add with `bunx shadcn@latest add <name>` already follows the phone's theme.

```
index.html        loads the SDK, then your app
icon.png          artwork to upload in the portal — not part of the package
public/           copied into dist/ as-is; fastapp-sdk.js is synced here and is not committed
src/phone.ts      one SDK instance, theme and safe areas as CSS variables
src/main.tsx      PhoneAppProvider around the app
src/App.tsx       the example: context, storage, a permission request, events
scripts/pack.mjs  syncs the SDK (--sync-sdk) and zips dist/
preview.html      a fake phone for local development
```

## Read next

Everything else is documented once, on the developer site; this README does not repeat it.

- What a phone app is and how the sandbox works: <https://developers.fast-rp.com/docs/phone-apps>
- From clone to a running app in the preview: <https://developers.fast-rp.com/docs/phone-apps/quickstart>
- The harness, CORS, and the in-game `fastapp:<slug>` test channel: <https://developers.fast-rp.com/docs/phone-apps/local-dev>
- Permissions, domains, and why there is no `app.json`: <https://developers.fast-rp.com/docs/phone-apps/declaration>
- Upload, review, release numbers and rollback: <https://developers.fast-rp.com/docs/phone-apps/publishing>
