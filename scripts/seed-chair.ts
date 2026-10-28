import { closeDatabase, db } from '@/lib/db-script';
import { createAuth } from '@/lib/auth-config';
import { getSeedChairEnvironment, isProduction } from '@/lib/env';

const auth = createAuth(db);
const context = await auth.$context;
const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const resetPassword = args.has('--reset-password');

if (isProduction() && !force) {
  console.error('Refusing to create a seed chair in production without --force.');
  process.exit(1);
}

const { email: configuredEmail, password, name } = getSeedChairEnvironment();
const email = configuredEmail.trim().toLowerCase();

if (password.length < 12) {
  throw new Error('SEED_CHAIR_PASSWORD must be at least 12 characters long.');
}

const existing = await context.internalAdapter.findUserByEmail(email);

if (existing) {
  await context.internalAdapter.updateUser(existing.user.id, { role: 'admin' });

  if (resetPassword) {
    const hashedPassword = await context.password.hash(password);
    if (await context.internalAdapter.findCredentialAccount(existing.user.id)) {
      await context.internalAdapter.updatePassword(existing.user.id, hashedPassword);
    } else {
      await context.internalAdapter.linkAccount({
        userId: existing.user.id,
        providerId: 'credential',
        accountId: existing.user.id,
        password: hashedPassword,
      });
    }
  }

  console.log(`No user created; existing Chair ensured: ${email}`);
} else {
  const hashedPassword = await context.password.hash(password);
  const createdUser = await context.internalAdapter.createUser(
    {
      email,
      name,
      role: 'admin',
      emailVerified: true,
    },
    { method: 'admin' }
  );

  await context.internalAdapter.linkAccount({
    userId: createdUser.id,
    providerId: 'credential',
    accountId: createdUser.id,
    password: hashedPassword,
  });

  console.log(`Created Chair: ${email}`);
}

await closeDatabase();
