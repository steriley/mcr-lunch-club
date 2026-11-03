import { authClient } from '@/lib/auth-client';
import { forgetThisDevice } from '@/pwa/push-client';

/** Sign the Chair out, forgetting this device's push subscription first, then go to the sign-in page. */
export async function signOut(): Promise<void> {
  try {
    // While still signed in, so the server knows whose device to forget.
    await forgetThisDevice();
    await authClient.signOut();
  } catch (error) {
    console.error('Failed to sign out.', error);
  } finally {
    window.location.assign('/admin/login');
  }
}
