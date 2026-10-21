import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins/admin';
import type { Database } from '@/lib/db-client';
import * as authSchema from '@/db/auth-schema';
import { getAuthEnvironment, getPreviewOrigins, isProduction } from '@/lib/env';
import { MIN_PASSWORD_LENGTH } from '@/lib/password-policy';

/** Session lifetime and sliding refresh, in seconds. Change here only. */
export const SESSION_SETTINGS = {
  expiresIn: 60 * 60 * 24 * 7,
  updateAge: 60 * 60 * 24,
};

export function createAuth(database: Database) {
  const { secret, url: authUrl } = getAuthEnvironment();
  const siteOrigin = new URL(authUrl).origin;
  const trustedOrigins = Array.from(
    new Set(
      isProduction()
        ? [siteOrigin, ...getPreviewOrigins()]
        : ['http://localhost:4321', 'http://127.0.0.1:4321', siteOrigin]
    )
  );

  return betterAuth({
    appName: 'MCR Lunch Club',
    baseURL: authUrl,
    secret,
    trustedOrigins,
    database: drizzleAdapter(database, {
      provider: 'pg',
      schema: authSchema
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH
    },
    session: SESSION_SETTINGS,
    advanced: {
      useSecureCookies: isProduction(),
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction()
      }
    },
    rateLimit: {
      // Database storage so limits persist across serverless invocations.
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/change-password': { window: 60, max: 5 }
      }
    },
    plugins: [
      admin({
        defaultRole: 'user',
        adminRoles: ['admin']
      })
    ]
  });
}
