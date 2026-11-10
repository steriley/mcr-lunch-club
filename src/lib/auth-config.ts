import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { admin } from 'better-auth/plugins/admin';
import type { Database } from '@/lib/db-client';
import * as authSchema from '@/db/auth-schema';
import { getAuthEnvironment, getPasskeyEnvironment, isProduction } from '@/lib/env';
import { consumePasskeyGrant, hasPasskeyGrant } from '@/lib/passkeys';
import { MIN_PASSWORD_LENGTH } from '@/lib/password-policy';
import { isActiveChair } from '@/lib/roles';

/** Session lifetime and sliding refresh, in seconds. Change here only. */
const SESSION_SETTINGS = {
  expiresIn: 60 * 60 * 24 * 7,
  updateAge: 60 * 60 * 24,
};

/** The passkey plugin's registration endpoints, which need a fresh password check (#153). */
const PASSKEY_REGISTRATION_START = '/passkey/generate-register-options';
const PASSKEY_REGISTRATION_FINISH = '/passkey/verify-registration';

export interface AuthHooks {
  /** A passkey was added to this account. Called once it is saved; never awaited. */
  onPasskeyAdded?: (userId: string) => void;
}

export function createAuth(database: Database, authHooks: AuthHooks = {}) {
  const { secret, url: authUrl, allowedHosts } = getAuthEnvironment();
  const passkeyDomain = getPasskeyEnvironment();

  return betterAuth({
    appName: 'MCR Lunch Club',
    // Resolved per request from the Host header, so the custom domain and the
    // Vercel URLs all work; each allowed host is also a trusted origin.
    baseURL: {
      allowedHosts: isProduction()
        ? allowedHosts
        : [...allowedHosts, 'localhost:4321', '127.0.0.1:4321'],
      fallback: authUrl,
      protocol: isProduction() ? 'https' : 'auto',
    },
    secret,
    database: drizzleAdapter(database, {
      provider: 'pg',
      schema: authSchema,
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
    },
    session: {
      ...SESSION_SETTINGS,
      // Better Auth's own freshness rule (session created within a day) would stop a Chair who
      // signed in two days ago from adding a passkey even after confirming their password. The
      // passkey hooks below require a password check instead, which is stricter. Nothing else in
      // the app calls a "fresh session" endpoint; anything that does later needs its own check.
      freshAge: 0,
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== PASSKEY_REGISTRATION_START && ctx.path !== PASSKEY_REGISTRATION_FINISH) {
          return;
        }
        const session = await getSessionFromCtx(ctx);
        if (!session) throw new APIError('UNAUTHORIZED', { message: 'Unauthorized' });
        // Members (#136) get their own registration rules; for now only Chairs add passkeys.
        if (!isActiveChair(session.user as Parameters<typeof isActiveChair>[0])) {
          throw new APIError('FORBIDDEN', { message: 'Only Chairs can add passkeys.' });
        }
        if (!(await hasPasskeyGrant(database, session.user.id))) {
          throw new APIError('FORBIDDEN', {
            message: 'Confirm your password before adding a passkey.',
            code: 'PASSKEY_PASSWORD_REQUIRED',
          });
        }
        // One password check, one passkey: the grant is used up as registration finishes.
        if (ctx.path === PASSKEY_REGISTRATION_FINISH) {
          await consumePasskeyGrant(database, session.user.id);
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== PASSKEY_REGISTRATION_FINISH) return;
        if (ctx.context.returned instanceof Error) return;
        const session = await getSessionFromCtx(ctx);
        if (session) authHooks.onPasskeyAdded?.(session.user.id);
      }),
    },
    advanced: {
      useSecureCookies: isProduction(),
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction(),
      },
    },
    rateLimit: {
      // Database storage so limits persist across serverless invocations.
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/change-password': { window: 60, max: 5 },
        // Passkey sign-in. The options request runs on every sign-in page load (autofill).
        '/passkey/generate-authenticate-options': { window: 60, max: 20 },
        '/passkey/verify-authentication': { window: 60, max: 5 },
        [PASSKEY_REGISTRATION_START]: { window: 60, max: 5 },
        [PASSKEY_REGISTRATION_FINISH]: { window: 60, max: 5 },
      },
    },
    plugins: [
      admin({
        defaultRole: 'user',
        adminRoles: ['admin'],
      }),
      passkey({
        rpID: passkeyDomain.rpID,
        rpName: 'MCR Lunch Club',
        origin: passkeyDomain.origin,
      }),
    ],
  });
}
