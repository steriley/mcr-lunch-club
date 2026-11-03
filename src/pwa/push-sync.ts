/**
 * Loaded by the Chairs' Area layout for a signed-in Chair. Keeps this device's push subscription
 * in step with the server (key rotation, revoked permission) and sets the app badge. Production
 * builds only: `pnpm dev` registers no service worker.
 */
import { refreshAppBadge, syncThisDevice } from '@/pwa/push-client';

const publicKey = document.querySelector('meta[name="mcr-push-key"]')?.getAttribute('content');

if (publicKey && import.meta.env.PROD) {
  void syncThisDevice(publicKey).catch(() => {
    /* offline or refused: the next visit tries again */
  });
  void refreshAppBadge().catch(() => undefined);
}
