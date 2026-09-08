import { createDataClient, createMemoryDataTransport } from '@fastrp/phone-app-sdk/data';
import { sdk } from './phone';

/**
 * App Data client — the platform-hosted database behind `/v1/data`.
 *
 * In `bun run dev` the app runs inside the preview harness, whose fake token the real API rejects,
 * so development talks to an in-memory transport instead: same API, data lives until reload.
 * A production build has no transport override and goes to the platform with the install token.
 */
export const data = createDataClient(
  { sdk },
  { transport: import.meta.env.DEV ? createMemoryDataTransport() : undefined },
);
