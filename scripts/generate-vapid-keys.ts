/**
 * Prints a fresh VAPID key pair for Chairs' push notifications (#115), as .env lines:
 *
 *   pnpm push:keys
 *   pnpm push:keys -- mailto:chairs@example.com     (the VAPID_SUBJECT to print)
 *
 * Production keys go in Vercel's environment variables (README, "Push notifications"). Changing
 * them later invalidates every subscription; each device resubscribes on its next Chairs' Area visit.
 */
import webpush from 'web-push';

const subject = process.argv.slice(2).find((arg) => arg !== '--') ?? 'mailto:chairs@lunch.test';
const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log(`VAPID_SUBJECT=${subject}`);
