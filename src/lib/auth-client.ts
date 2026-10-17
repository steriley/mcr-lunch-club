import { createAuthClient } from 'better-auth/vue';

const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4321';

export const authClient = createAuthClient({
  baseURL: baseUrl,
});

export function getAuthClient() {
  return createAuthClient({
    baseURL: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4321',
  });
}
