/**
 * Creates the seeded test member (#136): a `user`-role account with a password, so member features
 * and the Chair/member separation can be tried locally and in CI without an inbox. Idempotent, and
 * it never makes or keeps an admin: an existing account with that email is set back to `user`.
 *
 * Members have no passwords anywhere real. Password sign-in for a member is refused whenever
 * NODE_ENV is production (src/lib/auth-config.ts), so this account only works locally and in CI,
 * and the script itself refuses to run in production without --force.
 *
 * The member's display name and profile row arrive with member_profiles in a later PR of #136.
 */
import { closeDatabase, db } from '@/lib/db-script';
import { createAuth } from '@/lib/auth-config';
import { getSeedMemberEnvironment, isProduction } from '@/lib/env';

const force = process.argv.slice(2).includes('--force');

if (isProduction() && !force) {
  console.error('Refusing to create a seed member in production without --force.');
  process.exit(1);
}

const { email: configuredEmail, password, name } = getSeedMemberEnvironment();
const email = configuredEmail.trim().toLowerCase();

if (password.length < 12) {
  throw new Error('SEED_MEMBER_PASSWORD must be at least 12 characters long.');
}

const chairEmail = process.env.SEED_CHAIR_EMAIL?.trim().toLowerCase();
if (chairEmail && chairEmail === email) {
  throw new Error('SEED_MEMBER_EMAIL must differ from SEED_CHAIR_EMAIL.');
}

const auth = createAuth(db);
const context = await auth.$context;
const existing = await context.internalAdapter.findUserByEmail(email);

if (existing) {
  await context.internalAdapter.updateUser(existing.user.id, { role: 'user', emailVerified: true });
  console.log(`No user created; existing test member ensured: ${email}`);
} else {
  const createdUser = await context.internalAdapter.createUser(
    { email, name, role: 'user', emailVerified: true },
    { method: 'admin' }
  );
  await context.internalAdapter.linkAccount({
    userId: createdUser.id,
    providerId: 'credential',
    accountId: createdUser.id,
    password: await context.password.hash(password),
  });
  console.log(`Created test member: ${email}`);
}

await closeDatabase();
