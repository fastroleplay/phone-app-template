import { createPhoneSDK, type PhoneAppContext } from '@fastrp/phone-app-sdk/client';

/**
 * One SDK instance for the whole app, handed to `<PhoneAppProvider sdk={sdk}>` in `main.tsx`.
 *
 * Created at module load rather than inside a component: the SDK sends its handshake as soon as it
 * exists, and creating it on mount would mean the phone answers before anything is listening.
 * Outside the phone `whenReady()` rejects with `TIMEOUT` after `readyTimeoutMs`, which is how the
 * app knows to show its "open the preview" screen instead of spinning.
 */
export const sdk = createPhoneSDK({ readyTimeoutMs: 2000 });

/**
 * Feeds the phone's palette and safe areas into the CSS variables `styles.css` maps onto shadcn's
 * tokens.
 *
 * Setting variables rather than re-rendering with inline styles is what makes a theme change land
 * everywhere at once — every shadcn component you add reads the same tokens, so none of them need
 * to know the phone exists. `App.tsx` calls this again on every context change, so the
 * `theme.changed` event is handled without any code of its own.
 */
export function applyContext(context: PhoneAppContext): void {
  const root = document.documentElement;

  root.style.colorScheme = context.theme.colorScheme;
  for (const [key, value] of Object.entries(context.theme)) {
    root.style.setProperty(`--phone-${key}`, String(value));
  }

  root.style.setProperty('--safe-top', `${context.viewport.safeAreaTop}px`);
  root.style.setProperty('--safe-bottom', `${context.viewport.safeAreaBottom}px`);
}

/**
 * The preview harness, pointed back at this dev server.
 *
 * Built from `location.origin` rather than a fixed port, because Vite picks a free one and a
 * hard-coded address is wrong the first time 5024 is taken.
 *
 * `VITE_SDK_BASE_URL` overrides the gateway for anyone running it somewhere else.
 */
export function previewUrl(): string {
  const base = import.meta.env.VITE_SDK_BASE_URL ?? 'https://public-gateway.fast-rp.com';
  return `${base}/api/sdk/0.2/preview.html?app=${encodeURIComponent(location.origin)}`;
}
