import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins/admin';
import type { db as runtimeDb } from '@/lib/db';
import * as authSchema from '@/db/auth-schema';
import { getAuthEnvironment } from '@/lib/env';

export function createAuth(database: typeof runtimeDb) {
  const { secret, url: authUrl } = getAuthEnvironment();
  const trustedOrigins = Array.from(
    new Set([
      'http://localhost:4321',
      'http://127.0.0.1:4321',
      new URL(authUrl).origin
    ])
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
      minPasswordLength: 12
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 10,
      max: 10
    },
    plugins: [
      admin({
        defaultRole: 'user',
        adminRoles: ['admin']
      })
    ]
  });
}
