import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { admin } from 'better-auth/plugins/admin';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { magicLink } from 'better-auth/plugins/magic-link';
import type { Database } from '@/lib/db-client';
import * as authSchema from '@/db/auth-schema';
import { getAuthEnvironment, getPasskeyEnvironment, isProduction } from '@/lib/env';
import { EMAIL_SIGN_IN_PATHS } from '@/lib/members/auth-paths';
import {
  recordSignInEmailPart,
  SIGN_IN_CODE_ATTEMPTS,
  SIGN_IN_EXPIRES_SECONDS,
} from '@/lib/members/sign-in';
import { consumePasskeyGrant, grantPasskeyRegistration, hasPasskeyGrant } from '@/lib/passkeys';
import { MIN_PASSWORD_LENGTH } from '@/lib/password-policy';
import { hasAdminRole, isActiveChair, isBanned } from '@/lib/roles';

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

/**
 * Endpoints of the email-code plugin that the club never uses (#136): password reset by email,
 * email change, email verification and checking a code without signing in. They are closed over
 * HTTP too (src/lib/members/auth-paths.ts); refusing them here also covers server calls.
 */
const UNUSED_EMAIL_OTP_PATHS = new Set([
  '/email-otp/check-verification-otp',
  '/email-otp/verify-email',
  '/email-otp/request-password-reset',
  '/forget-password/email-otp',
  '/email-otp/reset-password',
  '/email-otp/request-email-change',
  '/email-otp/change-email',
]);

/** A readable hint that someone is signed in, so public pages can skip auth requests (#135). */
const SIGNED_IN_COOKIE = 'signed_in';

type RoleFields = { role?: string | null; banned?: boolean | null; banExpires?: Date | null };

export interface AuthHooks {
  /** A passkey was added to this account. Called once it is saved; never awaited. */
  onPasskeyAdded?: (userId: string) => void;
  /** Whether member accounts are switched on (the `members` flag). Off when not given. */
  membersEnabled?: () => Promise<boolean>;
}

export function createAuth(database: Database, authHooks: AuthHooks = {}) {
  const { secret, url: authUrl, allowedHosts } = getAuthEnvironment();
  const passkeyDomain = getPasskeyEnvironment();
  const membersEnabled = authHooks.membersEnabled ?? (async () => false);

  /** Who may add a passkey: an active Chair, or a member while the flag is on. */
  async function mayRegisterPasskey(user: RoleFields): Promise<boolean> {
    if (isActiveChair(user)) return true;
    return !hasAdminRole(user.role) && !isBanned(user) && (await membersEnabled());
  }

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
        if (UNUSED_EMAIL_OTP_PATHS.has(ctx.path)) {
          throw new APIError('NOT_FOUND', { message: 'Not found' });
        }
        if (ctx.path === '/sign-in/email') {
          await refuseMemberPasswordInProduction(ctx);
          return;
        }
        if (ctx.path !== PASSKEY_REGISTRATION_START && ctx.path !== PASSKEY_REGISTRATION_FINISH) {
          return;
        }
        const session = await getSessionFromCtx(ctx);
        if (!session) throw new APIError('UNAUTHORIZED', { message: 'Unauthorized' });
        if (!(await mayRegisterPasskey(session.user as RoleFields))) {
          throw new APIError('FORBIDDEN', { message: 'This account can’t add a passkey.' });
        }
        // A grant comes from a password check (Chairs) or a fresh email sign-in (members, #136).
        if (!(await hasPasskeyGrant(database, session.user.id))) {
          throw new APIError('FORBIDDEN', {
            message: hasAdminRole((session.user as RoleFields).role)
              ? 'Confirm your password before adding a passkey.'
              : 'Sign in again by email before adding a passkey.',
            code: 'PASSKEY_PASSWORD_REQUIRED',
          });
        }
        // One password check, one passkey: the grant is used up as registration finishes.
        if (ctx.path === PASSKEY_REGISTRATION_FINISH) {
          await consumePasskeyGrant(database, session.user.id);
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        // The readable signed-in hint follows the session cookie (epic #135, performance budget).
        if (ctx.context.newSession) {
          ctx.setCookie(SIGNED_IN_COOKIE, '1', {
            path: '/',
            sameSite: 'lax',
            secure: isProduction(),
            httpOnly: false,
            maxAge: SESSION_SETTINGS.expiresIn,
          });
        } else if (ctx.path === '/sign-out') {
          ctx.setCookie(SIGNED_IN_COOKIE, '', { path: '/', maxAge: 0 });
        }

        if (ctx.path !== PASSKEY_REGISTRATION_FINISH) return;
        if (ctx.context.returned instanceof Error) return;
        const session = await getSessionFromCtx(ctx);
        if (session) authHooks.onPasskeyAdded?.(session.user.id);
      }),
    },
    databaseHooks: {
      session: {
        create: {
          /**
           * Chairs never sign in by email (#136): an inbox must not be a way into the Chairs'
           * Area. The request route never sends them a link or code; this refuses one anyway.
           * While the members flag is off, members can't sign in by passkey either.
           */
          before: async (session, ctx) => {
            const path = ctx?.path;
            if (!path) return;
            const viaEmail = EMAIL_SIGN_IN_PATHS.has(path);
            const viaPasskey = path === '/passkey/verify-authentication';
            if (!viaEmail && !viaPasskey) return;
            const user = (await ctx.context.internalAdapter.findUserById(
              session.userId
            )) as RoleFields | null;
            const chair = hasAdminRole(user?.role);
            if (viaEmail && chair) {
              throw new APIError('FORBIDDEN', {
                message: 'Chairs sign in with their password or passkey.',
                code: 'CHAIR_EMAIL_SIGN_IN',
              });
            }
            if (!chair && !(await membersEnabled())) {
              throw new APIError('NOT_FOUND', { message: 'Not found' });
            }
          },
          /** An email sign-in lets a member add a passkey for the next few minutes. */
          after: async (session, ctx) => {
            if (ctx?.path && EMAIL_SIGN_IN_PATHS.has(ctx.path)) {
              await grantPasskeyRegistration(database, session.userId);
            }
          },
        },
      },
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
        // Member email sign-in: the code has its own 5-attempt limit; this caps guessing per IP.
        '/sign-in/email-otp': { window: 60, max: 10 },
        '/magic-link/verify': { window: 60, max: 10 },
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
      // Member sign-in by email (#136). Both callbacks only hand their part to the request route,
      // which sends one email with the link and the code (src/lib/members/sign-in.ts).
      magicLink({
        expiresIn: SIGN_IN_EXPIRES_SECONDS,
        storeToken: 'hashed',
        sendMagicLink: async ({ url }) => {
          if (!recordSignInEmailPart({ url }))
            console.warn('[members] Magic link not sent: no request.');
        },
      }),
      emailOTP({
        otpLength: 6,
        expiresIn: SIGN_IN_EXPIRES_SECONDS,
        allowedAttempts: SIGN_IN_CODE_ATTEMPTS,
        storeOTP: 'hashed',
        sendVerificationOTP: async ({ otp, type }) => {
          if (type !== 'sign-in' || !recordSignInEmailPart({ otp })) {
            console.warn('[members] Sign-in code not sent: no request.');
          }
        },
      }),
    ],
  });
}
