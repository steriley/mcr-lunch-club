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
import { hasAdminRole, isActiveChair } from '@/lib/roles';

/** Session lifetime and sliding refresh, in seconds. Change here only. */
const SESSION_SETTINGS = {
  expiresIn: 60 * 60 * 24 * 7,
  updateAge: 60 * 60 * 24,
};

/** The passkey plugin's registration endpoints, which need a fresh password check (#153). */
const PASSKEY_REGISTRATION_START = '/passkey/generate-register-options';
const PASSKEY_REGISTRATION_FINISH = '/passkey/verify-registration';

/** The answer to a wrong password, so a refused member looks exactly like a failed sign-in. */
const INVALID_EMAIL_OR_PASSWORD = {
  message: 'Invalid email or password',
  code: 'INVALID_EMAIL_OR_PASSWORD',
} as const;

/**
 * Members have no passwords outside local development and CI (#136): only the seeded test member
 * has one, so it can be signed in as without an inbox. When NODE_ENV is production (every Vercel
 * deployment) a password sign-in for any account that is not a Chair's is refused with the same
 * error as a wrong password, after hashing the password so the refusal takes as long as a real
 * check and doesn't reveal that the email belongs to a member.
 */
async function refuseMemberPasswordInProduction(ctx: AuthMiddlewareContext): Promise<void> {
  if (!isProduction()) return;
  const body = ctx.body as { email?: unknown; password?: unknown } | undefined;
  if (typeof body?.email !== 'string') return;
  const found = await ctx.context.internalAdapter.findUserByEmail(body.email.trim().toLowerCase());
  if (!found || hasAdminRole((found.user as { role?: string | null }).role)) return;
  await ctx.context.password.hash(typeof body.password === 'string' ? body.password : '');
  throw new APIError('UNAUTHORIZED', INVALID_EMAIL_OR_PASSWORD);
}

type AuthMiddlewareContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

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
        if (ctx.path === '/sign-in/email') {
          await refuseMemberPasswordInProduction(ctx);
          return;
        }
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
