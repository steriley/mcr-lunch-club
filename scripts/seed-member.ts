/**
 * Creates the seeded test member (#136): a `user`-role account with a password, so member features
 * and the Chair/member separation can be tried locally and in CI without an inbox. Idempotent: an
 * existing member with that email keeps its account, and its password is set to
 * SEED_MEMBER_PASSWORD so sign-in always works. It never touches a Chair: if the email belongs to an
 * admin account, it stops rather than demote someone who may be a real Chair.
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
import { hasAdminRole } from '@/lib/roles';

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

if (existing && hasAdminRole((existing.user as { role?: string | null }).role)) {
  console.error(`Refusing: ${email} belongs to a Chair. Choose another SEED_MEMBER_EMAIL.`);
  await closeDatabase();
  process.exit(1);
}

if (existing) {
  const userId = existing.user.id;
  await context.internalAdapter.updateUser(userId, { role: 'user', emailVerified: true });
  const hashedPassword = await context.password.hash(password);
  if (await context.internalAdapter.findCredentialAccount(userId)) {
    await context.internalAdapter.updatePassword(userId, hashedPassword);
  } else {
    await context.internalAdapter.linkAccount({
      userId,
      providerId: 'credential',
      accountId: userId,
      password: hashedPassword,
    });
  }
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
