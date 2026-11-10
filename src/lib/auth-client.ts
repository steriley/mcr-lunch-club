import { createAuthClient } from 'better-auth/vue';
import { passkeyClient } from '@better-auth/passkey/client';
import { adminClient } from 'better-auth/client/plugins';

// Calls are only made from the browser; the fallback just satisfies SSR of islands.
export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4321',
  plugins: [adminClient(), passkeyClient()],
});
